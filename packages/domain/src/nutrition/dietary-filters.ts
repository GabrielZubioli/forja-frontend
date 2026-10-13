import type { FoodTag } from "./curated-foods";
import type { CatalogFood } from "./food-catalog";

/**
 * Restrições do questionário → marcadores que elas excluem.
 *
 * A exclusão é pelos marcadores declarados no catálogo curado, nunca por trecho
 * do nome. Alergia e dieta são regra dura: nenhuma etapa da geração as afrouxa.
 */
export const RESTRICTION_TAGS: Record<string, readonly FoodTag[]> = {
  // Dietas
  vegetarian: ["meat", "fish", "seafood"],
  vegan: ["meat", "fish", "seafood", "dairy", "egg", "honey"],
  lactose_free: ["dairy"],
  gluten_free: ["gluten"],
  low_carb: ["starch"],
  // Alergias ("lactose" é a opção "Leite e derivados")
  lactose: ["dairy"],
  gluten: ["gluten"],
  egg: ["egg"],
  peanut: ["peanut"],
  nuts: ["nuts"],
  seafood: ["seafood"],
  fish: ["fish"],
  soy: ["soy"],
};

export interface DietaryRestrictions {
  diets: readonly string[];
  allergies: readonly string[];
  /** "Não gosto de X": exclusão pessoal, por trecho do nome (só tira, nunca põe). */
  dislikedFoods?: readonly string[];
}

/** Restrição desconhecida não pode passar calada: seria uma alergia ignorada. */
export class UnknownRestrictionError extends Error {
  constructor(public readonly restriction: string) {
    super(`Restrição alimentar desconhecida: "${restriction}".`);
    this.name = "UnknownRestrictionError";
  }
}

export function excludedTags(r: DietaryRestrictions): Set<FoodTag> {
  const tags = new Set<FoodTag>();
  for (const key of [...r.diets, ...r.allergies]) {
    if (key === "none") continue;
    const marcadores = RESTRICTION_TAGS[key];
    if (!marcadores) throw new UnknownRestrictionError(key);
    for (const t of marcadores) tags.add(t);
  }
  return tags;
}

/** Minúsculas, sem acento: "Pão Francês" → "pao frances". */
export const normalizeText = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").trim();

/** O alimento é compatível com as restrições? */
export function isAllowed(food: CatalogFood, r: DietaryRestrictions): boolean {
  const proibidos = excludedTags(r);
  if (food.profile.tags.some((t) => proibidos.has(t))) return false;
  const nome = normalizeText(food.name);
  const conceito = food.profile.key.replace(/-/g, " ");
  return !(r.dislikedFoods ?? [])
    .map(normalizeText)
    .some((d) => d.length >= 3 && (nome.includes(d) || conceito.includes(d)));
}

/** O pool seguro. Nunca relaxa nada para ganhar tamanho. */
export function safePool(foods: readonly CatalogFood[], r: DietaryRestrictions): CatalogFood[] {
  return foods.filter((f) => isAllowed(f, r));
}
