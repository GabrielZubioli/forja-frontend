/**
 * Cor de cada macronutriente — uma vez só, para o app inteiro.
 *
 * A dieta e a tela do plano pronto mostram os mesmos macros; a proteína fica
 * com o jade da marca porque é o macro que o app existe para defender.
 */
export const MACRO_COLORS = {
  protein: "var(--chart-1)",
  carbs: "var(--chart-2)",
  fat: "var(--chart-4)",
  fiber: "var(--chart-5)",
} as const;
