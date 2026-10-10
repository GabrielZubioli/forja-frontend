/**
 * Peso corporal para os cards da Início e das Estatísticas.
 */
import { supabase } from "@/integrations/supabase/client";
import { num, unwrapList, unwrapMaybe } from "@/data/supabase-helpers";
import { toISODate } from "@/lib/date";

export interface WeighIn {
  /** `YYYY-MM-DD` local. */
  date: string;
  kg: number;
}

/** Pesagens dos últimos `days` dias, da mais antiga à mais nova. */
export async function fetchWeighIns(days: number): Promise<WeighIn[]> {
  const desde = new Date();
  desde.setDate(desde.getDate() - days);
  return unwrapList(
    "carregar peso",
    await supabase
      .from("body_weights")
      .select("log_date, weight_kg")
      .gte("log_date", toISODate(desde))
      .order("log_date"),
  ).map((r) => ({ date: r.log_date, kg: num(r.weight_kg) }));
}

/** Meta de peso do perfil, se definida. */
export async function fetchGoalWeight(): Promise<number | null> {
  const p = unwrapMaybe(
    "carregar meta de peso",
    await supabase.from("profiles").select("goal_weight_kg").maybeSingle(),
  );
  return p?.goal_weight_kg == null ? null : num(p.goal_weight_kg);
}

/** Total de treinos concluídos e os do mês corrente. */
export async function fetchWorkoutCounts(): Promise<{ total: number; month: number }> {
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);
  const base = () =>
    supabase
      .from("workout_sessions")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .not("ended_at", "is", null);
  const [total, mes] = await Promise.all([
    base(),
    base().gte("started_at", inicioMes.toISOString()),
  ]);
  if (total.error) throw total.error;
  if (mes.error) throw mes.error;
  return { total: total.count ?? 0, month: mes.count ?? 0 };
}
