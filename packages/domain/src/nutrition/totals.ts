/**
 * Soma de macronutrientes de uma lista de porções.
 *
 * Este cálculo estava duplicado em quatro lugares do app web (diário, dashboard,
 * editor de receita e cada item de lista), com implementações sutilmente
 * diferentes — o dashboard, por exemplo, não convertia os campos `NUMERIC` do
 * Postgres (que chegam como *string*) antes de multiplicar. Centralizar aqui
 * mantém uma única convenção e a torna testável.
 *
 * ## Convenção de porção do projeto
 *
 * Cada alimento guarda seus macros **por `serving_size_g`** (padrão 100 g).
 * Para uma quantidade real em gramas:
 *
 * ```
 * factor = grams / serving_size_g
 * kcal   = food.kcal * factor
 * ```
 */

/** Macros de um alimento, por `servingSizeG`. Aceita string (NUMERIC do Postgres). */
export interface FoodMacros {
  servingSizeG: number | string;
  kcal: number | string | null;
  proteinG: number | string | null;
  carbsG: number | string | null;
  fatG: number | string | null;
  fiberG?: number | string | null;
}

/** Uma porção consumida: o alimento e quanto dele. */
export interface Portion {
  food: FoodMacros;
  /** Quantidade em gramas. Quando ausente, usa `servings × servingSizeG`. */
  grams?: number | string | null;
  /** Número de porções. Usado apenas se `grams` não for informado. */
  servings?: number | string | null;
}

export interface MacroTotals {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export const ZERO_TOTALS: Readonly<MacroTotals> = Object.freeze({
  kcal: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  fiberG: 0,
});

/**
 * Converte com segurança um valor que pode vir como string (`NUMERIC`), null ou
 * undefined. Diferente de `Number()`, nunca produz `NaN`.
 */
function toNumber(value: number | string | null | undefined, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Gramas efetivas de uma porção, resolvendo `grams` ou `servings × servingSizeG`. */
export function portionGrams(portion: Portion): number {
  const servingSize = toNumber(portion.food.servingSizeG, 100);
  const explicit = toNumber(portion.grams, Number.NaN);
  if (Number.isFinite(explicit)) return explicit;
  return toNumber(portion.servings, 1) * servingSize;
}

/**
 * Fator de conversão entre a porção de referência do alimento e a quantidade
 * realmente consumida. `serving_size_g` zero/ausente cairia numa divisão por
 * zero — tratado com o padrão de 100 g.
 */
export function portionFactor(portion: Portion): number {
  const servingSize = toNumber(portion.food.servingSizeG, 100) || 100;
  return portionGrams(portion) / servingSize;
}

/** Macros de **uma** porção. */
export function portionMacros(portion: Portion): MacroTotals {
  const f = portionFactor(portion);
  const food = portion.food;
  return {
    kcal: toNumber(food.kcal) * f,
    proteinG: toNumber(food.proteinG) * f,
    carbsG: toNumber(food.carbsG) * f,
    fatG: toNumber(food.fatG) * f,
    fiberG: toNumber(food.fiberG) * f,
  };
}

/** Soma os macros de várias porções. */
export function nutritionTotals(portions: readonly Portion[]): MacroTotals {
  return portions.reduce<MacroTotals>(
    (acc, portion) => {
      const m = portionMacros(portion);
      acc.kcal += m.kcal;
      acc.proteinG += m.proteinG;
      acc.carbsG += m.carbsG;
      acc.fatG += m.fatG;
      acc.fiberG += m.fiberG;
      return acc;
    },
    { ...ZERO_TOTALS },
  );
}

/** Divide totais por um número de porções (macros por porção de uma receita). */
export function perServing(totals: MacroTotals, servings: number): MacroTotals {
  const divisor = servings > 0 ? servings : 1;
  return {
    kcal: totals.kcal / divisor,
    proteinG: totals.proteinG / divisor,
    carbsG: totals.carbsG / divisor,
    fatG: totals.fatG / divisor,
    fiberG: totals.fiberG / divisor,
  };
}
