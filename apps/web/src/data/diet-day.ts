import { supabase } from "@/integrations/supabase/client";
import { assertOk, num, unwrapList, unwrapMaybe } from "@/data/supabase-helpers";
import type { MealSlot } from "@forja/domain";

/**
 * O dia do diário.
 *
 * ## Materialização
 *
 * Ao abrir um dia pela primeira vez, o plano ativo é **copiado** para
 * `food_log_entries` com `consumed = false`. Cada item vira uma linha real,
 * marcável.
 *
 * A alternativa — calcular o dia por junção com o plano, sem gravar nada —
 * parece mais limpa e é pior em duas situações que acontecem toda semana:
 *
 * 1. **Editar só hoje.** Trocar o almoço de terça sem alterar o plano exigiria
 *    uma tabela de exceções por dia, que é a materialização de novo, só que
 *    mais complicada.
 * 2. **O passado mudar sozinho.** Alterar o plano em março reescreveria o que
 *    o app afirma que você comeu em janeiro. Histórico que muda
 *    retroativamente não é histórico.
 *
 * `diet_days` registra que o dia já foi materializado — sem isso, apagar todos
 * os itens de uma terça faria o app remontá-la na próxima abertura, e o usuário
 * nunca conseguiria ter um dia deliberadamente vazio.
 */

export interface DayEntry {
  id: string;
  slot: MealSlot;
  foodId: string;
  name: string;
  grams: number;
  consumed: boolean;
  planItemId: string | null;
  source: string;
  food: {
    servingSizeG: number;
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number;
    imageUrl: string | null;
    category: string | null;
    /** Medida caseira ("2 fatias") e o peso que ela representa. */
    measure: string | null;
    measureG: number | null;
  };
}

/**
 * Garante que o dia exista, materializando-o do plano ativo se for a primeira
 * abertura.
 *
 * Só materializa **de hoje em diante**: remontar retroativamente um dia que a
 * pessoa simplesmente não registrou inventaria refeições que ela não fez, e
 * contaminaria toda a análise de aderência.
 */
export async function ensureDayMaterialized(
  userId: string,
  date: string,
  today: string,
): Promise<void> {
  if (date < today) return;

  const existing = unwrapMaybe(
    "verificar dia do diário",
    await supabase
      .from("diet_days")
      .select("log_date")
      .eq("user_id", userId)
      .eq("log_date", date)
      .maybeSingle(),
  );
  if (existing) return;

  const plan = unwrapMaybe(
    "carregar plano ativo",
    await supabase
      .from("meal_plans")
      .select("id")
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle(),
  );

  // Sem plano, o dia nasce vazio e é registrado como visitado — o usuário passa
  // a montar à mão, que é um modo de uso legítimo.
  if (!plan) {
    assertOk(
      "registrar dia do diário",
      await supabase
        .from("diet_days")
        .upsert(
          { user_id: userId, log_date: date, plan_id: null },
          { onConflict: "user_id,log_date" },
        ),
    );
    return;
  }

  const meals = unwrapList(
    "carregar refeições do plano",
    await supabase
      .from("meal_plan_meals")
      .select("slot, meal_plan_items(id, food_id, grams)")
      .eq("plan_id", plan.id)
      .order("position"),
  );

  const linhas = meals.flatMap((m) =>
    (m.meal_plan_items ?? []).map((item) => ({
      user_id: userId,
      food_id: item.food_id,
      log_date: date,
      meal_slot: m.slot,
      grams: num(item.grams),
      servings: 1,
      plan_item_id: item.id,
      consumed: false,
      source: "plan",
    })),
  );

  if (linhas.length > 0) {
    // Inserção simples, e não `upsert`.
    //
    // O índice único de (plan_item_id, log_date) é **parcial**
    // (`WHERE plan_item_id IS NOT NULL`), e o Postgres não infere índice
    // parcial numa cláusula `ON CONFLICT` sem o predicado — que o PostgREST
    // não tem como enviar. O `upsert` que estava aqui falhava com 42P10 em
    // toda materialização com itens, e o erro subia como "não foi possível
    // montar o dia": a dieta ficava vazia sem que nada indicasse o motivo.
    //
    // Sem `ON CONFLICT`, a proteção contra duas abas abrindo o mesmo dia passa
    // a ser o filtro abaixo, mais o tratamento do 23505 — que é o conflito
    // acontecendo, não um erro do usuário.
    const jaMaterializados = new Set(
      unwrapList(
        "verificar itens já materializados",
        await supabase
          .from("food_log_entries")
          .select("plan_item_id")
          .eq("user_id", userId)
          .eq("log_date", date)
          .not("plan_item_id", "is", null),
      ).map((r) => r.plan_item_id),
    );

    const novas = linhas.filter((l) => !jaMaterializados.has(l.plan_item_id));

    if (novas.length > 0) {
      const resultado = await supabase.from("food_log_entries").insert(novas);
      if (resultado.error && resultado.error.code !== "23505") {
        assertOk("montar o dia a partir do plano", resultado);
      }
    }
  }

  assertOk(
    "registrar dia do diário",
    await supabase
      .from("diet_days")
      .upsert(
        { user_id: userId, log_date: date, plan_id: plan.id },
        { onConflict: "user_id,log_date" },
      ),
  );
}

export async function fetchDayEntries(date: string): Promise<DayEntry[]> {
  const rows = unwrapList(
    "carregar diário",
    await supabase
      .from("food_log_entries")
      // Precisa ser um literal único: o supabase-js infere o tipo do retorno a
      // partir do texto do `select`, e uma concatenação com `+` produz `string`
      // genérica — todo o resultado colapsa para `GenericStringError`.
      .select(
        "id, meal_slot, food_id, grams, servings, consumed, plan_item_id, source, foods(name, serving_size_g, kcal, protein_g, carbs_g, fat_g, fiber_g, image_url, category, household_measure, household_grams)",
      )
      .eq("log_date", date)
      .order("created_at"),
  );

  return rows.map((r) => ({
    id: r.id,
    slot: r.meal_slot as MealSlot,
    foodId: r.food_id,
    name: r.foods?.name ?? "Alimento removido",
    // `grams` é nulo quando o registro veio por porções; converter aqui evita
    // espalhar a regra `grams ?? servings * serving_size` por toda a UI.
    grams: r.grams !== null ? num(r.grams) : num(r.servings, 1) * num(r.foods?.serving_size_g, 100),
    consumed: r.consumed,
    planItemId: r.plan_item_id,
    source: r.source,
    food: {
      servingSizeG: num(r.foods?.serving_size_g, 100),
      kcal: num(r.foods?.kcal),
      proteinG: num(r.foods?.protein_g),
      carbsG: num(r.foods?.carbs_g),
      fatG: num(r.foods?.fat_g),
      fiberG: num(r.foods?.fiber_g),
      imageUrl: r.foods?.image_url ?? null,
      category: r.foods?.category ?? null,
      measure: r.foods?.household_measure ?? null,
      measureG:
        r.foods?.household_grams !== undefined ? num(r.foods.household_grams, 0) || null : null,
    },
  }));
}

/**
 * Ajusta a quantidade de um item do dia.
 *
 * Editar a porção é a correção mais comum do diário — o plano manda 150 g de
 * arroz e a pessoa comeu meia concha a mais. Sem isso, a única saída era
 * remover e adicionar de novo, o que perde a origem (`plan`) e faz o item
 * deixar de contar como aderência ao plano.
 */
export async function setEntryGrams(entryId: string, grams: number): Promise<void> {
  assertOk(
    "ajustar quantidade",
    await supabase
      .from("food_log_entries")
      .update({ grams: Math.max(1, Math.round(grams)), servings: 1 })
      .eq("id", entryId),
  );
}

/** Marca ou desmarca um item como consumido. */
export async function setConsumed(entryId: string, consumed: boolean): Promise<void> {
  assertOk(
    consumed ? "marcar como consumido" : "desmarcar item",
    await supabase
      .from("food_log_entries")
      .update({ consumed, consumed_at: consumed ? new Date().toISOString() : null })
      .eq("id", entryId),
  );
}

/** Marca todos os itens de uma refeição de uma vez. */
export async function setMealConsumed(
  date: string,
  slot: MealSlot,
  consumed: boolean,
): Promise<void> {
  assertOk(
    "concluir refeição",
    await supabase
      .from("food_log_entries")
      .update({ consumed, consumed_at: consumed ? new Date().toISOString() : null })
      .eq("log_date", date)
      .eq("meal_slot", slot),
  );
}

/**
 * Troca o alimento de um item mantendo a posição na refeição.
 *
 * A quantidade vem calculada pelo domínio (`findSubstitutions`), que a ajusta
 * para preservar o macro dominante — trocar 150 g de frango por 150 g de feijão
 * não seria substituir.
 */
export async function substituteEntry(
  entryId: string,
  newFoodId: string,
  grams: number,
): Promise<void> {
  assertOk(
    "substituir alimento",
    await supabase
      .from("food_log_entries")
      .update({ food_id: newFoodId, grams, servings: 1, source: "manual" })
      .eq("id", entryId),
  );
}

/** Registra a troca como preferência, para subir nas próximas sugestões. */
export async function recordSubstitutionPreference(
  userId: string,
  foodId: string,
  substituteId: string,
): Promise<void> {
  const existing = unwrapMaybe(
    "ler preferência de substituição",
    await supabase
      .from("food_substitution_prefs")
      .select("times_used")
      .eq("user_id", userId)
      .eq("food_id", foodId)
      .eq("substitute_id", substituteId)
      .maybeSingle(),
  );

  assertOk(
    "salvar preferência de substituição",
    await supabase.from("food_substitution_prefs").upsert(
      {
        user_id: userId,
        food_id: foodId,
        substitute_id: substituteId,
        times_used: (existing?.times_used ?? 0) + 1,
      },
      { onConflict: "user_id,food_id,substitute_id" },
    ),
  );
}

// ------------------------------------------------------------------- água

export async function fetchWaterMl(date: string): Promise<number> {
  const rows = unwrapList(
    "carregar consumo de água",
    await supabase.from("water_intake").select("ml").eq("log_date", date),
  );
  return rows.reduce((sum, r) => sum + num(r.ml), 0);
}

export async function addWater(userId: string, date: string, ml: number): Promise<void> {
  assertOk(
    "registrar água",
    await supabase.from("water_intake").insert({ user_id: userId, log_date: date, ml }),
  );
}

/**
 * Remove o último registro do dia.
 *
 * Desfazer o último copo é o erro mais comum aqui — daí o registro ser por
 * gole, e não um total por dia que precisaria ser editado à mão.
 */
export async function undoLastWater(date: string): Promise<void> {
  const last = unwrapMaybe(
    "localizar último registro de água",
    await supabase
      .from("water_intake")
      .select("id")
      .eq("log_date", date)
      .order("logged_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  if (!last) return;

  assertOk(
    "desfazer registro de água",
    await supabase.from("water_intake").delete().eq("id", last.id),
  );
}
