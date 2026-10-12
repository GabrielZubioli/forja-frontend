/**
 * Cardápio da semana: editar o plano alimentar dia a dia.
 *
 * Um item do plano vale para todos os dias (`weekday` nulo) ou para um dia só.
 * Mexer no cardápio de um dia muda os dias **futuros** daquele dia da semana:
 * os que ainda não foram abertos já nascem certos, e os já montados que não
 * têm nada marcado como comido são remontados. O passado nunca muda.
 */
import { weekdayOf } from "@forja/domain";
import { supabase } from "@/integrations/supabase/client";
import { assertOk, unwrapList } from "@/data/supabase-helpers";
import type { ActiveMealPlan } from "@/data/meal-plans";
import { todayISO } from "@/lib/date";

type Item = ActiveMealPlan["meals"][number]["items"][number];

/** Itens que valem num dia da semana: os de todo dia e os daquele dia. */
export function itensDoDia<T extends { weekday: number | null }>(itens: T[], dia: number): T[] {
  return itens.filter((i) => i.weekday === null || i.weekday === dia);
}

export async function addPlanItem(
  mealId: string,
  foodId: string,
  grams: number,
  weekday: number | null,
  position: number,
): Promise<void> {
  assertOk(
    "adicionar ao cardápio",
    await supabase
      .from("meal_plan_items")
      .insert({ meal_id: mealId, food_id: foodId, grams, weekday, position }),
  );
}

export async function setPlanItemGrams(itemId: string, grams: number): Promise<void> {
  assertOk(
    "ajustar quantidade",
    await supabase.from("meal_plan_items").update({ grams }).eq("id", itemId),
  );
}

/**
 * Tira um item do cardápio de um dia.
 *
 * Item de um dia só: apagado. Item de todo dia: com `todosOsDias`, apagado;
 * senão vira seis cópias, uma para cada um dos outros dias — o dia escolhido
 * fica sem ele e o resto da semana continua igual.
 */
export async function removePlanItem(
  item: Item,
  mealId: string,
  dia: number,
  todosOsDias: boolean,
): Promise<void> {
  if (item.weekday === null && !todosOsDias) {
    const outros = [0, 1, 2, 3, 4, 5, 6].filter((d) => d !== dia);
    assertOk(
      "separar item por dia",
      await supabase.from("meal_plan_items").insert(
        outros.map((d) => ({
          meal_id: mealId,
          food_id: item.foodId,
          grams: item.grams,
          position: item.position,
          prep_notes: item.prepNotes,
          weekday: d,
        })),
      ),
    );
  }
  assertOk("remover do cardápio", await supabase.from("meal_plan_items").delete().eq("id", item.id));
}

/**
 * Copia o cardápio de um dia para outro: o destino perde o que era só dele e
 * recebe uma cópia do que é só da origem. Os itens de todo dia já são comuns.
 */
export async function copyDay(plan: ActiveMealPlan, de: number, para: number): Promise<void> {
  const ids = plan.meals.flatMap((m) => m.items.filter((i) => i.weekday === para).map((i) => i.id));
  if (ids.length > 0) {
    assertOk(
      "limpar o dia de destino",
      await supabase.from("meal_plan_items").delete().in("id", ids),
    );
  }
  const copias = plan.meals.flatMap((m) =>
    m.items
      .filter((i) => i.weekday === de)
      .map((i) => ({
        meal_id: m.id,
        food_id: i.foodId,
        grams: i.grams,
        position: i.position,
        prep_notes: i.prepNotes,
        weekday: para,
      })),
  );
  if (copias.length > 0) {
    assertOk("copiar o dia", await supabase.from("meal_plan_items").insert(copias));
  }
}

/**
 * Faz os dias futuros já montados refletirem o cardápio novo.
 *
 * Para cada dia de hoje em diante do dia da semana alterado (ou de todos, com
 * `null`): saem as linhas do plano ainda não comidas e o registro do dia, e a
 * próxima abertura monta de novo. O que já foi marcado como comido fica.
 */
export async function refreshFutureDays(userId: string, dia: number | null): Promise<void> {
  const hoje = todayISO();
  const dias = unwrapList(
    "listar dias futuros",
    await supabase.from("diet_days").select("log_date").eq("user_id", userId).gte("log_date", hoje),
  )
    .map((d) => d.log_date)
    .filter((d) => dia === null || weekdayOf(d) === dia);
  if (dias.length === 0) return;

  assertOk(
    "remontar dias futuros",
    await supabase
      .from("food_log_entries")
      .delete()
      .eq("user_id", userId)
      .eq("source", "plan")
      .eq("consumed", false)
      .in("log_date", dias),
  );
  assertOk(
    "liberar dias futuros",
    await supabase.from("diet_days").delete().eq("user_id", userId).in("log_date", dias),
  );
}
