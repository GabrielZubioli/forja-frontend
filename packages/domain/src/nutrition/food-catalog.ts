import { z } from "zod";

/**
 * Vocabulário de alimentos usado pelo domínio.
 *
 * O domínio não conhece o banco: ele recebe candidatos já carregados e devolve
 * decisões. Isso é o que permite testar o gerador de dieta com dez alimentos
 * inventados, sem Supabase, e o que permitiria trocar a fonte de dados sem
 * tocar em nenhuma regra.
 *
 * Todos os valores são **por 100 g** — a convenção da TACO e da coluna
 * `serving_size_g` do banco.
 */

export const FOOD_CATEGORIES = [
  "protein_meat",
  "protein_egg",
  "dairy",
  "legume",
  "grain",
  "tuber",
  "vegetable",
  "fruit",
  "fat",
  "beverage",
  "supplement",
  "sweet",
  "condiment",
  "prepared",
  "other",
] as const;

export type FoodCategory = (typeof FOOD_CATEGORIES)[number];

export const foodCandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(FOOD_CATEGORIES),
  kcal: z.number().nonnegative(),
  proteinG: z.number().nonnegative(),
  carbsG: z.number().nonnegative(),
  fatG: z.number().nonnegative(),
  fiberG: z.number().nonnegative().default(0),
  /** 0–100. Desempata entre alimentos igualmente adequados. */
  popularity: z.number().min(0).max(100).default(50),
});

export type FoodCandidate = z.infer<typeof foodCandidateSchema>;

/**
 * Papel do alimento no prato.
 *
 * É o eixo em que a substituição faz sentido: trocar arroz por batata funciona
 * porque ambos ocupam o papel de fonte de carboidrato. Trocar arroz por azeite
 * não funciona, mesmo que exista uma quantidade de azeite com as mesmas
 * calorias.
 */
export type FoodRole = "protein" | "carb" | "fat" | "produce";

const ROLE_BY_CATEGORY: Record<FoodCategory, FoodRole> = {
  protein_meat: "protein",
  protein_egg: "protein",
  dairy: "protein",
  supplement: "protein",
  legume: "carb",
  grain: "carb",
  tuber: "carb",
  sweet: "carb",
  fat: "fat",
  vegetable: "produce",
  fruit: "produce",
  beverage: "produce",
  condiment: "produce",
  prepared: "carb",
  other: "carb",
};

/**
 * Papel do alimento, corrigido pelos macros quando a categoria engana.
 *
 * Laticínio é a categoria em que isso mais dói: iogurte natural é fonte de
 * proteína, requeijão é fonte de gordura, e ambos são `dairy`. Confiar só na
 * categoria colocaria manteiga como fonte de proteína numa refeição.
 */
export function foodRole(food: FoodCandidate): FoodRole {
  const base = ROLE_BY_CATEGORY[food.category];

  const kcalProt = food.proteinG * 4;
  const kcalCarb = food.carbsG * 4;
  const kcalFat = food.fatG * 9;
  const total = kcalProt + kcalCarb + kcalFat;
  if (total < 1) return base;

  // Reclassifica só quando um macro domina de forma inequívoca. Um limiar
  // baixo faria quase tudo virar "carb" e apagaria a intenção da categoria.
  if (kcalFat / total > 0.7) return "fat";
  if (kcalProt / total > 0.55) return "protein";

  return base;
}

/** Densidade calórica por grama. Usada para não prescrever 700 g de alface. */
export function kcalPerGram(food: FoodCandidate): number {
  return food.kcal / 100;
}
