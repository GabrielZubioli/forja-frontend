import { supabase } from "@/integrations/supabase/client";
import { assertOk, num, unwrap, unwrapList } from "@/data/supabase-helpers";

/**
 * A semana de treino: divisões, exercícios e o que cada um estimula.
 *
 * Carrega tudo de uma vez, e não uma consulta por divisão. Uma rotina de 5 dias
 * com 7 exercícios cada renderia 5 idas ao servidor só para desenhar a tela —
 * e no celular, em rede de academia, isso é a diferença entre instantâneo e
 * perceptível.
 */

export interface WeekExercise {
  /** Id da linha em `workout_template_exercises`. */
  itemId: string;
  exerciseId: string;
  name: string;
  position: number;
  targetSets: number;
  targetReps: number;
  targetRepMin: number | null;
  targetRepMax: number | null;
  restSeconds: number;
  targetRpe: number | null;
  cadence: string | null;
  notes: string | null;
  supersetGroup: number | null;

  equipment: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  level: string | null;
  mechanic: string | null;
  imageUrls: string[];
  /** Contribuição por músculo, para o mapa corporal. */
  muscles: { muscle: string; contribution: number }[];
}

export interface WeekSplit {
  templateId: string;
  letter: string | null;
  /** Ícone escolhido (chave de `ROUTINE_ICONS`); null = palpite pelo nome. */
  icon: string | null;
  name: string;
  order: number;
  /** Dias da divisão na semana fixa (0 = domingo). */
  weekdays: number[];
  exercises: WeekExercise[];
}

export interface WorkoutWeek {
  routineId: string;
  routineName: string;
  daysPerWeek: number;
  currentIndex: number;
  trainingWeekdays: number[];
  scheduleMode: "rotation" | "fixed";
  splits: WeekSplit[];
}

export async function fetchWorkoutWeek(): Promise<WorkoutWeek | null> {
  const routine = unwrapList(
    "carregar rotina",
    await supabase
      .from("workout_routines")
      .select("id, name, days_per_week, current_index, training_weekdays, schedule_mode")
      .eq("is_active", true)
      .is("deleted_at", null)
      .limit(1),
  )[0];

  if (!routine) return null;

  const templates = unwrapList(
    "carregar divisões",
    await supabase
      .from("workout_templates")
      .select("id, name, icon, routine_letter, routine_order, weekdays")
      .eq("routine_id", routine.id)
      .is("deleted_at", null)
      .order("routine_order"),
  );

  if (templates.length === 0) {
    return {
      routineId: routine.id,
      routineName: routine.name,
      daysPerWeek: routine.days_per_week,
      currentIndex: routine.current_index,
      trainingWeekdays: routine.training_weekdays ?? [],
      scheduleMode: routine.schedule_mode === "fixed" ? "fixed" : "rotation",
      splits: [],
    };
  }

  // Uma consulta para os itens de todas as divisões, com o exercício e a
  // contribuição muscular embutidos.
  const itens = unwrapList(
    "carregar exercícios das divisões",
    await supabase
      .from("workout_template_exercises")
      .select(
        "id, template_id, exercise_id, position, target_sets, target_reps, target_rep_min, target_rep_max, rest_seconds, target_rpe, cadence, notes, superset_group, exercises(name, equipment, primary_muscle, secondary_muscles, level, mechanic, image_urls, exercise_muscles(muscle, contribution))",
      )
      .in(
        "template_id",
        templates.map((t) => t.id),
      )
      .order("position"),
  );

  const porTemplate = new Map<string, WeekExercise[]>();
  for (const item of itens) {
    const ex = item.exercises;
    const lista = porTemplate.get(item.template_id) ?? [];

    lista.push({
      itemId: item.id,
      exerciseId: item.exercise_id,
      name: ex?.name ?? "Exercício",
      position: item.position,
      targetSets: num(item.target_sets, 3),
      targetReps: num(item.target_reps, 10),
      targetRepMin: item.target_rep_min,
      targetRepMax: item.target_rep_max,
      restSeconds: num(item.rest_seconds, 90),
      targetRpe: item.target_rpe !== null ? num(item.target_rpe) : null,
      cadence: item.cadence,
      notes: item.notes,
      supersetGroup: item.superset_group,
      equipment: ex?.equipment ?? "other",
      primaryMuscle: ex?.primary_muscle ?? "full_body",
      secondaryMuscles: ex?.secondary_muscles ?? [],
      level: ex?.level ?? null,
      mechanic: ex?.mechanic ?? null,
      imageUrls: ex?.image_urls ?? [],
      muscles: (ex?.exercise_muscles ?? []).map((m) => ({
        muscle: m.muscle,
        contribution: num(m.contribution),
      })),
    });

    porTemplate.set(item.template_id, lista);
  }

  return {
    routineId: routine.id,
    routineName: routine.name,
    daysPerWeek: routine.days_per_week,
    currentIndex: routine.current_index,
    trainingWeekdays: routine.training_weekdays ?? [],
    scheduleMode: routine.schedule_mode === "fixed" ? "fixed" : "rotation",
    splits: templates.map((t, i) => ({
      templateId: t.id,
      letter: t.routine_letter,
      icon: t.icon,
      name: t.name,
      order: t.routine_order ?? i,
      weekdays: t.weekdays ?? [],
      exercises: (porTemplate.get(t.id) ?? []).sort((a, b) => a.position - b.position),
    })),
  };
}

// ------------------------------------------------------- personalização
//
// O usuário não fica preso ao plano da geração. Todas as operações abaixo
// existem porque um plano que não se pode ajustar é um plano que se abandona na
// primeira vez que o banco está ocupado ou o exercício incomoda.

export interface UpdateItemPatch {
  target_sets?: number;
  target_reps?: number;
  target_rep_min?: number | null;
  target_rep_max?: number | null;
  rest_seconds?: number;
  target_rpe?: number | null;
  cadence?: string | null;
  notes?: string | null;
}

export async function updateTemplateItem(itemId: string, patch: UpdateItemPatch): Promise<void> {
  assertOk(
    "atualizar exercício",
    await supabase.from("workout_template_exercises").update(patch).eq("id", itemId),
  );
}

export async function removeTemplateItem(itemId: string): Promise<void> {
  assertOk(
    "remover exercício",
    await supabase.from("workout_template_exercises").delete().eq("id", itemId),
  );
}

export async function addTemplateItem(
  templateId: string,
  exerciseId: string,
  position: number,
): Promise<string> {
  const row = unwrap(
    "adicionar exercício",
    await supabase
      .from("workout_template_exercises")
      .insert({
        template_id: templateId,
        exercise_id: exerciseId,
        position,
        target_sets: 3,
        target_reps: 10,
        rest_seconds: 90,
      })
      .select("id")
      .single(),
  );
  return row.id;
}

/** Troca o exercício preservando séries, repetições e descanso já ajustados. */
export async function swapTemplateExercise(itemId: string, newExerciseId: string): Promise<void> {
  assertOk(
    "trocar exercício",
    await supabase
      .from("workout_template_exercises")
      .update({ exercise_id: newExerciseId })
      .eq("id", itemId),
  );
}

/** Duplica um exercício logo abaixo do original, com a mesma prescrição. */
export async function duplicateTemplateItem(item: WeekExercise, templateId: string): Promise<void> {
  // Abre espaço empurrando os seguintes: `position` não tem unicidade, mas
  // manter a ordem consistente evita empates arbitrários na renderização.
  const seguintes = unwrapList(
    "carregar exercícios seguintes",
    await supabase
      .from("workout_template_exercises")
      .select("id, position")
      .eq("template_id", templateId)
      .gt("position", item.position),
  );

  for (const s of seguintes) {
    assertOk(
      "reordenar exercícios",
      await supabase
        .from("workout_template_exercises")
        .update({ position: s.position + 1 })
        .eq("id", s.id),
    );
  }

  assertOk(
    "duplicar exercício",
    await supabase.from("workout_template_exercises").insert({
      template_id: templateId,
      exercise_id: item.exerciseId,
      position: item.position + 1,
      target_sets: item.targetSets,
      target_reps: item.targetReps,
      target_rep_min: item.targetRepMin,
      target_rep_max: item.targetRepMax,
      rest_seconds: item.restSeconds,
      target_rpe: item.targetRpe,
      cadence: item.cadence,
      notes: item.notes,
    }),
  );
}

/**
 * Reatribui a faixa inteira de posições de uma vez.
 *
 * `position` não tem restrição de unicidade em `workout_template_exercises`, o
 * que permite gravar a ordem nova direto — sem o artifício do valor temporário
 * que uma coluna única exigiria.
 */
export async function reorderTemplateItems(orderedItemIds: readonly string[]): Promise<void> {
  for (const [index, id] of orderedItemIds.entries()) {
    assertOk(
      "reordenar exercícios",
      await supabase
        .from("workout_template_exercises")
        .update({ position: index + 1 })
        .eq("id", id),
    );
  }
}
