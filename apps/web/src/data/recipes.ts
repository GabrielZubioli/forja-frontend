import { supabase } from "@/integrations/supabase/client";
import { assertOk, num, unwrapList } from "@/data/supabase-helpers";
import type { MealValue } from "@/lib/labels";
import { recipeNutrition } from "@forja/domain";

/**
 * Receitas: as prontas (do sistema, `user_id` nulo — todos leem, ninguém
 * edita) e as da pessoa. Uma receita entra na refeição como os ingredientes
 * dela, na proporção das porções escolhidas — assim os macros do dia somam o
 * que de fato foi comido, e cada ingrediente pode ser ajustado depois.
 */

export const RECIPE_CATEGORIES = [
  { key: "vitaminas", label: "Vitaminas e shakes", emoji: "🥤" },
  { key: "cafe-da-manha", label: "Café da manhã", emoji: "🍳" },
  { key: "sanduiches", label: "Sanduíches", emoji: "🥪" },
  { key: "pratos", label: "Pratos", emoji: "🍛" },
  { key: "saladas", label: "Saladas", emoji: "🥗" },
  { key: "lanches", label: "Lanches", emoji: "🥜" },
  { key: "bolos-e-doces", label: "Bolos e doces", emoji: "🍰" },
] as const;

export type RecipeCategory = (typeof RECIPE_CATEGORIES)[number]["key"];

export function recipeCategoryOf(key: string | null) {
  return RECIPE_CATEGORIES.find((c) => c.key === key) ?? null;
}

export interface RecipeSummary {
  id: string;
  name: string;
  category: string | null;
  /** Foto do prato (receitas do sistema); null = mostrar o símbolo da categoria. */
  imageUrl: string | null;
  servings: number;
  prepMinutes: number | null;
  instructions: string | null;
  isSystem: boolean;
  items: { foodId: string; name: string; grams: number }[];
  /** Macros de uma porção. */
  perServing: { kcal: number; proteinG: number; carbsG: number; fatG: number };
}

/** Todas as receitas visíveis: as prontas e as da pessoa. */
export async function fetchRecipes(): Promise<RecipeSummary[]> {
  const rows = unwrapList(
    "carregar receitas",
    await supabase
      .from("recipes")
      .select(
        "id, name, category, image_url, servings, prep_minutes, instructions, user_id, recipe_items(food_id, grams, foods(name, serving_size_g, kcal, protein_g, carbs_g, fat_g))",
      )
      .is("deleted_at", null)
      .order("name"),
  );

  return rows.map((r) => {
    const porcoes = Math.max(1, num(r.servings, 1));
    const itens = r.recipe_items ?? [];
    // Mesma conta do diário e do gerador: ingredientes reais ÷ rendimento.
    const { perServing } = recipeNutrition(
      itens.map((i) => ({
        food: {
          servingSizeG: num(i.foods?.serving_size_g, 100),
          kcal: num(i.foods?.kcal),
          proteinG: num(i.foods?.protein_g),
          carbsG: num(i.foods?.carbs_g),
          fatG: num(i.foods?.fat_g),
        },
        grams: num(i.grams),
      })),
      porcoes,
    );
    const items = itens.map((i) => ({
      foodId: i.food_id,
      name: i.foods?.name ?? "Alimento",
      grams: num(i.grams),
    }));
    return {
      id: r.id,
      name: r.name,
      category: r.category,
      imageUrl: r.image_url,
      servings: porcoes,
      prepMinutes: r.prep_minutes,
      instructions: r.instructions,
      isSystem: r.user_id === null,
      items,
      perServing: {
        kcal: perServing.kcal,
        proteinG: perServing.proteinG,
        carbsG: perServing.carbsG,
        fatG: perServing.fatG,
      },
    };
  });
}

/**
 * Lança uma receita numa refeição do dia: um item por ingrediente, com as
 * gramas da proporção pedida. Já entra consumida — como qualquer item
 * adicionado à mão, quem lança está relatando o que comeu.
 */
export async function addRecipeToMeal(params: {
  userId: string;
  date: string;
  slot: MealValue;
  recipe: RecipeSummary;
  portions: number;
}): Promise<number> {
  const { userId, date, slot, recipe, portions } = params;
  const fator = portions / recipe.servings;
  const agora = new Date().toISOString();
  assertOk(
    "adicionar receita",
    await supabase.from("food_log_entries").insert(
      recipe.items.map((i) => ({
        user_id: userId,
        food_id: i.foodId,
        meal_slot: slot,
        log_date: date,
        grams: Math.round(i.grams * fator),
        servings: 1,
        consumed: true,
        consumed_at: agora,
        source: "recipe",
        notes: recipe.name,
      })),
    ),
  );
  return recipe.items.length;
}
