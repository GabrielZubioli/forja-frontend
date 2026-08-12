/**
 * Recuperação muscular a partir do histórico real de treinos.
 *
 * Converte as séries registradas nos últimos dias em estímulos por músculo e
 * entrega ao modelo puro de `@forja/domain`. A conversão precisa acontecer aqui
 * porque depende do catálogo (quais músculos cada exercício atinge), que é dado
 * de banco.
 */
import { supabase } from "@/integrations/supabase/client";
import { num, unwrapList } from "@/data/supabase-helpers";
import { toISODate } from "@/lib/date";
import {
  computeMuscleRecovery,
  countsTowardVolume,
  type Muscle,
  type MuscleRecovery,
  type MuscleStimulus,
} from "@forja/domain";
import { subDays } from "date-fns";

/**
 * Janela observada. Além de ~7 dias qualquer músculo já estaria recuperado
 * pelo modelo (teto de 96h), então buscar mais só custaria banda.
 */
const WINDOW_DAYS = 8;

/**
 * Peso do estímulo em músculos secundários.
 *
 * Um supino fatiga o tríceps de verdade, mas menos que o peito. Meia série é a
 * convenção usual para contabilizar volume indireto — e é a mesma ordem de
 * grandeza usada em `aggregateMuscleVolume`.
 */
const SECONDARY_WEIGHT = 0.5;

type SetRow = {
  set_type: string | null;
  completed: boolean | null;
  weight_kg: number | string | null;
  reps: number | string | null;
  exercises: { primary_muscle: string; secondary_muscles: string[] | null } | null;
  workout_sessions: { started_at: string; ended_at: string | null } | null;
};

/** Recuperação estimada de cada músculo treinado na janela recente. */
export async function fetchMuscleRecovery(userId: string): Promise<MuscleRecovery[]> {
  const from = toISODate(subDays(new Date(), WINDOW_DAYS));

  const rows = unwrapList(
    "carregar histórico para recuperação",
    await supabase
      .from("workout_sets")
      .select(
        "set_type, completed, weight_kg, reps, exercises(primary_muscle, secondary_muscles), workout_sessions!inner(user_id, started_at, ended_at, deleted_at)",
      )
      .eq("workout_sessions.user_id", userId)
      .is("workout_sessions.deleted_at", null)
      .gte("workout_sessions.started_at", `${from}T00:00:00`)
      .limit(2000),
  ) as unknown as SetRow[];

  const stimuli: MuscleStimulus[] = [];

  for (const row of rows) {
    const session = row.workout_sessions;
    const exercise = row.exercises;
    if (!session || !exercise) continue;

    // Mesma regra de "série válida" usada no volume: aquecimento e séries não
    // concluídas não geram fadiga relevante.
    if (
      !countsTowardVolume({
        weightKg: row.weight_kg,
        reps: row.reps,
        setType: row.set_type,
        completed: row.completed,
      })
    ) {
      continue;
    }

    // A fadiga conta a partir do fim do treino, não do início — uma sessão de
    // duas horas iniciada às 18h termina às 20h.
    const at = session.ended_at ?? session.started_at;

    stimuli.push({ muscle: exercise.primary_muscle as Muscle, at, sets: 1 });
    for (const secondary of exercise.secondary_muscles ?? []) {
      stimuli.push({ muscle: secondary as Muscle, at, sets: SECONDARY_WEIGHT });
    }
  }

  return computeMuscleRecovery(stimuli);
}

/**
 * Músculos que cada template treina, para cruzar com a recuperação e recomendar
 * a próxima divisão.
 */
export async function fetchTemplateMuscles(
  templateIds: readonly string[],
): Promise<Map<string, Muscle[]>> {
  const byTemplate = new Map<string, Muscle[]>();
  if (templateIds.length === 0) return byTemplate;

  const rows = unwrapList(
    "carregar músculos das divisões",
    await supabase
      .from("workout_template_exercises")
      .select("template_id, exercises(primary_muscle)")
      .in("template_id", templateIds as string[]),
  ) as unknown as { template_id: string; exercises: { primary_muscle: string } | null }[];

  for (const row of rows) {
    if (!row.exercises) continue;
    const atual = byTemplate.get(row.template_id) ?? [];
    const muscle = row.exercises.primary_muscle as Muscle;
    // Sem repetições: a média de recuperação da divisão não deve pesar duas
    // vezes o mesmo músculo só porque há dois exercícios para ele.
    if (!atual.includes(muscle)) atual.push(muscle);
    byTemplate.set(row.template_id, atual);
  }

  return byTemplate;
}

/** Converte a razão de recuperação numa cor semântica do design system. */
export function recoveryColor(status: MuscleRecovery["status"]): string {
  switch (status) {
    case "recovered":
      return "var(--success)";
    case "recovering":
      return "var(--chart-4)";
    case "fatigued":
      return "var(--destructive)";
  }
}

export const RECOVERY_STATUS_LABELS: Record<MuscleRecovery["status"], string> = {
  recovered: "Pronto",
  recovering: "Em recuperação",
  fatigued: "Fatigado",
};

/** Descreve o tempo restante de forma apresentável. */
export function describeRemaining(recovery: MuscleRecovery): string {
  if (recovery.hoursRemaining <= 0) return "pronto para treinar";
  if (recovery.hoursRemaining < 24) return `~${recovery.hoursRemaining}h para recuperar`;
  const dias = Math.round(recovery.hoursRemaining / 24);
  return `~${dias} ${dias === 1 ? "dia" : "dias"} para recuperar`;
}

/** `num` reexportado para os consumidores que formatam séries. */
export { num };
