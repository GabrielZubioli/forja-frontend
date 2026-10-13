import { supabase } from "@/integrations/supabase/client";
import { assertOk, num, unwrap, unwrapList, unwrapMaybe } from "@/data/supabase-helpers";
import {
  buildCatalog,
  selectMealSlots,
  CURATED_EXTERNAL_IDS,
  CURATED_PUBLIC_NAMES,
  DEFAULT_MEALS_PER_DAY,
  type CatalogFood,
  type CatalogRow,
  type DietaryRestrictions,
  type FoodCandidate,
  type MealSlot,
  type ToleranceStatus,
} from "@forja/domain";

/**
 * Plano alimentar — a estrutura que a pessoa preenche, sem geração automática.
 *
 * Aqui fica o que depende do banco: criar o plano vazio, lê-lo de volta,
 * renomear e mudar horários das refeições, e o catálogo curado das trocas.
 */

const FOOD_COLUMNS =
  "id, name, category, kcal, protein_g, carbs_g, fat_g, fiber_g, popularity, serving_size_g, external_id, owner_id" as const;

interface FoodRow {
  id: string;
  name: string;
  category: string | null;
  kcal: unknown;
  protein_g: unknown;
  carbs_g: unknown;
  fat_g: unknown;
  fiber_g: unknown;
  popularity: unknown;
  serving_size_g: unknown;
  external_id: string | null;
  owner_id: string | null;
}

/**
 * Linha de `foods` → candidato do domínio, **por 100 g**.
 *
 * O banco guarda macros por `serving_size_g`, que nem sempre é 100 ("Pão
 * francês" da base original é por 50 g). O gerador antigo ignorava isso e
 * dobrava as calorias do pão; a conversão acontece aqui, uma vez.
 */
export function toCatalogRow(r: FoodRow): CatalogRow {
  const porcao = num(r.serving_size_g, 100) || 100;
  const k = 100 / porcao;
  return {
    id: r.id,
    name: r.name,
    category: (r.category ?? "other") as FoodCandidate["category"],
    kcal: num(r.kcal) * k,
    proteinG: num(r.protein_g) * k,
    carbsG: num(r.carbs_g) * k,
    fatG: num(r.fat_g) * k,
    fiberG: num(r.fiber_g) * k,
    popularity: num(r.popularity, 50),
    externalId: r.external_id,
    isPublic: r.owner_id === null,
  };
}

/**
 * O catálogo prescritível: só alimentos curados no domínio, com macros
 * válidos. Biscoito recheado, arroz cru e itens com dados zerados não entram,
 * mesmo marcados como `is_staple`.
 */
export async function fetchCuratedFoods(): Promise<CatalogFood[]> {
  const [porCodigo, porNome] = await Promise.all([
    supabase
      .from("foods")
      .select(FOOD_COLUMNS)
      .is("deleted_at", null)
      .in("external_id", [...CURATED_EXTERNAL_IDS]),
    supabase
      .from("foods")
      .select(FOOD_COLUMNS)
      .is("deleted_at", null)
      .is("external_id", null)
      .is("owner_id", null)
      .in("name", [...CURATED_PUBLIC_NAMES]),
  ]);
  const rows = [
    ...unwrapList("carregar catálogo curado", porCodigo),
    ...unwrapList("carregar catálogo curado", porNome),
  ];
  const { foods, rejected } = buildCatalog(rows.map(toCatalogRow));
  if (rejected.length > 0) {
    console.warn("[dieta] alimentos curados com dados inválidos ficaram de fora:", rejected);
  }
  return foods;
}

/** Restrições alimentares gravadas no perfil — para substituições e buscas. */
export async function fetchDietaryRestrictions(): Promise<Required<DietaryRestrictions>> {
  const p = unwrapMaybe(
    "carregar restrições alimentares",
    await supabase
      .from("profiles")
      .select("dietary_restrictions, allergies, disliked_foods")
      .maybeSingle(),
  );
  return {
    diets: p?.dietary_restrictions ?? [],
    allergies: p?.allergies ?? [],
    dislikedFoods: p?.disliked_foods ?? [],
  };
}

/**
 * O que ficou registrado da geração, para auditoria e para a tela.
 *
 * Gravado em `meal_plans.notes` (JSON): a coluna existe e não era usada, e
 * evita uma migration só para metadados.
 */
export interface PlanGeneration {
  generator: "habitual-fit";
  rulesVersion: string;
  targetsVersion: string;
  seed: number;
  generatedAt: string;
  days: { weekday: number; kcalDeviation: number; status: ToleranceStatus }[];
  warnings: string[];
}

function parseGeneration(notes: string | null): PlanGeneration | null {
  if (!notes) return null;
  try {
    const v = JSON.parse(notes) as Partial<PlanGeneration>;
    return v.generator === "habitual-fit" && Array.isArray(v.warnings)
      ? (v as PlanGeneration)
      : null;
  } catch {
    return null;
  }
}

export interface ActiveMealPlan {
  id: string;
  name: string;
  kcalTarget: number;
  proteinTarget: number;
  carbsTarget: number;
  fatTarget: number;
  fiberTarget: number;
  /** Metadados da geração automática de planos antigos; `null` nos feitos à mão. */
  generation: PlanGeneration | null;
  meals: {
    id: string;
    slot: MealSlot;
    position: number;
    /** Nome dado pela pessoa; `null` = o nome padrão do horário. */
    label: string | null;
    targetTime: string | null;
    kcalTarget: number;
    items: {
      id: string;
      foodId: string;
      name: string;
      grams: number;
      position: number;
      /** Receita de que o item faz parte (gerador) ou nota livre. */
      prepNotes: string | null;
      /** Dia da semana em que vale (0 = domingo); null = todos os dias. */
      weekday: number | null;
      food: {
        servingSizeG: number;
        kcal: number;
        proteinG: number;
        carbsG: number;
        fatG: number;
        fiberG: number;
        category: string | null;
      };
    }[];
  }[];
}

/**
 * O plano alimentar ativo, **existindo** — e nunca gerado.
 *
 * O app não prescreve dieta: o plano é só a estrutura que a pessoa preenche
 * (sozinha ou com o nutricionista). Havendo plano ativo, ele volta como está,
 * vazio ou não. Sem nenhum, nasce um vazio, com as refeições do questionário
 * (`meals_per_day`) e nada dentro: sem alimentos, quantidades, horários nem
 * metas.
 *
 * Planos antigos, montados pelo gerador que existia antes, continuam valendo e
 * não são tocados.
 */
export async function ensureActiveMealPlan(userId: string): Promise<ActiveMealPlan | null> {
  const atual = await fetchActiveMealPlan();
  if (atual) return atual;

  const perfil = unwrapMaybe(
    "carregar refeições do dia",
    await supabase.from("profiles").select("meals_per_day").maybeSingle(),
  );
  await createEmptyMealPlan(userId, perfil?.meals_per_day ?? DEFAULT_MEALS_PER_DAY);
  return fetchActiveMealPlan();
}

/**
 * Plano vazio com `mealsPerDay` refeições, nos horários típicos do dia (café,
 * almoço, jantar e os lanches entre eles) — só os nomes; o resto é da pessoa.
 * Metas zeradas significam "sem meta".
 */
export async function createEmptyMealPlan(userId: string, mealsPerDay: number): Promise<string> {
  const plan = unwrap(
    "criar plano alimentar",
    await supabase
      .from("meal_plans")
      .insert({
        user_id: userId,
        name: "Minha dieta",
        source: "custom",
        kcal_target: 0,
        protein_g_target: 0,
        carbs_g_target: 0,
        fat_g_target: 0,
        is_active: true,
      })
      .select("id")
      .single(),
  );

  const slots = selectMealSlots({ mealsPerDay });
  try {
    assertOk(
      "criar refeições",
      await supabase
        .from("meal_plan_meals")
        .insert(slots.map((slot, position) => ({ plan_id: plan.id, slot, position }))),
    );
  } catch (error) {
    await supabase.from("meal_plans").delete().eq("id", plan.id);
    throw error;
  }
  return plan.id;
}

export async function fetchActiveMealPlan(): Promise<ActiveMealPlan | null> {
  const plan = unwrapMaybe(
    "carregar plano alimentar",
    await supabase
      .from("meal_plans")
      .select(
        "id, name, kcal_target, protein_g_target, carbs_g_target, fat_g_target, fiber_g_target, notes",
      )
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle(),
  );

  if (!plan) return null;

  const meals = unwrapList(
    "carregar refeições do plano",
    await supabase
      .from("meal_plan_meals")
      .select(
        "id, slot, position, label, target_time, kcal_target, meal_plan_items(id, food_id, grams, position, prep_notes, weekday, foods(name, serving_size_g, kcal, protein_g, carbs_g, fat_g, fiber_g, category))",
      )
      .eq("plan_id", plan.id)
      .order("position"),
  );

  return {
    id: plan.id,
    name: plan.name,
    kcalTarget: num(plan.kcal_target),
    proteinTarget: num(plan.protein_g_target),
    carbsTarget: num(plan.carbs_g_target),
    fatTarget: num(plan.fat_g_target),
    fiberTarget: num(plan.fiber_g_target),
    generation: parseGeneration(plan.notes),
    meals: meals.map((m) => ({
      id: m.id,
      slot: m.slot as MealSlot,
      position: m.position,
      label: m.label,
      targetTime: m.target_time,
      kcalTarget: num(m.kcal_target),
      items: (m.meal_plan_items ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((i) => ({
          id: i.id,
          foodId: i.food_id,
          name: i.foods?.name ?? "Alimento",
          grams: num(i.grams),
          position: i.position,
          prepNotes: i.prep_notes,
          weekday: i.weekday,
          food: {
            servingSizeG: num(i.foods?.serving_size_g, 100),
            kcal: num(i.foods?.kcal),
            proteinG: num(i.foods?.protein_g),
            carbsG: num(i.foods?.carbs_g),
            fatG: num(i.foods?.fat_g),
            fiberG: num(i.foods?.fiber_g),
            category: i.foods?.category ?? null,
          },
        })),
    })),
  };
}

/**
 * Renomeia uma refeição do plano ativo ("Lanche da tarde" → "Shake pós-aula").
 * Nome vazio volta ao padrão. Refeição que ainda não existe no plano (as que
 * aparecem quando a pessoa aumenta as refeições do dia) é criada vazia.
 */
export async function setMealLabel(
  planId: string,
  slot: MealSlot,
  label: string,
  position: number,
): Promise<void> {
  const nome = label.trim() || null;
  const existente = unwrapMaybe(
    "buscar refeição",
    await supabase
      .from("meal_plan_meals")
      .select("id")
      .eq("plan_id", planId)
      .eq("slot", slot)
      .maybeSingle(),
  );
  if (existente) {
    assertOk(
      "renomear refeição",
      await supabase.from("meal_plan_meals").update({ label: nome }).eq("id", existente.id),
    );
    return;
  }
  assertOk(
    "criar refeição",
    await supabase.from("meal_plan_meals").insert({ plan_id: planId, slot, position, label: nome }),
  );
}

/** Muda o horário de uma refeição do plano ativo (cria a refeição se ainda não existe). */
export async function setMealTime(
  planId: string,
  slot: MealSlot,
  time: string,
  position: number,
): Promise<void> {
  const existente = unwrapMaybe(
    "buscar refeição",
    await supabase
      .from("meal_plan_meals")
      .select("id")
      .eq("plan_id", planId)
      .eq("slot", slot)
      .maybeSingle(),
  );
  if (existente) {
    assertOk(
      "mudar horário da refeição",
      await supabase.from("meal_plan_meals").update({ target_time: time }).eq("id", existente.id),
    );
    return;
  }
  assertOk(
    "criar refeição",
    await supabase
      .from("meal_plan_meals")
      .insert({ plan_id: planId, slot, position, target_time: time }),
  );
}
