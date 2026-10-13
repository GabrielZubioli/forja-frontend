import { z } from "zod";
import { profileFor, type CulinaryRole, type FoodProfile } from "./curated-foods";

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

/**
 * Papéis culinários possíveis de um alimento sem perfil curado — só para
 * substituição. A categoria é ambígua ("grain" é arroz e é pão), então vale
 * mais de um papel; com perfil curado, vale exatamente o dele.
 */
const CULINARY_BY_CATEGORY: Record<FoodCategory, readonly CulinaryRole[]> = {
  protein_meat: ["protein"],
  protein_egg: ["protein"],
  dairy: ["dairy"],
  supplement: ["protein", "dairy"],
  legume: ["legume"],
  grain: ["starch", "bread"],
  tuber: ["starch"],
  sweet: ["bread"],
  fat: ["fat", "nuts"],
  vegetable: ["vegetable"],
  fruit: ["fruit"],
  beverage: ["fruit", "dairy"],
  condiment: ["fat"],
  prepared: ["starch"],
  other: ["starch", "bread"],
};

export function culinaryRolesOf(
  food: FoodCandidate & { profile?: FoodProfile },
): readonly CulinaryRole[] {
  return food.profile ? [food.profile.role] : CULINARY_BY_CATEGORY[food.category];
}

/** Alimento prescritível: macros do banco (por 100 g) + perfil curado. */
export interface CatalogFood extends FoodCandidate {
  profile: FoodProfile;
}

/**
 * Por que os macros de um alimento não servem para prescrição — ou `null`.
 *
 * O seed da TACO tem itens com tudo zerado ("Leite, de vaca, integral") e o
 * gerador não pode tratar ausência de dado como "zero caloria". A conferência
 * de Atwater (4·P + 4·C + 9·G ≈ kcal) pega valores trocados ou truncados; a
 * folga absoluta cobre vegetais, em que fibra e arredondamento pesam muito.
 */
export function nutritionDataIssue(food: FoodCandidate): string | null {
  const valores = [food.kcal, food.proteinG, food.carbsG, food.fatG, food.fiberG];
  if (valores.some((v) => !Number.isFinite(v) || v < 0)) return "macros inválidos";
  if (food.kcal <= 0) return "sem calorias declaradas";
  const atwater = food.proteinG * 4 + food.carbsG * 4 + food.fatG * 9;
  if (Math.abs(atwater - food.kcal) > Math.max(food.kcal * 0.25, 15)) {
    return "calorias incoerentes com os macros";
  }
  return null;
}

export interface CatalogRow extends FoodCandidate {
  externalId?: string | null | undefined;
  isPublic?: boolean | undefined;
}

/**
 * Do banco para o catálogo prescritível.
 *
 * Fica só o que tem perfil curado **e** macros confiáveis. Um mesmo alimento
 * pode chegar por apelidos diferentes (TACO, catálogo local, base original):
 * fica um por conceito, na ordem de preferência declarada em `ids`.
 */
export function buildCatalog(rows: readonly CatalogRow[]): {
  foods: CatalogFood[];
  rejected: { name: string; reason: string }[];
} {
  const porConceito = new Map<string, { food: CatalogFood; rank: number }>();
  const rejected: { name: string; reason: string }[] = [];

  for (const row of rows) {
    const profile = profileFor(row);
    if (!profile) continue;
    const issue = nutritionDataIssue(row);
    if (issue) {
      rejected.push({ name: row.name, reason: issue });
      continue;
    }
    const id = row.externalId ?? `name:${row.name}`;
    const rank = profile.ids.indexOf(id);
    const atual = porConceito.get(profile.key);
    if (atual && atual.rank <= rank) continue;
    const { externalId: _e, isPublic: _p, ...candidate } = row;
    porConceito.set(profile.key, { food: { ...candidate, profile }, rank });
  }

  const foods = [...porConceito.values()]
    .map((x) => x.food)
    .sort((a, b) => a.profile.key.localeCompare(b.profile.key));
  return { foods, rejected };
}
