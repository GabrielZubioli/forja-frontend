import { z } from "zod";

/**
 * As refeições do dia e como as calorias se distribuem entre elas.
 *
 * ## Por que oito e não quatro
 *
 * O modelo antigo tinha café, almoço, jantar e "lanche". Pré e pós-treino
 * caíam todos em "lanche", o que impedia duas coisas: prescrever (a composição
 * de um pré-treino é diferente da de um lanche qualquer) e ler (não dava para
 * saber se a pessoa comeu antes ou depois de treinar).
 *
 * ## Por que a distribuição não é fixa
 *
 * Quem faz três refeições não deve receber 20% das calorias no café e sumir com
 * os outros 80%. As frações abaixo são **pesos relativos**, normalizados sobre
 * as refeições que o usuário de fato usa — a soma sempre fecha em 100%,
 * independentemente de quantas ele escolheu.
 */

export const MEAL_SLOTS = [
  "breakfast",
  "morning_snack",
  "lunch",
  "afternoon_snack",
  "pre_workout",
  "post_workout",
  "dinner",
  "supper",
] as const;

export type MealSlot = (typeof MEAL_SLOTS)[number];

export const mealSlotSchema = z.enum(MEAL_SLOTS);

/**
 * Peso relativo de cada refeição.
 *
 * Refeições principais concentram o volume porque é assim que as pessoas comem;
 * distribuir igualmente entre oito refeições produziria oito lanches e nenhum
 * almoço, o que ninguém sustenta.
 */
const SLOT_WEIGHT: Record<MealSlot, number> = {
  breakfast: 20,
  morning_snack: 8,
  lunch: 28,
  afternoon_snack: 10,
  pre_workout: 7,
  post_workout: 10,
  dinner: 22,
  supper: 5,
};

/**
 * Quantas refeições sugerir a partir do número que o usuário declarou querer.
 *
 * A ordem é de dentro para fora: as principais primeiro, depois os lanches, e
 * pré/pós-treino só quando há espaço. Alguém que pede três refeições recebe
 * café, almoço e jantar — não café, lanche da manhã e ceia.
 */
const SLOT_PRIORITY: readonly MealSlot[] = [
  "lunch",
  "dinner",
  "breakfast",
  "afternoon_snack",
  "post_workout",
  "morning_snack",
  "pre_workout",
  "supper",
];

export interface SlotSelectionInput {
  /** Quantas refeições o usuário quer por dia (3 a 8). Padrão: o dia completo. */
  mealsPerDay?: number | undefined;
  /** Horário do treino em minutos desde a meia-noite, quando informado. */
  workoutMinutes?: number | undefined;
}

/**
 * Escolhe quais refeições compõem o dia.
 *
 * Pré e pós-treino fazem parte do dia padrão. Antes eles só entravam quando o
 * usuário informava o horário do treino — e quem pulava aquela pergunta ficava
 * com um cardápio de seis caixas onde o app prometia oito. O horário do treino
 * continua importando: ele **ancora** as duas refeições (ver `distributeMeals`).
 * Não informá-lo faz o app usar o horário padrão de treino, que é uma
 * aproximação editável, não um motivo para suprimir a refeição.
 */
export function selectMealSlots({ mealsPerDay }: SlotSelectionInput = {}): MealSlot[] {
  const pedidas = mealsPerDay ?? MEAL_SLOTS.length;
  const wanted = Math.max(3, Math.min(MEAL_SLOTS.length, Math.round(pedidas)));

  const escolhidos = SLOT_PRIORITY.slice(0, wanted);
  // Devolve na ordem cronológica, não na de prioridade: a tela do dia é uma
  // linha do tempo.
  return MEAL_SLOTS.filter((s) => escolhidos.includes(s));
}

export interface SlotShare {
  slot: MealSlot;
  /** Fração das calorias do dia (0–1). As frações somam 1. */
  share: number;
  /** Horário sugerido, em minutos desde a meia-noite. */
  minutes: number;
}

/** Horários padrão, usados quando a rotina do usuário não diz outra coisa. */
const DEFAULT_MINUTES: Record<MealSlot, number> = {
  breakfast: 7 * 60,
  morning_snack: 10 * 60,
  lunch: 12 * 60 + 30,
  afternoon_snack: 15 * 60 + 30,
  pre_workout: 17 * 60 + 30,
  post_workout: 19 * 60 + 30,
  dinner: 20 * 60 + 30,
  supper: 22 * 60 + 30,
};

export interface MealScheduleInput {
  slots: readonly MealSlot[];
  /** Minutos desde a meia-noite. */
  wakeMinutes?: number | undefined;
  sleepMinutes?: number | undefined;
  workoutMinutes?: number | undefined;
}

/**
 * Distribui as calorias e ancora os horários.
 *
 * Os horários deslizam com a rotina informada: quem acorda às 10h não recebe um
 * café da manhã às 7h que já passou. O deslocamento é proporcional, preservando
 * o espaçamento entre refeições em vez de empilhá-las.
 */
export function distributeMeals({
  slots,
  wakeMinutes,
  sleepMinutes,
  workoutMinutes,
}: MealScheduleInput): SlotShare[] {
  const ativos = MEAL_SLOTS.filter((s) => slots.includes(s));
  if (ativos.length === 0) return [];

  const somaPesos = ativos.reduce((sum, s) => sum + SLOT_WEIGHT[s], 0);

  // Janela de vigília. Dormir depois da meia-noite (00:30) é o fim do mesmo
  // dia, não o começo — sem isto a janela virava 1 h e todas as refeições
  // caíam entre 7h e 8h.
  const acorda = wakeMinutes ?? DEFAULT_MINUTES.breakfast;
  let dorme = sleepMinutes ?? 23 * 60;
  if (dorme <= acorda) dorme += 24 * 60;

  // A grade padrão desliza com a hora de acordar, com limite: quem acorda às
  // 11h almoça mais tarde, mas não às 16h.
  const desloc = Math.max(-60, Math.min(180, acorda - DEFAULT_MINUTES.breakfast));
  const ancorado = (slot: MealSlot) =>
    workoutMinutes != null && (slot === "pre_workout" || slot === "post_workout");

  const minutos = ativos.map((slot) => {
    if (ancorado(slot)) {
      // Pré e pós-treino são âncoras absolutas: 60 min antes e 45 min depois.
      return slot === "pre_workout" ? workoutMinutes! - 60 : workoutMinutes! + 45;
    }
    const [de, ate] = FAIXA[slot];
    let m = Math.max(de, Math.min(ate, DEFAULT_MINUTES[slot] + desloc));
    if (slot === "breakfast") m = Math.max(m, acorda + 30);
    return m;
  });

  // Folga mínima entre refeições seguidas (as âncoras do treino ficam onde estão).
  for (let i = 1; i < ativos.length; i++) {
    if (ancorado(ativos[i]!)) continue;
    minutos[i] = Math.max(minutos[i]!, minutos[i - 1]! + INTERVALO_MIN);
  }
  // A última refeição termina 1 h antes de dormir: se passou, puxa as de trás
  // para trás, mantendo a folga.
  const limite = Math.min(24 * 60 - 1, dorme - 60);
  for (let i = ativos.length - 1; i >= 0; i--) {
    if (ancorado(ativos[i]!)) continue;
    const teto = i === ativos.length - 1 ? limite : minutos[i + 1]! - INTERVALO_MIN;
    if (minutos[i]! > teto) minutos[i] = teto;
  }

  return ativos.map((slot, i) => ({
    slot,
    share: SLOT_WEIGHT[slot] / somaPesos,
    minutes: Math.max(0, Math.min(24 * 60 - 1, Math.round(minutos[i]!))),
  }));
}

/** Período razoável de cada refeição (minutos desde 0h): o horário nunca sai dele. */
const FAIXA: Record<MealSlot, [number, number]> = {
  breakfast: [6 * 60, 10 * 60 + 30],
  morning_snack: [9 * 60, 11 * 60 + 30],
  lunch: [11 * 60 + 30, 14 * 60 + 30],
  afternoon_snack: [15 * 60, 17 * 60 + 30],
  pre_workout: [0, 24 * 60 - 1],
  post_workout: [0, 24 * 60 - 1],
  dinner: [18 * 60 + 30, 21 * 60 + 30],
  supper: [21 * 60, 23 * 60 + 30],
};

/** Intervalo mínimo entre duas refeições seguidas. */
const INTERVALO_MIN = 90;

/** `480` → `"08:00"`. Formato aceito pela coluna `TIME` do Postgres. */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** `"08:30"` → `510`. Devolve `undefined` para entrada inválida. */
export function timeToMinutes(time: string | null | undefined): number | undefined {
  if (!time) return undefined;
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return undefined;
  return h * 60 + min;
}
