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

/** Ajusta o TDEE pelo objetivo (~15% de déficit / ~10% de superávit). */
export function goalCalories(tdeeVal: number, goal: Goal): number {
  if (goal === "lose") return Math.round(tdeeVal * 0.85);
  if (goal === "gain") return Math.round(tdeeVal * 1.1);
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
 * Proteína 2 g/kg, gordura 25% das kcal, carboidrato preenche o restante,
 * fibra 14 g por 1000 kcal.
 */
export function macroTargets(kcal: number, weightKg: number): MacroTargets {
  const protein_g = Math.round(weightKg * 2);
  const fat_g = Math.round((kcal * 0.25) / KCAL_PER_G.fat);
  const remaining = Math.max(0, kcal - protein_g * KCAL_PER_G.protein - fat_g * KCAL_PER_G.fat);
  const carbs_g = Math.round(remaining / KCAL_PER_G.carbs);
  const fiber_g = Math.round((kcal / 1000) * 14);
  return { protein_g, fat_g, carbs_g, fiber_g };
}
