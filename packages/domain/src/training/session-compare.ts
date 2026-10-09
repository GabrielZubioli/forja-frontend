import { epley1RM } from "./one-rep-max";

export interface SimpleSet {
  weightKg: number | null;
  reps: number | null;
}

export type Trend = "up" | "same" | "down" | "new";

export interface ExerciseComparison {
  exerciseId: string;
  name: string;
  best: SimpleSet | null;
  previousBest: SimpleSet | null;
  trend: Trend;
}

/**
 * Hoje × última vez, por exercício — o "subiu, manteve ou caiu" do fim do
 * treino. Compara a melhor série de cada sessão pelo 1RM estimado; sem carga
 * (peso corporal), compara repetições. Diferença menor que 1% conta como igual:
 * ninguém progride 0,3 kg.
 */
export function compareWithLastSession(
  today: readonly { exerciseId: string; name: string; sets: readonly SimpleSet[] }[],
  previous: ReadonlyMap<string, readonly SimpleSet[]>,
): ExerciseComparison[] {
  return today.map(({ exerciseId, name, sets }) => {
    const best = bestSet(sets);
    const previousBest = bestSet(previous.get(exerciseId) ?? []);
    let trend: Trend = "new";
    if (best && previousBest) {
      const a = score(best);
      const b = score(previousBest);
      trend = Math.abs(a - b) <= b * 0.01 ? "same" : a > b ? "up" : "down";
    }
    return { exerciseId, name, best, previousBest, trend };
  });
}

function score(s: SimpleSet): number {
  const reps = s.reps ?? 0;
  return s.weightKg && s.weightKg > 0 ? epley1RM(s.weightKg, reps) : reps;
}

function bestSet(sets: readonly SimpleSet[]): SimpleSet | null {
  let melhor: SimpleSet | null = null;
  for (const s of sets) {
    if (!s.reps || s.reps <= 0) continue;
    if (!melhor || score(s) > score(melhor)) melhor = s;
  }
  return melhor;
}
