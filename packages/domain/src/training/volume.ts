import { z } from "zod";

/**
 * Volume de treino e distribuição por grupo muscular.
 *
 * Cada exercício define contribuições por músculo com peso 0..1 (primário
 * costuma ser 1.0; secundários frações). O volume de uma série é distribuído
 * entre os músculos conforme esses pesos, permitindo somar "volume por grupo".
 */

/** Grupos musculares rastreados (espelha o enum `muscle_t` do banco). */
export const MUSCLES = [
  "chest",
  "back",
  "lats",
  "traps",
  "shoulders",
  "front_delts",
  "side_delts",
  "rear_delts",
  "biceps",
  "triceps",
  "forearms",
  "core",
  "abs",
  "obliques",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "adductors",
  "abductors",
  "cardio",
  "full_body",
] as const;

export type Muscle = (typeof MUSCLES)[number];

export const muscleContributionSchema = z.object({
  muscle: z.enum(MUSCLES),
  /** Peso de contribuição do músculo neste exercício (0..1). */
  weight: z.number().min(0).max(1),
});
export type MuscleContribution = z.infer<typeof muscleContributionSchema>;

/**
 * Volume (tonelagem) de uma única série = peso × reps.
 * Séries sem peso ou sem reps (ex.: cardio) retornam 0.
 */
export function setVolume(
  weightKg: number | null | undefined,
  reps: number | null | undefined,
): number {
  if (!weightKg || !reps) return 0;
  return weightKg * reps;
}

/**
 * Distribui uma métrica de série (tonelagem OU 1 "série efetiva") entre os
 * músculos do exercício conforme os pesos de contribuição.
 *
 * @returns mapa parcial músculo → contribuição
 */
export function distributeToMuscles(
  metric: number,
  contributions: readonly MuscleContribution[],
): Partial<Record<Muscle, number>> {
  const out: Partial<Record<Muscle, number>> = {};
  for (const c of contributions) {
    out[c.muscle] = (out[c.muscle] ?? 0) + metric * c.weight;
  }
  return out;
}

export interface ExerciseSetInput {
  /** Contribuições musculares do exercício desta série. */
  contributions: readonly MuscleContribution[];
  weightKg: number | null;
  reps: number | null;
  /** Séries de aquecimento não contam para o volume de trabalho. */
  isWarmup?: boolean;
}

/** Série como o app registra: só o que decide se ela conta para o volume. */
export interface CountableSet {
  weightKg: number | string | null;
  reps: number | string | null;
  setType?: string | null;
  completed?: boolean | null;
}

/**
 * Uma série só entra nas métricas de treino se foi **concluída** e **não é
 * aquecimento**. Aquecimento infla a tonelagem sem representar estímulo, e
 * séries não concluídas são apenas o plano, não o realizado.
 */
export function countsTowardVolume(set: CountableSet): boolean {
  return set.completed !== false && set.setType !== "warmup";
}

/**
 * Volume total (tonelagem, kg) de uma sessão de treino.
 *
 * Existe para garantir que o número gravado em `workout_sessions.total_volume_kg`
 * seja **o mesmo** exibido no cabeçalho da sessão. Antes, o cabeçalho filtrava
 * séries válidas e a gravação somava tudo — inclusive aquecimento e séries não
 * concluídas —, inflando o volume e contaminando o dashboard.
 */
export function sessionVolume(sets: readonly CountableSet[]): number {
  return sets.reduce((total, s) => {
    if (!countsTowardVolume(s)) return total;
    return total + setVolume(toNum(s.weightKg), toNum(s.reps));
  }, 0);
}

/** Número de séries efetivas (concluídas e não-aquecimento) de uma sessão. */
export function countWorkingSets(sets: readonly CountableSet[]): number {
  return sets.reduce((n, s) => (countsTowardVolume(s) ? n + 1 : n), 0);
}

/** Colunas `NUMERIC` chegam como string do Postgres; nunca produzir NaN. */
function toNum(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export interface MuscleVolume {
  /** Tonelagem ponderada (kg) por músculo. */
  tonnage: Partial<Record<Muscle, number>>;
  /** Séries efetivas ponderadas por músculo (métrica estilo Hevy/landmarks). */
  workingSets: Partial<Record<Muscle, number>>;
}

/**
 * Agrega volume por grupo muscular sobre uma lista de séries.
 * Ignora séries de aquecimento na contagem de séries efetivas e na tonelagem.
 */
export function aggregateMuscleVolume(sets: readonly ExerciseSetInput[]): MuscleVolume {
  const tonnage: Partial<Record<Muscle, number>> = {};
  const workingSets: Partial<Record<Muscle, number>> = {};

  for (const s of sets) {
    if (s.isWarmup) continue;
    const vol = setVolume(s.weightKg, s.reps);
    for (const [muscle, value] of Object.entries(distributeToMuscles(vol, s.contributions))) {
      tonnage[muscle as Muscle] = (tonnage[muscle as Muscle] ?? 0) + (value ?? 0);
    }
    for (const [muscle, value] of Object.entries(distributeToMuscles(1, s.contributions))) {
      workingSets[muscle as Muscle] = (workingSets[muscle as Muscle] ?? 0) + (value ?? 0);
    }
  }

  return { tonnage, workingSets };
}
