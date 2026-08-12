/**
 * Estimativa de 1RM (uma repetição máxima) pela fórmula de Epley.
 *
 * `1RM = peso * (1 + reps / 30)`
 *
 * Retorna 0 para entradas não-positivas e o próprio peso para 1 rep.
 */
export function epley1RM(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}
