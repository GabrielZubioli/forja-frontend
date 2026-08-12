import { z } from "zod";

/**
 * Agenda semanal da rotina.
 *
 * Responde "o que eu treino hoje?" projetando a sequência A/B/C sobre os dias
 * da semana escolhidos pelo usuário.
 *
 * ## A regra que não é óbvia
 *
 * A agenda é **indicativa, não uma amarra**. A sequência avança por *treino
 * concluído*, nunca por data. Quem planejou treinar segunda/quarta/sexta e
 * pulou a segunda faz o treino A na quarta — não perde a divisão nem "fica
 * devendo".
 *
 * Isso é o oposto de um calendário rígido, e é deliberado: agenda rígida
 * transforma falta em dívida, e dívida em abandono. A faixa de dias serve para
 * o usuário saber o que esperar, não para cobrá-lo.
 */

/** 0 = domingo … 6 = sábado (igual ao `Date.getDay()`). */
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  0: "Domingo",
  1: "Segunda",
  2: "Terça",
  3: "Quarta",
  4: "Quinta",
  5: "Sexta",
  6: "Sábado",
};

/** Iniciais para a faixa compacta da tela inicial. */
export const WEEKDAY_INITIALS: Record<Weekday, string> = {
  0: "D",
  1: "S",
  2: "T",
  3: "Q",
  4: "Q",
  5: "S",
  6: "S",
};

export const scheduleInputSchema = z.object({
  /** Dias planejados para treinar. */
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  /** Quantas divisões a rotina tem (A, B, C…). */
  splitCount: z.number().int().positive(),
  /** Posição atual na sequência (0 = próxima é a divisão A). */
  currentIndex: z.number().int().nonnegative(),
});

export type ScheduleInput = z.infer<typeof scheduleInputSchema>;

export type DayStatus =
  /** Dia de treino já concluído. */
  | "done"
  /** Dia de treino, é hoje, ainda não feito. */
  | "today"
  /** Dia de treino no futuro. */
  | "upcoming"
  /** Dia de treino no passado que não foi feito. */
  | "missed"
  /** Não é dia de treino. */
  | "rest";

export interface ScheduledDay {
  /** Chave `YYYY-MM-DD`. */
  date: string;
  weekday: Weekday;
  status: DayStatus;
  /**
   * Índice da divisão prevista (0 = A). `null` em dias de descanso e em dias
   * passados não treinados — projetar uma divisão para o que já passou daria a
   * falsa impressão de dívida.
   */
  splitIndex: number | null;
  /** Índice da divisão efetivamente treinada, quando houve treino. */
  completedSplitIndex?: number;
  isToday: boolean;
}

/** Um treino já registrado, para marcar os dias concluídos. */
export interface CompletedWorkout {
  /** Chave `YYYY-MM-DD` local. */
  date: string;
  /** Divisão treinada, se identificável. */
  splitIndex?: number;
}

/**
 * Projeta uma janela de dias (tipicamente a semana corrente) com a divisão
 * prevista para cada um.
 *
 * @param days Chaves `YYYY-MM-DD` **em ordem**, já no fuso do usuário.
 * @param today Chave `YYYY-MM-DD` de hoje.
 */
export function projectSchedule(
  days: readonly string[],
  today: string,
  rawInput: ScheduleInput,
  completed: readonly CompletedWorkout[] = [],
): ScheduledDay[] {
  const input = scheduleInputSchema.parse(rawInput);
  const trainingDays = new Set(input.weekdays);

  const completedByDate = new Map<string, CompletedWorkout>();
  for (const workout of completed) completedByDate.set(workout.date, workout);

  // A sequência é projetada só para hoje em diante: o passado é o que de fato
  // aconteceu, não o que estava previsto.
  let proximo = input.currentIndex % input.splitCount;

  return days.map((date) => {
    const weekday = weekdayOf(date);
    const isToday = date === today;
    const feito = completedByDate.get(date);
    const ehDiaDeTreino = trainingDays.has(weekday);

    if (feito) {
      return {
        date,
        weekday,
        status: "done",
        splitIndex: null,
        ...(feito.splitIndex !== undefined ? { completedSplitIndex: feito.splitIndex } : {}),
        isToday,
      };
    }

    if (!ehDiaDeTreino) {
      return { date, weekday, status: "rest", splitIndex: null, isToday };
    }

    if (date < today) {
      // Dia de treino que passou em branco. Não recebe divisão: a sequência
      // segue intacta para o próximo treino de verdade.
      return { date, weekday, status: "missed", splitIndex: null, isToday };
    }

    const splitIndex = proximo % input.splitCount;
    proximo += 1;
    return {
      date,
      weekday,
      status: isToday ? "today" : "upcoming",
      splitIndex,
      isToday,
    };
  });
}

/**
 * Qual divisão treinar hoje.
 *
 * Retorna o índice mesmo quando hoje **não** é dia planejado — quem quiser
 * treinar fora da agenda deve poder, e a próxima divisão da sequência é a
 * resposta certa. O campo `isPlannedDay` diz se estava no plano.
 */
export function todaysWorkout(
  today: string,
  rawInput: ScheduleInput,
  completed: readonly CompletedWorkout[] = [],
): { splitIndex: number; isPlannedDay: boolean; alreadyDone: boolean } {
  const input = scheduleInputSchema.parse(rawInput);
  const jaFeito = completed.some((w) => w.date === today);

  return {
    splitIndex: input.currentIndex % input.splitCount,
    isPlannedDay: input.weekdays.includes(weekdayOf(today)),
    alreadyDone: jaFeito,
  };
}

/**
 * Sugestão de dias da semana para uma frequência.
 *
 * Espalha os treinos ao longo da semana em vez de amontoá-los, o que dá tempo
 * de recuperação entre sessões que repetem grupos musculares.
 */
export function suggestWeekdays(daysPerWeek: number): Weekday[] {
  const sugestoes: Record<number, Weekday[]> = {
    1: [1],
    2: [1, 4], // segunda e quinta
    3: [1, 3, 5], // segunda, quarta, sexta
    4: [1, 2, 4, 5], // segunda, terça, quinta, sexta
    5: [1, 2, 3, 5, 6], // folga na quinta e no domingo
    6: [1, 2, 3, 4, 5, 6], // só domingo de folga
    7: [0, 1, 2, 3, 4, 5, 6],
  };
  return sugestoes[daysPerWeek] ?? [1, 3, 5];
}

/**
 * Dia da semana de uma chave `YYYY-MM-DD`.
 *
 * Calculado a partir dos componentes da data, sem passar por `new Date(string)`
 * — que interpretaria a chave como UTC e poderia devolver o dia anterior em
 * fusos negativos, exatamente o bug de fuso já corrigido no resto do app.
 */
export function weekdayOf(isoDate: string): Weekday {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year!, (month ?? 1) - 1, day ?? 1);
  return date.getDay() as Weekday;
}
