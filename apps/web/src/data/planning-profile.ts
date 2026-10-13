import { supabase } from "@/integrations/supabase/client";
import { num, unwrapMaybe } from "@/data/supabase-helpers";
import { answersSchema, type Answers } from "@/lib/onboarding/schema";
import {
  derivedActivityLevel,
  derivedEquipmentProfile,
  derivedLevel,
  derivedObjective,
  suggestWeekdays,
} from "@/lib/onboarding/options";
import { assessEnergy, kcalRangeIssue, waterTargetMl, type SessionDuration } from "@forja/domain";

/**
 * As respostas do questionário, recuperadas do banco — e o que elas viram.
 *
 * ## Por que isto existe separado do onboarding
 *
 * A geração inicial acontece uma vez, com as respostas ainda na memória do
 * navegador. Tudo o que vem depois — regerar o cardápio, remontar a rotina,
 * consertar um plano que nasceu incompleto porque o catálogo estava vazio —
 * acontece **sem** esse rascunho: o usuário pode estar em outro aparelho, meses
 * depois. Sem uma forma de reconstruir as respostas a partir do banco, a única
 * saída seria refazer o questionário, e refazer o questionário para consertar
 * um erro do app é cobrar do usuário a conta errada.
 *
 * ## A ordem das fontes
 *
 * 1. `onboarding_answers.payload` — as respostas cruas, é o ideal.
 * 2. `profiles` — a leitura estruturada que a geração gravou. Perde nuance
 *    (consistência de treino, por exemplo), mas basta para regerar.
 * 3. Nada inventado: dado do corpo ausente fica ausente, e as metas dizem o que
 *    falta (`TargetsResult`) em vez de nascerem de um peso fictício.
 */

/** Minutos de treino por sessão, para a meta de água. */
const SESSION_MINUTES: Record<SessionDuration, number> = {
  quick: 20,
  short: 35,
  average: 50,
  long: 75,
};

/** Horário de treino assumido quando o usuário não informa o dele. */
export const DEFAULT_WORKOUT_TIME = "18:00";

export interface NutritionTargets {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  waterMl: number;
}

/**
 * A geração automática não pode seguir: perfil incompleto, fora do escopo
 * (menor de idade, baixo peso querendo emagrecer) ou meta fora dos limites
 * seguros. A mensagem é para o usuário — diz o que fazer, não o que quebrou.
 */
export class PlanBlockedError extends Error {
  constructor(
    message: string,
    public readonly reason: string,
  ) {
    super(message);
    this.name = "PlanBlockedError";
  }
}

export type TargetsResult =
  { ok: true; targets: NutritionTargets } | { ok: false; reason: string; message: string };

/**
 * Metas calóricas e de macros a partir das respostas. Pura, sem banco.
 *
 * Sem peso, altura, idade ou sexo não há conta: o resultado diz o que falta,
 * em vez de calcular com um "75 kg" inventado. O fator de atividade é uma
 * estimativa derivada dos dias de treino.
 */
export function computeTargets(answers: Answers): TargetsResult {
  const objetivo = derivedObjective(answers);
  const avaliacao = assessEnergy({
    sex: answers.sex,
    weightKg: answers.weightKg,
    heightCm: answers.heightCm,
    ageYears: answers.age,
    activity: derivedActivityLevel(answers),
    goal: objetivo.weightGoal,
  });
  if (!avaliacao.ok) return { ok: false, reason: avaliacao.reason, message: avaliacao.message };

  const duration = (answers.duration ?? "average") as SessionDuration;
  const daysPerWeek = answers.daysPerWeek ?? 3;
  const { macros } = avaliacao;
  return {
    ok: true,
    targets: {
      kcal: avaliacao.kcal,
      proteinG: macros.protein_g,
      carbsG: macros.carbs_g,
      fatG: macros.fat_g,
      fiberG: macros.fiber_g,
      waterMl: waterTargetMl({
        weightKg: answers.weightKg!,
        trainingMinutes: (SESSION_MINUTES[duration] * daysPerWeek) / 7,
      }),
    },
  };
}

export interface PlanningInputs {
  answers: Answers;
  /** Metas da dieta — ou o motivo de a geração automática não seguir. */
  targets: TargetsResult;
  /** Rótulo do objetivo, usado nos nomes da rotina e do cardápio. */
  objectiveLabel: string;
  /** Dias da semana em que o usuário planeja treinar. */
  weekdays: number[];
  /** Horário de treino efetivo — o informado, ou o padrão. */
  workoutTime: string;
}

/** Bloqueios de escopo: valem mesmo com metas gravadas no perfil. */
const FORA_DE_ESCOPO = new Set(["under_age", "underweight_weight_loss"]);

/**
 * Tudo o que os geradores precisam, reconstruído do banco.
 *
 * As metas vêm de `profiles` quando já existem (podem ter sido ajustadas à mão,
 * e recalcular apagaria o ajuste); só caem no cálculo quando não existem. Em
 * qualquer caso, a meta final passa pelos limites de segurança.
 */
export async function loadPlanningInputs(userId: string): Promise<PlanningInputs> {
  const [answers, profile] = await Promise.all([loadAnswers(userId), loadProfile()]);
  const daysPerWeek = answers.daysPerWeek ?? 3;

  return {
    answers,
    targets: resolveTargets(answers, profile),
    objectiveLabel: derivedObjective(answers).label,
    weekdays: answers.weekdays.length > 0 ? answers.weekdays : suggestWeekdays(daysPerWeek),
    workoutTime: answers.workoutTime ?? DEFAULT_WORKOUT_TIME,
  };
}

function resolveTargets(answers: Answers, profile: ProfileRow | null): TargetsResult {
  const calculadas = computeTargets(answers);
  if (!calculadas.ok && FORA_DE_ESCOPO.has(calculadas.reason)) return calculadas;

  const kcalGravada = num(profile?.daily_kcal_target);
  if (kcalGravada > 0) {
    const fora = kcalRangeIssue(kcalGravada, answers.sex);
    if (fora) return { ok: false, reason: "kcal_out_of_range", message: fora };
    const base = calculadas.ok ? calculadas.targets : null;
    const gravada = (v: number | null | undefined, calc: number | undefined) => num(v) || calc || 0;
    return {
      ok: true,
      targets: {
        kcal: kcalGravada,
        proteinG: gravada(profile?.protein_g_target, base?.proteinG),
        carbsG: gravada(profile?.carbs_g_target, base?.carbsG),
        fatG: gravada(profile?.fat_g_target, base?.fatG),
        fiberG: gravada(profile?.fiber_g_target, base?.fiberG),
        waterMl: gravada(profile?.water_ml_target, base?.waterMl),
      },
    };
  }
  return calculadas;
}

/** Conveniências derivadas, para quem só precisa do treino. */
export function trainingPlanInput(answers: Answers) {
  return {
    level: derivedLevel(answers),
    goal: derivedObjective(answers).goal,
    equipment: derivedEquipmentProfile(answers),
    daysPerWeek: answers.daysPerWeek ?? 3,
    duration: (answers.duration ?? "average") as SessionDuration,
    focus: answers.focus ?? "full_body",
  } as const;
}

type ProfileRow = {
  daily_kcal_target: number | null;
  protein_g_target: number | null;
  carbs_g_target: number | null;
  fat_g_target: number | null;
  fiber_g_target: number | null;
  water_ml_target: number | null;
};

async function loadProfile(): Promise<ProfileRow | null> {
  return unwrapMaybe(
    "carregar metas do perfil",
    await supabase
      .from("profiles")
      .select(
        "daily_kcal_target, protein_g_target, carbs_g_target, fat_g_target, fiber_g_target, water_ml_target",
      )
      .maybeSingle(),
  );
}

/**
 * As respostas, das cruas para as reconstruídas.
 *
 * `answersSchema.safeParse` é o que impede um payload de uma versão anterior do
 * questionário de contaminar a geração: se não valida, cai para a
 * reconstrução, que sempre produz uma resposta coerente.
 */
async function loadAnswers(userId: string): Promise<Answers> {
  const salvas = unwrapMaybe(
    "carregar respostas do questionário",
    await supabase.from("onboarding_answers").select("payload").eq("user_id", userId).maybeSingle(),
  );

  const cruas = answersSchema.safeParse(salvas?.payload);
  if (cruas.success) return cruas.data;

  return reconstructFromProfile();
}

/** Reconstrói respostas plausíveis a partir das colunas de `profiles`. */
async function reconstructFromProfile(): Promise<Answers> {
  const profile = unwrapMaybe(
    "carregar perfil para regeneração",
    await supabase
      .from("profiles")
      .select(
        "sex, birth_date, height_cm, goal, goal_weight_kg, experience_level, focus_area, training_place, equipment_available, session_duration, days_per_week, injuries, dietary_restrictions, allergies, disliked_foods, liked_foods, meals_per_day, cooking_skill, wake_time, sleep_time, workout_time",
      )
      .maybeSingle(),
  );

  const peso = unwrapMaybe(
    "carregar peso mais recente",
    await supabase
      .from("body_weights")
      .select("weight_kg")
      .order("log_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );

  const objetivoPorMeta = { lose: "lose_fat", gain: "build_muscle", maintain: "recomp" } as const;

  // `safeParse` de novo: o perfil pode ter valores fora dos enums atuais (uma
  // coluna TEXT aceita qualquer coisa). Dado do corpo ausente fica ausente —
  // nunca vira um "28 anos, 172 cm, 75 kg" inventado que geraria metas falsas.
  const parsed = answersSchema.safeParse({
    sex: profile?.sex ?? undefined,
    age: profile?.birth_date ? idadeEm(profile.birth_date) : undefined,
    heightCm: profile?.height_cm ? num(profile.height_cm) : undefined,
    weightKg: peso?.weight_kg ? num(peso.weight_kg) : undefined,
    ...(profile?.goal_weight_kg ? { goalWeightKg: num(profile.goal_weight_kg) } : {}),
    objective: objetivoPorMeta[(profile?.goal ?? "maintain") as keyof typeof objetivoPorMeta],
    experience: profile?.experience_level ?? "beginner",
    place: profile?.training_place ?? "full_gym",
    equipment: profile?.equipment_available ?? [],
    daysPerWeek: Math.min(6, Math.max(2, num(profile?.days_per_week, 3))),
    duration: profile?.session_duration ?? "average",
    focus: profile?.focus_area ?? "full_body",
    injuries: profile?.injuries ?? [],
    mealsPerDay: profile?.meals_per_day ?? undefined,
    diets: profile?.dietary_restrictions ?? [],
    allergies: profile?.allergies ?? [],
    likedFoods: profile?.liked_foods ?? [],
    dislikedFoods: profile?.disliked_foods ?? [],
    cookingSkill: profile?.cooking_skill ?? undefined,
    wakeTime: recorte(profile?.wake_time),
    sleepTime: recorte(profile?.sleep_time),
    workoutTime: recorte(profile?.workout_time),
  });

  return parsed.success ? parsed.data : answersSchema.parse({});
}

function idadeEm(birthDate: string): number {
  const nascimento = new Date(`${birthDate}T00:00:00`);
  const anos = (Date.now() - nascimento.getTime()) / (365.25 * 24 * 3600 * 1000);
  return Math.min(90, Math.max(14, Math.round(anos)));
}

/** A coluna `TIME` do Postgres chega como `HH:MM:SS`; o schema espera `HH:MM`. */
function recorte(time: string | null | undefined): string | undefined {
  return time ? time.slice(0, 5) : undefined;
}
