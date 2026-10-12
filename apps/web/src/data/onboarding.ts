import { supabase } from "@/integrations/supabase/client";
import { assertOk, unwrapMaybe } from "@/data/supabase-helpers";
import { ensureActiveRoutine } from "@/data/routines";
import { ensureActiveMealPlan } from "@/data/meal-plans";
import { computeTargets } from "@/data/planning-profile";
import { todayISO } from "@/lib/date";
import type { Answers } from "@/lib/onboarding/schema";
import {
  derivedActivityLevel,
  derivedEquipmentProfile,
  derivedLevel,
  derivedObjective,
} from "@/lib/onboarding/options";
import { MEAL_SLOTS, type SessionDuration } from "@forja/domain";

/**
 * Geração do plano completo, disparada logo após a criação da conta.
 *
 * ## O princípio
 *
 * O usuário nunca deve ver uma tela vazia. Ao entrar pela primeira vez, treino,
 * dieta, metas e progresso já existem — montados a partir do que ele respondeu,
 * não de valores padrão.
 *
 * ## A ordem importa
 *
 * As etapas rodam em sequência porque cada uma depende da anterior: as metas
 * calóricas saem do perfil; a dieta sai das metas; a rotina sai do nível e do
 * equipamento. Uma falha no meio deixa o usuário com parte do plano — e é por
 * isso que cada etapa é idempotente e o progresso é reportado: repetir a
 * geração corrige o que faltou em vez de duplicar o que deu certo.
 */

export type GenerationStage = "profile" | "goals" | "workout" | "diet" | "done";

export interface GenerationProgress {
  stage: GenerationStage;
  label: string;
}

const STAGE_LABELS: Record<GenerationStage, string> = {
  profile: "Analisando seu perfil",
  goals: "Calculando suas metas",
  workout: "Montando seu treino",
  diet: "Montando seu cardápio",
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

export async function generateEverything(
  userId: string,
  answers: Answers,
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

  // A mesma conta que a regeneração usa depois — uma função só, para as metas
  // do perfil e as do cardápio nunca divergirem.
  const alvos = computeTargets(answers);

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

        daily_kcal_target: alvos.kcal,
        protein_g_target: alvos.proteinG,
        carbs_g_target: alvos.carbsG,
        fat_g_target: alvos.fatG,
        fiber_g_target: alvos.fiberG,
        water_ml_target: alvos.waterMl,

        experience_level: answers.experience ?? null,
        focus_area: answers.focus ?? null,
        training_place: answers.place ?? null,
        equipment_available: answers.equipment,
        session_duration: duration,
        days_per_week: daysPerWeek,
        injuries: answers.injuries,
        dietary_restrictions: answers.diets,
        allergies: answers.allergies,
        disliked_foods: answers.dislikedFoods,
        liked_foods: answers.likedFoods,
        // Sem resposta, o dia completo: as oito refeições. Assumir quatro
        // deixava pré-treino, pós-treino e ceia de fora de um plano que a tela
        // de Alimentação promete ter.
        meals_per_day: answers.mealsPerDay ?? MEAL_SLOTS.length,
        cooking_skill: answers.cookingSkill ?? null,
        wake_time: answers.wakeTime ?? null,
        sleep_time: answers.sleepTime ?? null,
        workout_time: answers.workoutTime ?? null,
      })
      .eq("id", userId),
  );

  // As respostas cruas ficam guardadas para permitir **regerar** o plano meses
  // depois sem submeter o usuário ao questionário de novo.
  assertOk(
    "salvar respostas do questionário",
    await supabase
      .from("onboarding_answers")
      .upsert(
        { user_id: userId, payload: answers, version: 1, completed_at: new Date().toISOString() },
        { onConflict: "user_id" },
      ),
  );

  // Peso inicial: destrava a tendência corporal e o motor de metas adaptativas.
  assertOk(
    "registrar peso inicial",
    await supabase
      .from("body_weights")
      .upsert(
        { user_id: userId, log_date: todayISO(), weight_kg: weightKg },
        { onConflict: "user_id,log_date" },
      ),
  );

  // -------------------------------------------------------------- 2. metas
  report("goals");

  const metas: {
    user_id: string;
    kind: "weight" | "habit" | "nutrition";
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

  metas.push({
    user_id: userId,
    kind: "nutrition",
    label: "Bater a proteína do dia",
    metric_key: "protein_g",
    start_value: 0,
    target_value: alvos.proteinG,
    unit: "g",
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

  // ------------------------------------------------------------- 3. treino
  report("workout");

  // A geração passa pelas mesmas funções que consertam um plano quebrado mais
  // tarde (`ensureActiveRoutine` / `ensureActiveMealPlan`). Ter dois caminhos —
  // um para criar, outro para consertar — era o que fazia a criação inicial
  // falhar de um jeito que o resto do app não sabia reparar.
  let routineId: string | null = null;
  try {
    const routine = await ensureActiveRoutine(userId, { force: true });
    routineId = routine?.id ?? null;
  } catch (error) {
    // O treino falhar não pode impedir a dieta de existir: entregar metade é
    // melhor que entregar nada, e a tela final diz o que faltou.
    warnings.push(
      `Não conseguimos montar o treino automaticamente (${error instanceof Error ? error.message : "erro desconhecido"}). Abra a aba Treino para tentar de novo.`,
    );
  }

  // -------------------------------------------------------------- 4. dieta
  report("diet");

  let mealPlanId: string | null = null;
  try {
    const plan = await ensureActiveMealPlan(userId, { force: true });
    mealPlanId = plan?.id ?? null;
  } catch (error) {
    warnings.push(
      `Não conseguimos montar o cardápio automaticamente (${error instanceof Error ? error.message : "erro desconhecido"}). Abra a aba Alimentação para tentar de novo.`,
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
export const GENERATION_STAGES: GenerationStage[] = ["profile", "goals", "workout", "diet", "done"];
