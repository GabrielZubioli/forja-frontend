import { KCAL_PER_G } from "../shared/units";

/**
 * Gasto energético e metas de macronutrientes (cálculo estático inicial).
 * O ajuste ao longo do tempo é feito pelo motor adaptativo (`./adaptive-macros`).
 */

export type Sex = "male" | "female" | "other";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type Goal = "lose" | "maintain" | "gain";

export interface BmrParams {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  ageYears: number;
}

/** Taxa metabólica basal — equação de Mifflin-St Jeor. */
export function bmrMifflin({ sex, weightKg, heightCm, ageYears }: BmrParams): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  // "other" usa a média dos offsets masculino/feminino.
  const offset = sex === "male" ? 5 : sex === "female" ? -161 : -78;
  return Math.max(0, base + offset);
}

const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** Gasto energético total diário (TDEE) a partir da TMB e do nível de atividade. */
export function tdee(bmr: number, level: ActivityLevel): number {
  return bmr * ACTIVITY_FACTOR[level];
}

/**
 * Versão das regras de metas. Muda quando qualquer constante abaixo muda, para
 * que uma meta gravada possa ser auditada contra a regra que a produziu.
 */
export const TARGETS_CALCULATION_VERSION = "2026.10-1";

/**
 * Limites de segurança da geração automática.
 *
 * ⚠️ Valores de produto, conservadores, que precisam de aprovação de
 * nutricionista. Fora deles o app **não corrige** a meta: interrompe a geração
 * personalizada e orienta procurar um profissional.
 */
export const ENERGY_SAFETY = {
  /** Abaixo disto a dieta deixa de ser um déficit moderado. */
  minKcal: { male: 1500, female: 1200, other: 1500 } as Record<Sex, number>,
  maxKcal: 5000,
  /** Déficit máximo em kcal/dia, mesmo quando 15% do TDEE daria mais. */
  maxDeficitKcal: 750,
  /** Superávit máximo em kcal/dia. */
  maxSurplusKcal: 500,
  /** Sem fluxo clínico validado para menores de idade. */
  minAgeYears: 18,
  /** Perder peso com IMC abaixo disto não é gerado automaticamente. */
  minBmiForWeightLoss: 18.5,
} as const;

/**
 * Regras de macros. ⚠️ Também dependem de validação profissional: 2 g/kg é
 * comum para quem treina força, mas não serve para todo perfil — por isso a
 * proteína tem teto pela fatia das calorias.
 */
export const MACRO_RULES = {
  proteinGPerKg: 2,
  /** Teto da proteína como fração das kcal (pessoas muito pesadas). */
  proteinMaxShare: 0.35,
  fatShare: 0.25,
  fiberGPer1000Kcal: 14,
} as const;

/** Ajusta o TDEE pelo objetivo (~15% de déficit / ~10% de superávit), com tetos absolutos. */
export function goalCalories(tdeeVal: number, goal: Goal): number {
  if (goal === "lose")
    return Math.round(Math.max(tdeeVal * 0.85, tdeeVal - ENERGY_SAFETY.maxDeficitKcal));
  if (goal === "gain")
    return Math.round(Math.min(tdeeVal * 1.1, tdeeVal + ENERGY_SAFETY.maxSurplusKcal));
  return Math.round(tdeeVal);
}

export interface MacroTargets {
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  fiber_g: number;
}

/**
 * Divisão de macros a partir das kcal-alvo e do peso corporal.
 *
 * Proteína 2 g/kg (até 35% das kcal), gordura 25% das kcal, carboidrato
 * preenche o restante, fibra 14 g por 1000 kcal. Com os dois tetos, o
 * carboidrato nunca fica negativo: sobra no mínimo 40% das kcal.
 */
export function macroTargets(kcal: number, weightKg: number): MacroTargets {
  if (!Number.isFinite(kcal) || kcal <= 0 || !Number.isFinite(weightKg) || weightKg <= 0) {
    throw new RangeError("Metas de macros exigem calorias e peso positivos.");
  }
  const protein_g = Math.round(
    Math.min(
      weightKg * MACRO_RULES.proteinGPerKg,
      (kcal * MACRO_RULES.proteinMaxShare) / KCAL_PER_G.protein,
    ),
  );
  const fat_g = Math.round((kcal * MACRO_RULES.fatShare) / KCAL_PER_G.fat);
  const remaining = Math.max(0, kcal - protein_g * KCAL_PER_G.protein - fat_g * KCAL_PER_G.fat);
  const carbs_g = Math.round(remaining / KCAL_PER_G.carbs);
  const fiber_g = Math.round((kcal / 1000) * MACRO_RULES.fiberGPer1000Kcal);
  return { protein_g, fat_g, carbs_g, fiber_g };
}

export interface EnergyAssessmentInput {
  sex: Sex | undefined;
  weightKg: number | undefined;
  heightCm: number | undefined;
  ageYears: number | undefined;
  activity: ActivityLevel;
  goal: Goal;
}

export type BlockReason =
  | "incomplete_profile"
  | "invalid_profile"
  | "under_age"
  | "underweight_weight_loss"
  | "kcal_out_of_range";

export type EnergyAssessment =
  | {
      ok: true;
      bmr: number;
      /** Estimativa: o fator de atividade é derivado da frequência de treino. */
      estimatedTdee: number;
      kcal: number;
      macros: MacroTargets;
      version: string;
    }
  | { ok: false; reason: BlockReason; message: string };

const PROFESSIONAL =
  "Para este perfil, procure um nutricionista ou médico: o app não gera um plano automático.";

/**
 * Metas diárias, com validação e limites de segurança — a única porta de
 * entrada para metas calculadas.
 *
 * Nunca preenche dado ausente com um valor "padrão": peso, altura, idade e sexo
 * faltando viram `incomplete_profile`, para a tela pedir a correção.
 */
export function assessEnergy(input: EnergyAssessmentInput): EnergyAssessment {
  const { sex, weightKg, heightCm, ageYears } = input;
  if (
    sex === undefined ||
    weightKg === undefined ||
    heightCm === undefined ||
    ageYears === undefined
  ) {
    return {
      ok: false,
      reason: "incomplete_profile",
      message: "Complete sexo, idade, altura e peso no perfil para calcular suas metas.",
    };
  }
  if (
    !(weightKg >= 35 && weightKg <= 250) ||
    !(heightCm >= 130 && heightCm <= 230) ||
    !(ageYears >= 14 && ageYears <= 90)
  ) {
    return {
      ok: false,
      reason: "invalid_profile",
      message: "Peso, altura ou idade fora do intervalo aceito. Revise os dados do perfil.",
    };
  }
  if (ageYears < ENERGY_SAFETY.minAgeYears) {
    return { ok: false, reason: "under_age", message: `Menores de 18 anos. ${PROFESSIONAL}` };
  }
  const imc = weightKg / (heightCm / 100) ** 2;
  if (input.goal === "lose" && imc < ENERGY_SAFETY.minBmiForWeightLoss) {
    return {
      ok: false,
      reason: "underweight_weight_loss",
      message: `Seu IMC está abaixo de ${ENERGY_SAFETY.minBmiForWeightLoss} e o objetivo é perder peso. ${PROFESSIONAL}`,
    };
  }

  const bmr = bmrMifflin({ sex, weightKg, heightCm, ageYears });
  const estimatedTdee = tdee(bmr, input.activity);
  const kcal = goalCalories(estimatedTdee, input.goal);
  const range = kcalRangeIssue(kcal, sex);
  if (range) return { ok: false, reason: "kcal_out_of_range", message: range };

  return {
    ok: true,
    bmr: Math.round(bmr),
    estimatedTdee: Math.round(estimatedTdee),
    kcal,
    macros: macroTargets(kcal, weightKg),
    version: TARGETS_CALCULATION_VERSION,
  };
}

/**
 * Motivo de a meta calórica (calculada ou ajustada à mão) estar fora dos
 * limites seguros — ou `null`.
 */
export function kcalRangeIssue(kcal: number, sex: Sex | undefined): string | null {
  const min = ENERGY_SAFETY.minKcal[sex ?? "other"];
  if (!Number.isFinite(kcal) || kcal < min) {
    return `A meta de ${Math.round(kcal)} kcal fica abaixo do mínimo seguro (${min} kcal) para gerar um plano automático. ${PROFESSIONAL}`;
  }
  if (kcal > ENERGY_SAFETY.maxKcal) {
    return `A meta de ${Math.round(kcal)} kcal passa do máximo (${ENERGY_SAFETY.maxKcal} kcal) para gerar um plano automático. ${PROFESSIONAL}`;
  }
  return null;
}

/**
 * Gasto estimado de uma sessão de musculação: MET × peso × horas.
 *
 * MET 3,5 é o do Compendium of Physical Activities para musculação com vários
 * exercícios (8–15 reps). O tempo é o da sessão inteira, descansos incluídos —
 * é assim que o MET foi medido. Conservador de propósito: superestimar calorias
 * queimadas é o erro que faz alguém comer de volta o déficit.
 */
export function strengthTrainingKcal(bodyWeightKg: number, durationSeconds: number): number {
  if (bodyWeightKg <= 0 || durationSeconds <= 0) return 0;
  return Math.round(3.5 * bodyWeightKg * (durationSeconds / 3600));
}
