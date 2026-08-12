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

  // Desloca a grade padrão para a janela real de vigília do usuário.
  const padraoInicio = DEFAULT_MINUTES.breakfast;
  const padraoFim = DEFAULT_MINUTES.supper;
  const inicio = wakeMinutes ?? padraoInicio;
  const fim = sleepMinutes ?? padraoFim + 30;
  const janelaPadrao = padraoFim - padraoInicio;
  const janelaReal = Math.max(60, fim - 30 - inicio);
  const escala = janelaReal / janelaPadrao;

  return ativos.map((slot) => {
    let minutes = Math.round(inicio + (DEFAULT_MINUTES[slot] - padraoInicio) * escala);

    // Pré e pós-treino são âncoras absolutas: 60 min antes e 45 min depois. O
    // valor deles está na relação com o treino, não no relógio.
    if (workoutMinutes !== undefined && workoutMinutes !== null) {
      if (slot === "pre_workout") minutes = Math.max(0, workoutMinutes - 60);
      if (slot === "post_workout") minutes = Math.min(24 * 60 - 1, workoutMinutes + 45);
    }

    return {
      slot,
      share: SLOT_WEIGHT[slot] / somaPesos,
      minutes: Math.max(0, Math.min(24 * 60 - 1, minutes)),
    };
  });
}

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
