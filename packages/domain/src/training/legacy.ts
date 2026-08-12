/**
 * Heurística de sugestão de carga original (V1), preservada para
 * compatibilidade com o app web enquanto ele existir. Novo código deve usar
 * `nextDoubleProgression` de `./progression`.
 *
 * @deprecated Use `nextDoubleProgression`.
 */
export function suggestNextWeight(
  lastWeightKg: number,
  lastReps: number,
  targetReps: number,
): number {
  if (lastWeightKg <= 0) return 0;
  const increment = lastWeightKg >= 60 ? 2.5 : 1.25;
  const round = (x: number): number => Math.round(x * 100) / 100;
  if (lastReps >= targetReps + 2) return round(lastWeightKg + increment * 2);
  if (lastReps >= targetReps) return round(lastWeightKg + increment);
  if (lastReps < targetReps - 2) return round(lastWeightKg - increment);
  return round(lastWeightKg);
}
