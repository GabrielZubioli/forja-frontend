/**
 * Constantes físicas/fisiológicas compartilhadas pelo domínio.
 * Tudo em unidades métricas (kg, cm, kcal).
 */

/**
 * Energia por quilograma de massa corporal, usada nas equações de balanço
 * energético (estimativa de gasto e metas adaptativas).
 * ~7700 kcal/kg é o valor convencional para tecido corporal misto.
 */
export const KCAL_PER_KG = 7700;

/** Kcal por grama de cada macronutriente (fatores de Atwater). */
export const KCAL_PER_G = {
  protein: 4,
  carbs: 4,
  fat: 9,
} as const;

export type MacroKey = keyof typeof KCAL_PER_G;
