/**
 * Acesso a dados do módulo de treinos.
 *
 * As rotas montavam as queries inline, o que impedia reutilizar operações
 * compostas (como iniciar uma sessão a partir de um template) e tornava
 * impossível testá-las.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Enums } from "@/integrations/supabase/types";
import { assertOk, num, unwrap, unwrapList } from "@/data/supabase-helpers";
import { countsTowardVolume, epley1RM, type MuscleSetEntry } from "@forja/domain";
import { formatDate, localDayRange, toISODate } from "@/lib/date";

/** Defaults de template, alinhados com os do banco. */
const DEFAULT_TARGET_SETS = 3;
const DEFAULT_TARGET_REPS = 10;
const DEFAULT_REST_SECONDS = 90;
/** Teto de segurança: um template corrompido não deve gerar centenas de linhas. */
const MAX_SETS_PER_EXERCISE = 12;

export type LastPerformance = {
  exerciseId: string;
  weightKg: number | null;
  reps: number | null;
};

/**
 * Última série registrada pelo usuário para cada exercício informado.
 *
 * Usada para pré-preencher a sessão. Uma única consulta cobre todos os
 * exercícios do template — antes era uma requisição por exercício adicionado.
 */
export async function fetchLastPerformances(
  userId: string,
  exerciseIds: readonly string[],
): Promise<Map<string, LastPerformance>> {
  const byExercise = new Map<string, LastPerformance>();
  if (exerciseIds.length === 0) return byExercise;

  const rows = unwrapList(
    "buscar histórico dos exercícios",
    await supabase
      .from("workout_sets")
      .select("exercise_id, weight_kg, reps, created_at, workout_sessions!inner(user_id)")
      .in("exercise_id", exerciseIds as string[])
      .eq("workout_sessions.user_id", userId)
      .not("weight_kg", "is", null)
      .order("created_at", { ascending: false })
      .limit(exerciseIds.length * 20),
  );

  // As linhas vêm da mais recente para a mais antiga: a primeira de cada
  // exercício já é a que interessa.
  for (const row of rows) {
    if (byExercise.has(row.exercise_id)) continue;
    byExercise.set(row.exercise_id, {
      exerciseId: row.exercise_id,
      weightKg: row.weight_kg === null ? null : num(row.weight_kg),
      reps: row.reps === null ? null : num(row.reps),
    });
  }

  return byExercise;
}

/** Cria uma sessão em branco ("treino rápido"). */
export async function startBlankSession(userId: string): Promise<string> {
  const session = unwrap(
    "criar treino",
    await supabase
      .from("workout_sessions")
      .insert({ user_id: userId, name: `Treino ${formatDate(new Date(), "dd/MM HH:mm")}` })
      .select("id")
      .single(),
  );
  return session.id;
}

/**
 * Cria uma sessão a partir de um template **copiando os exercícios**.
 *
 * Antes, `startFromTemplate` copiava apenas o nome e gravava `template_id`: a
 * sessão nascia vazia e o usuário precisava readicionar tudo à mão, o que
 * anulava o propósito do template.
 *
 * Cada exercício gera `target_sets` séries com `completed: false`, na ordem do
 * template, pré-preenchidas com o desempenho da última vez.
 */
export async function startSessionFromTemplate(
  userId: string,
  templateId: string,
): Promise<string> {
  const template = unwrap(
    "carregar template",
    await supabase.from("workout_templates").select("id, name").eq("id", templateId).single(),
  );

  const items = unwrapList(
    "carregar exercícios do template",
    await supabase
      .from("workout_template_exercises")
      .select(
        "exercise_id, position, target_sets, target_reps, rest_seconds, superset_group, notes",
      )
      .eq("template_id", templateId)
      .order("position"),
  );

  const session = unwrap(
    "criar treino",
    await supabase
      .from("workout_sessions")
      .insert({ user_id: userId, template_id: templateId, name: template.name || "Treino" })
      .select("id")
      .single(),
  );

  if (items.length === 0) return session.id;

  const lastByExercise = await fetchLastPerformances(
    userId,
    items.map((i) => i.exercise_id),
  );

  const rows = items.flatMap((item, index) => {
    const targetSets = clamp(num(item.target_sets, DEFAULT_TARGET_SETS), 1, MAX_SETS_PER_EXERCISE);
    const targetReps = num(item.target_reps, DEFAULT_TARGET_REPS) || null;
    const rest = num(item.rest_seconds, DEFAULT_REST_SECONDS) || null;
    const last = lastByExercise.get(item.exercise_id);

    return Array.from({ length: targetSets }, (_, i) => ({
      session_id: session.id,
      exercise_id: item.exercise_id,
      // Reindexa a posição: um template com posições esparsas (efeito do swap
      // com valor temporário) geraria buracos na sessão.
      position: index + 1,
      set_index: i + 1,
      set_type: "working" as const,
      weight_kg: last?.weightKg ?? null,
      reps: last?.reps ?? targetReps,
      rest_seconds: rest,
      completed: false,
      // Preserva a supersérie definida no template. Antes a coluna existia só
      // do lado do template e o agrupamento se perdia ao iniciar o treino.
      superset_group: item.superset_group ?? null,
    }));
  });

  // Se a cópia das séries falhar, a sessão vazia já criada seria lixo — desfaz.
  const insert = await supabase.from("workout_sets").insert(rows);
  if (insert.error) {
    await supabase.from("workout_sessions").delete().eq("id", session.id);
    assertOk("copiar exercícios do template", insert);
  }

  return session.id;
}

/**
 * Melhor e1RM histórico do usuário para um exercício, considerando apenas
 * séries válidas. Base do cálculo de recorde pessoal.
 */
export async function fetchBestE1rm(userId: string, exerciseId: string): Promise<number> {
  const rows = unwrapList(
    "buscar recorde do exercício",
    await supabase
      .from("workout_sets")
      .select("weight_kg, reps, set_type, completed, workout_sessions!inner(user_id)")
      .eq("exercise_id", exerciseId)
      .eq("workout_sessions.user_id", userId)
      .eq("completed", true)
      .neq("set_type", "warmup")
      .not("weight_kg", "is", null)
      .limit(500),
  );

  return rows.reduce((best, s) => {
    const e1rm = epley1RM(num(s.weight_kg), num(s.reps));
    return e1rm > best ? e1rm : best;
  }, 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export type PersonalRecord = {
  exerciseId: string;
  exerciseName: string;
  weightKg: number;
  reps: number;
  /** 1RM estimado (Epley) — o que define "recorde" em `finishWorkout`. */
  e1rm: number;
  date: string;
};

/**
 * O recorde mais recente de cada exercício.
 *
 * Lê só as séries marcadas como PR (índice parcial `idx_workout_sets_pr`):
 * como cada PR supera o anterior, o mais recente por exercício é o atual.
 */
export async function fetchPersonalRecords(limit = 8): Promise<PersonalRecord[]> {
  const rows = unwrapList(
    "carregar recordes",
    await supabase
      .from("workout_sets")
      .select(
        "exercise_id, weight_kg, reps, exercises(name), workout_sessions!inner(started_at, deleted_at)",
      )
      .eq("is_pr", true)
      .is("workout_sessions.deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(300),
  );

  const porExercicio = new Map<string, PersonalRecord>();
  for (const r of rows) {
    if (porExercicio.has(r.exercise_id)) continue;
    const weightKg = num(r.weight_kg);
    const reps = num(r.reps);
    porExercicio.set(r.exercise_id, {
      exerciseId: r.exercise_id,
      exerciseName: r.exercises?.name ?? "Exercício",
      weightKg,
      reps,
      e1rm: epley1RM(weightKg, reps),
      date: r.workout_sessions.started_at,
    });
  }
  return [...porExercicio.values()].slice(0, limit);
}

/**
 * Séries efetivas por músculo e dia local nas últimas `weeks` semanas, para o
 * progresso por parte do corpo. Mesma convenção da recuperação: músculo
 * primário conta 1 série, secundário meia.
 */
export async function fetchMuscleSetEntries(weeks = 8): Promise<MuscleSetEntry[]> {
  const hoje = new Date();
  const inicio = new Date(hoje);
  inicio.setDate(hoje.getDate() - 7 * weeks);
  const { start, endExclusive } = localDayRange(toISODate(inicio), toISODate(hoje));

  const rows = unwrapList(
    "carregar séries por músculo",
    await supabase
      .from("workout_sets")
      .select(
        "set_type, completed, exercises(primary_muscle, secondary_muscles), workout_sessions!inner(started_at, deleted_at, ended_at)",
      )
      .is("workout_sessions.deleted_at", null)
      .not("workout_sessions.ended_at", "is", null)
      .gte("workout_sessions.started_at", start)
      .lt("workout_sessions.started_at", endExclusive)
      .limit(5000),
  );

  const entries: MuscleSetEntry[] = [];
  for (const r of rows) {
    const valida = countsTowardVolume({
      weightKg: null,
      reps: null,
      setType: r.set_type,
      completed: r.completed,
    });
    if (!r.exercises || !valida) {
      continue;
    }
    const day = toISODate(new Date(r.workout_sessions.started_at));
    entries.push({ muscle: r.exercises.primary_muscle, day, sets: 1 });
    for (const m of r.exercises.secondary_muscles ?? [])
      entries.push({ muscle: m, day, sets: 0.5 });
  }
  return entries;
}

/**
 * Exercício próprio — para o aparelho da sua academia que não está no catálogo.
 * Fica privado (`is_public = false`) e entra no mapa corporal pelo músculo
 * principal.
 */
export async function createOwnExercise(
  userId: string,
  input: { name: string; primaryMuscle: Enums<"muscle_t">; equipment: Enums<"equipment_t"> },
): Promise<string> {
  const exercicio = unwrap(
    "criar exercício",
    await supabase
      .from("exercises")
      .insert({
        owner_id: userId,
        is_public: false,
        name: input.name.trim(),
        primary_muscle: input.primaryMuscle,
        equipment: input.equipment,
      })
      .select("id")
      .single(),
  );
  assertOk(
    "registrar músculo do exercício",
    await supabase
      .from("exercise_muscles")
      .insert({ exercise_id: exercicio.id, muscle: input.primaryMuscle, contribution: 1 }),
  );
  return exercicio.id;
}
