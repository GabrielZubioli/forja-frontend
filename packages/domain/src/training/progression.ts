import { z } from "zod";

/**
 * Progressão de carga por **dupla progressão** configurável.
 *
 * Regra: dentro de uma faixa de repetições [minReps, maxReps], o atleta primeiro
 * progride nas repetições mantendo o peso; quando atinge o topo da faixa em
 * todas as séries de trabalho, o peso sobe por `incrementKg` e as reps reiniciam
 * no piso da faixa.
 */

export const doubleProgressionConfigSchema = z
  .object({
    minReps: z.number().int().positive(),
    maxReps: z.number().int().positive(),
    /** Incremento de carga ao "graduar" a faixa de reps (kg). */
    incrementKg: z.number().positive(),
    /** Número de séries de trabalho que precisam bater o topo para graduar. */
    workingSets: z.number().int().positive(),
  })
  .refine((c) => c.maxReps >= c.minReps, {
    message: "maxReps deve ser >= minReps",
    path: ["maxReps"],
  });

export type DoubleProgressionConfig = z.infer<typeof doubleProgressionConfigSchema>;

export interface SetPerformance {
  weightKg: number;
  reps: number;
  isWarmup?: boolean;
}

export interface ProgressionSuggestion {
  /** Peso sugerido para a próxima sessão (kg). */
  weightKg: number;
  /** Reps-alvo para a próxima sessão. */
  targetReps: number;
  /** Se o peso foi graduado (subiu) nesta sugestão. */
  advanced: boolean;
}

/** Arredonda para 2 casas, evitando ruído de ponto flutuante. */
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/**
 * Calcula a sugestão de progressão a partir do desempenho da última sessão
 * daquele exercício.
 *
 * - Sem séries de trabalho registradas → mantém e sugere o piso da faixa.
 * - Todas as séries de trabalho ≥ maxReps no maior peso → sobe o peso e reinicia reps.
 * - Caso contrário → mantém o peso e mira uma rep a mais (limitado a maxReps).
 */
export function nextDoubleProgression(
  lastSession: readonly SetPerformance[],
  config: DoubleProgressionConfig,
): ProgressionSuggestion {
  const working = lastSession.filter((s) => !s.isWarmup);
  if (working.length === 0) {
    return { weightKg: 0, targetReps: config.minReps, advanced: false };
  }

  const topWeight = Math.max(...working.map((s) => s.weightKg));
  const setsAtTop = working.filter((s) => s.weightKg >= topWeight);
  const relevant = setsAtTop.slice(-config.workingSets);

  const graduated =
    relevant.length >= config.workingSets && relevant.every((s) => s.reps >= config.maxReps);

  if (graduated) {
    return {
      weightKg: round2(topWeight + config.incrementKg),
      targetReps: config.minReps,
      advanced: true,
    };
  }

  const bestReps = Math.max(...setsAtTop.map((s) => s.reps));
  const targetReps = Math.min(config.maxReps, Math.max(config.minReps, bestReps + 1));
  return { weightKg: round2(topWeight), targetReps, advanced: false };
}
