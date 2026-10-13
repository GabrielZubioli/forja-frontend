import { supabase } from "@/integrations/supabase/client";
import { assertOk, unwrapMaybe } from "@/data/supabase-helpers";
import {
  buildRoutineDraft,
  createEmptyRoutine,
  saveSuggestedRoutine,
  type RoutineDraft,
} from "@/data/routines";
import { ensureActiveMealPlan } from "@/data/meal-plans";
import { trainingPlanInput } from "@/data/planning-profile";
import { todayISO } from "@/lib/date";
import type { Answers } from "@/lib/onboarding/schema";
import { derivedActivityLevel, derivedObjective } from "@/lib/onboarding/options";
import { DEFAULT_MEALS_PER_DAY, type SessionDuration } from "@forja/domain";

/**
 * Montagem da conta, logo depois do questionário.
 *
 * ## O que monta
 *
 * O perfil e o treino — o sugerido ou um plano vazio, conforme a escolha — e a
 * estrutura da dieta: as refeições do dia, vazias. A dieta nunca é gerada: o
 * app não prescreve alimentos, quantidades nem metas nutricionais.
 *
 * ## A ordem importa
 *
 * Cada etapa é idempotente e o progresso é reportado: repetir a montagem
 * corrige o que faltou em vez de duplicar o que deu certo.
 */

export type GenerationStage = "profile" | "workout" | "diet" | "done";

/** Seguir o plano de treino sugerido ou montar o próprio, do zero. */
export type PlanChoice = "sugerido" | "manual";

export interface GenerationProgress {
  stage: GenerationStage;
  label: string;
}

const STAGE_LABELS: Record<GenerationStage, string> = {
  profile: "Salvando seu perfil",
  workout: "Preparando seu treino",
  diet: "Criando suas refeições",
  done: "Tudo pronto",
};

export interface GenerationResult {
  routineId: string | null;
  mealPlanId: string | null;
  warnings: string[];
}

/** Converte a idade declarada numa data de nascimento aproximada. */
function birthDateFromAge(age: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  return d.toISOString().slice(0, 10);
}

/**
 * O rascunho do treino mostrado na prévia do questionário. Guardado em memória
 * para o plano salvo ser exatamente o que a pessoa viu e aceitou; sem ele
 * (recarregou a página), é montado de novo a partir das mesmas respostas.
 */
let rascunhoAceito: RoutineDraft | null = null;
export function rememberAcceptedDraft(draft: RoutineDraft | null) {
  rascunhoAceito = draft;
}

/** O treino sugerido para estas respostas, sem gravar nada. */
export function buildSuggestedRoutine(answers: Answers): Promise<RoutineDraft> {
  return buildRoutineDraft(trainingPlanInput(answers), {
    injuries: answers.injuries,
    equipmentAvailable: answers.equipment,
  });
}

export async function generateEverything(
  userId: string,
  answers: Answers,
  choice: PlanChoice,
  onProgress?: (p: GenerationProgress) => void,
): Promise<GenerationResult> {
  const report = (stage: GenerationStage) => onProgress?.({ stage, label: STAGE_LABELS[stage] });
  const warnings: string[] = [];

  // ------------------------------------------------------------- 1. perfil
  report("profile");

  const objective = derivedObjective(answers);
  const activity = derivedActivityLevel(answers);
  const duration = (answers.duration ?? "average") as SessionDuration;
  const daysPerWeek = answers.daysPerWeek ?? 3;
  const weightKg = answers.weightKg ?? 75;
  const mealsPerDay = answers.mealsPerDay ?? DEFAULT_MEALS_PER_DAY;

  // Sem metas nutricionais: quem quiser as define (com o nutricionista) nas
  // Configurações.
  assertOk(
    "salvar perfil",
    await supabase
      .from("profiles")
      .update({
        sex: answers.sex ?? "other",
        birth_date: birthDateFromAge(answers.age ?? 28),
        height_cm: answers.heightCm ?? null,
        goal: objective.weightGoal,
        goal_weight_kg: answers.goalWeightKg ?? null,
        activity_level: activity,
        onboarding_completed: true,

        experience_level: answers.experience ?? null,
        focus_area: answers.focus ?? null,
        training_place: answers.place ?? null,
        equipment_available: answers.equipment,
        session_duration: duration,
        days_per_week: daysPerWeek,
        injuries: answers.injuries,
        meals_per_day: mealsPerDay,
        workout_time: answers.workoutTime ?? null,
      })
      .eq("id", userId),
  );

  // As respostas cruas ficam guardadas para permitir montar o plano sugerido
  // depois, sem refazer o questionário.
  assertOk(
    "salvar respostas do questionário",
    await supabase
      .from("onboarding_answers")
      .upsert(
        { user_id: userId, payload: answers, version: 1, completed_at: new Date().toISOString() },
        { onConflict: "user_id" },
      ),
  );

  // Peso inicial: destrava a tendência corporal.
  assertOk(
    "registrar peso inicial",
    await supabase
      .from("body_weights")
      .upsert(
        { user_id: userId, log_date: todayISO(), weight_kg: weightKg },
        { onConflict: "user_id,log_date" },
      ),
  );

  // Metas de peso e de frequência — nenhuma nutricional.
  const metas: {
    user_id: string;
    kind: "weight" | "habit";
    label: string;
    metric_key: string;
    start_value: number;
    target_value: number;
    unit: string;
  }[] = [];

  if (answers.goalWeightKg && Math.abs(answers.goalWeightKg - weightKg) >= 1) {
    metas.push({
      user_id: userId,
      kind: "weight",
      label:
        answers.goalWeightKg < weightKg ? "Chegar ao peso desejado" : "Ganhar massa até a meta",
      metric_key: "body_weight",
      start_value: weightKg,
      target_value: answers.goalWeightKg,
      unit: "kg",
    });
  }
  metas.push({
    user_id: userId,
    kind: "habit",
    label: "Treinar toda semana",
    metric_key: "workouts_per_week",
    start_value: 0,
    target_value: daysPerWeek,
    unit: "treinos",
  });

  // Refazer o questionário substitui as metas: o banco aceita uma ativa por métrica.
  assertOk(
    "arquivar metas antigas",
    await supabase
      .from("goals")
      .update({ is_active: false })
      .eq("user_id", userId)
      .eq("is_active", true)
      .in(
        "metric_key",
        metas.map((m) => m.metric_key),
      ),
  );
  assertOk("criar metas", await supabase.from("goals").insert(metas));

  // ------------------------------------------------------------- 2. treino
  report("workout");

  let routineId: string | null = null;
  try {
    routineId =
      choice === "sugerido"
        ? await saveSuggestedRoutine(userId, rascunhoAceito)
        : await createEmptyRoutine(userId);
    rascunhoAceito = null;
  } catch (error) {
    // O treino falhar não pode impedir o resto: a tela Plano oferece montar de novo.
    warnings.push(
      `Não conseguimos preparar o treino (${error instanceof Error ? error.message : "erro desconhecido"}). Abra a tela Plano para tentar de novo.`,
    );
  }

  // -------------------------------------------------------------- 3. dieta
  report("diet");

  let mealPlanId: string | null = null;
  try {
    mealPlanId = (await ensureActiveMealPlan(userId))?.id ?? null;
  } catch (error) {
    warnings.push(
      `Não conseguimos criar suas refeições (${error instanceof Error ? error.message : "erro desconhecido"}). Abra a tela Dieta para tentar de novo.`,
    );
  }

  report("done");
  return { routineId, mealPlanId, warnings };
}

/** O usuário já passou pela geração? Usado para não repetir o fluxo. */
export async function hasCompletedOnboarding(): Promise<boolean> {
  const profile = unwrapMaybe(
    "verificar onboarding",
    await supabase.from("profiles").select("onboarding_completed").maybeSingle(),
  );
  return profile?.onboarding_completed ?? false;
}

/** Duração estimada de cada etapa, só para a barra de progresso não travar. */
export const GENERATION_STAGES: GenerationStage[] = ["profile", "workout", "diet", "done"];
