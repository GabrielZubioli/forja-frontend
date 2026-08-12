/**
 * Metas adaptativas — liga o filtro de Kalman de `@forja/domain` aos dados reais.
 *
 * A tela de perfil prometia "ajustamos automaticamente conforme seu peso semanal
 * evolui", mas nada no código recalculava nada: as metas só mudavam quando o
 * usuário reabria o perfil e salvava, e continuavam sendo a fórmula de
 * Mifflin-St Jeor com um fator de atividade **declarado por ele mesmo**.
 *
 * O problema de fundo é que esse fator é um chute. Duas pessoas idênticas que se
 * declaram "moderadamente ativas" podem ter TDEEs 500 kcal diferentes. O filtro
 * de Kalman resolve isso medindo: dado quanto você comeu e como seu peso
 * respondeu, ele infere o gasto energético real e separa o peso verdadeiro do
 * ruído da balança (água, glicogênio, conteúdo intestinal).
 *
 * Nada aqui grava sozinho — a estimativa é apresentada com a explicação de como
 * foi obtida, e aplicar é decisão do usuário. Uma caixa-preta que muda a meta
 * calórica sem avisar destrói a confiança no número.
 */
import { supabase } from "@/integrations/supabase/client";
import { num, unwrapList } from "@/data/supabase-helpers";
import { toISODate, todayISO } from "@/lib/date";
import {
  adaptiveCalorieTarget,
  addUtcDays,
  estimateTdeeSeries,
  latestEstimate,
  nutritionTotals,
  type DailyObservation,
  type Goal,
  type TdeeEstimate,
} from "@forja/domain";
import { subDays } from "date-fns";

/** Janela de análise. Curta demais não separa sinal de ruído; longa demais atrasa a adaptação. */
export const ADAPTIVE_WINDOW_DAYS = 60;

/**
 * Requisitos mínimos para o filtro produzir algo confiável.
 *
 * Com poucas pesagens, a estimativa de TDEE fica dominada pela incerteza
 * inicial; com poucos dias de diário, o "quanto entrou" é chute. Preferimos
 * dizer "ainda não dá" a mostrar um número ruim com cara de precisão.
 */
export const MIN_WEIGH_INS = 8;
export const MIN_LOGGED_DAYS = 10;
export const MIN_SPAN_DAYS = 14;

/** Variação de peso semanal alvo (kg) por objetivo — ritmos sustentáveis. */
const WEEKLY_TARGET_BY_GOAL: Record<Goal, number> = {
  lose: -0.5,
  maintain: 0,
  gain: 0.25,
};

export type AdaptiveReadiness = {
  ready: false;
  weighIns: number;
  loggedDays: number;
  spanDays: number;
  /** O que falta, em linguagem apresentável. */
  missing: string[];
};

export type AdaptiveResult = {
  ready: true;
  /** Série completa de estimativas (uma por dia da janela). */
  series: TdeeEstimate[];
  latest: TdeeEstimate;
  /** TDEE estimado a partir dos dados, arredondado. */
  estimatedTdee: number;
  /** Peso "real" filtrado, sem o ruído da balança. */
  filteredWeightKg: number;
  /** Variação semanal de peso observada pela tendência filtrada (kg/semana). */
  observedWeeklyChangeKg: number;
  /** Variação semanal alvo, derivada do objetivo do perfil. */
  targetWeeklyChangeKg: number;
  /** Meta calórica sugerida para atingir o alvo. */
  suggestedKcal: number;
  /** Média de calorias efetivamente consumidas nos dias registrados. */
  averageIntakeKcal: number;
  weighIns: number;
  loggedDays: number;
  /** Confiança da estimativa, derivada da variância do filtro. */
  confidence: "baixa" | "média" | "alta";
};

export type AdaptiveGoals = AdaptiveResult | AdaptiveReadiness;

export function isAdaptiveReady(result: AdaptiveGoals): result is AdaptiveResult {
  return result.ready;
}

/**
 * Monta a série diária de observações e roda o filtro.
 *
 * @param fallbackTdee TDEE pela fórmula, usado como palpite inicial do filtro.
 *                     Só influencia os primeiros dias: a incerteza inicial alta
 *                     faz o filtro convergir rápido para o que os dados dizem.
 */
export async function computeAdaptiveGoals(params: {
  goal: Goal;
  fallbackTdee: number;
}): Promise<AdaptiveGoals> {
  const from = toISODate(subDays(new Date(), ADAPTIVE_WINDOW_DAYS));
  const today = todayISO();

  const [weightRows, logRows] = await Promise.all([
    supabase
      .from("body_weights")
      .select("log_date, weight_kg")
      .gte("log_date", from)
      .order("log_date")
      .then((r) => unwrapList("carregar pesagens", r)),
    supabase
      .from("food_log_entries")
      .select("log_date, grams, servings, foods(serving_size_g, kcal, protein_g, carbs_g, fat_g)")
      .gte("log_date", from)
      .order("log_date")
      .then((r) => unwrapList("carregar diário do período", r)),
  ]);

  const weightByDate = new Map<string, number>();
  for (const row of weightRows) weightByDate.set(row.log_date, num(row.weight_kg));

  // Agrega as entradas do diário por dia usando a mesma convenção de porção do
  // resto do app, em vez de reimplementar o cálculo aqui.
  const entriesByDate = new Map<string, typeof logRows>();
  for (const row of logRows) {
    const bucket = entriesByDate.get(row.log_date);
    if (bucket) bucket.push(row);
    else entriesByDate.set(row.log_date, [row]);
  }

  const intakeByDate = new Map<string, number>();
  for (const [date, entries] of entriesByDate) {
    const totals = nutritionTotals(
      entries.map((e) => ({
        food: {
          servingSizeG: e.foods?.serving_size_g ?? 100,
          kcal: e.foods?.kcal ?? 0,
          proteinG: e.foods?.protein_g ?? 0,
          carbsG: e.foods?.carbs_g ?? 0,
          fatG: e.foods?.fat_g ?? 0,
        },
        grams: e.grams,
        servings: e.servings,
      })),
    );
    // Um dia com registro simbólico (ex.: 40 kcal) é esquecimento, não jejum —
    // tratá-lo como ingestão real enviesaria o TDEE para baixo.
    if (totals.kcal >= 500) intakeByDate.set(date, totals.kcal);
  }

  const weighIns = weightByDate.size;
  const loggedDays = intakeByDate.size;

  const firstWeightDate = weightRows[0]?.log_date;
  const spanDays = firstWeightDate ? countDays(firstWeightDate, today) : 0;

  if (weighIns < MIN_WEIGH_INS || loggedDays < MIN_LOGGED_DAYS || spanDays < MIN_SPAN_DAYS) {
    return {
      ready: false,
      weighIns,
      loggedDays,
      spanDays,
      missing: describeMissing({ weighIns, loggedDays, spanDays }),
    };
  }

  // Série contínua do primeiro registro até hoje: dias sem pesagem só fazem o
  // passo de predição, dias sem diário assumem balanço neutro.
  const observations: DailyObservation[] = [];
  for (let date = firstWeightDate!; date <= today; date = addUtcDays(date, 1)) {
    observations.push({
      date,
      weightKg: weightByDate.get(date) ?? null,
      intakeKcal: intakeByDate.get(date) ?? null,
    });
  }

  const series = estimateTdeeSeries(observations, {
    weightKg: weightByDate.get(firstWeightDate!) ?? 70,
    tdeeKcal: fallbackOrDefault(params.fallbackTdee),
    // Incerteza inicial alta no TDEE: o palpite da fórmula não deve dominar os dados.
    tdeeVar: 250_000,
  });

  const latest = latestEstimate(series);
  if (!latest) {
    return {
      ready: false,
      weighIns,
      loggedDays,
      spanDays,
      missing: ["dados suficientes para estimar"],
    };
  }

  const observedWeeklyChangeKg = weeklyChange(series);
  const targetWeeklyChangeKg = WEEKLY_TARGET_BY_GOAL[params.goal];
  const averageIntakeKcal =
    Array.from(intakeByDate.values()).reduce((sum, v) => sum + v, 0) / loggedDays;

  return {
    ready: true,
    series,
    latest,
    estimatedTdee: Math.round(latest.tdeeKcal),
    filteredWeightKg: Number(latest.weightKg.toFixed(1)),
    observedWeeklyChangeKg: Number(observedWeeklyChangeKg.toFixed(2)),
    targetWeeklyChangeKg,
    suggestedKcal: adaptiveCalorieTarget(latest.tdeeKcal, targetWeeklyChangeKg),
    averageIntakeKcal: Math.round(averageIntakeKcal),
    weighIns,
    loggedDays,
    confidence: confidenceFrom(latest.tdeeVar),
  };
}

/** Variação de peso por semana, medida sobre os últimos 14 dias da tendência filtrada. */
function weeklyChange(series: readonly TdeeEstimate[]): number {
  const window = series.slice(-14);
  if (window.length < 2) return 0;
  const first = window[0]!;
  const last = window[window.length - 1]!;
  const days = Math.max(1, window.length - 1);
  return ((last.weightKg - first.weightKg) / days) * 7;
}

/**
 * O desvio-padrão do TDEE estimado indica quanto o filtro ainda "não sabe".
 * ~±60 kcal é bom o bastante para decidir; acima de ~±150 kcal, ainda é chute.
 */
function confidenceFrom(tdeeVar: number): "baixa" | "média" | "alta" {
  const stdDev = Math.sqrt(Math.max(0, tdeeVar));
  if (stdDev <= 60) return "alta";
  if (stdDev <= 150) return "média";
  return "baixa";
}

function describeMissing(counts: {
  weighIns: number;
  loggedDays: number;
  spanDays: number;
}): string[] {
  const missing: string[] = [];
  if (counts.weighIns < MIN_WEIGH_INS) {
    missing.push(`${MIN_WEIGH_INS - counts.weighIns} pesagem(ns) a mais`);
  }
  if (counts.loggedDays < MIN_LOGGED_DAYS) {
    missing.push(`${MIN_LOGGED_DAYS - counts.loggedDays} dia(s) de diário alimentar completo`);
  }
  if (counts.spanDays < MIN_SPAN_DAYS) {
    missing.push(`${MIN_SPAN_DAYS - counts.spanDays} dia(s) de histórico`);
  }
  return missing;
}

/** Dias entre duas chaves `YYYY-MM-DD`, inclusivo. */
function countDays(fromDate: string, toDate: string): number {
  let days = 1;
  for (let d = fromDate; d < toDate; d = addUtcDays(d, 1)) days += 1;
  return days;
}

/** Um palpite inicial inválido (perfil incompleto) cai num valor neutro plausível. */
function fallbackOrDefault(tdeeValue: number): number {
  return Number.isFinite(tdeeValue) && tdeeValue > 800 ? tdeeValue : 2200;
}
