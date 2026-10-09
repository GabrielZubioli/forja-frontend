import { addUtcDays } from "../shared/dates";
import { weekStart } from "./streak";
import type { Muscle } from "./volume";

/**
 * Séries por parte do corpo, semana a semana — o "progresso por grupo
 * muscular" que a pessoa entende de relance.
 *
 * Grupos de exibição, mais largos que os do gerador de plano: aqui ninguém quer
 * ler "adutores", quer saber se treinou perna.
 */
export const BODY_PARTS = {
  peito: ["chest"],
  costas: ["back", "lats", "traps"],
  ombros: ["shoulders", "front_delts", "side_delts", "rear_delts"],
  bracos: ["biceps", "triceps", "forearms"],
  pernas: ["quads", "hamstrings", "glutes", "calves", "adductors", "abductors"],
  core: ["core", "abs", "obliques"],
} as const satisfies Record<string, readonly Muscle[]>;

export type BodyPart = keyof typeof BODY_PARTS;

const PART_BY_MUSCLE = new Map<string, BodyPart>(
  Object.entries(BODY_PARTS).flatMap(([part, muscles]) =>
    muscles.map((m) => [m, part as BodyPart] as const),
  ),
);

export interface MuscleSetEntry {
  muscle: string;
  /** Dia local `YYYY-MM-DD` do treino. */
  day: string;
  /** Séries efetivas (secundários contam fração). */
  sets: number;
}

export interface BodyPartWeeks {
  part: BodyPart;
  /** Séries por semana, da mais antiga à atual (`weeks` posições). */
  weekly: number[];
}

/** Séries das últimas `weeks` semanas (segunda a domingo), terminando na de `today`. */
export function weeklySetsByBodyPart(
  entries: readonly MuscleSetEntry[],
  today: string,
  weeks = 8,
): BodyPartWeeks[] {
  const atual = weekStart(today);
  const semanas = Array.from({ length: weeks }, (_, i) => addUtcDays(atual, -7 * (weeks - 1 - i)));
  const indice = new Map(semanas.map((s, i) => [s, i]));

  const porParte = new Map<BodyPart, number[]>(
    (Object.keys(BODY_PARTS) as BodyPart[]).map((p) => [p, Array(weeks).fill(0)]),
  );
  for (const e of entries) {
    const parte = PART_BY_MUSCLE.get(e.muscle);
    const i = indice.get(weekStart(e.day));
    if (parte === undefined || i === undefined) continue;
    const semanal = porParte.get(parte)!;
    semanal[i] = (semanal[i] ?? 0) + e.sets;
  }
  return [...porParte].map(([part, weekly]) => ({ part, weekly }));
}
