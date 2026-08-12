/**
 * Acesso a dados do módulo de treinos.
 *
 * As rotas montavam as queries inline, o que impedia reutilizar operações
 * compostas (como iniciar uma sessão a partir de um template) e tornava
 * impossível testá-las.
 */
import { supabase } from "@/integrations/supabase/client";
import { assertOk, num, unwrap, unwrapList } from "@/data/supabase-helpers";
import { epley1RM } from "@forja/domain";
import { formatDate } from "@/lib/date";

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
