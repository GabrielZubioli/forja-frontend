/**
 * Suavização de séries corporais (ex.: peso) por média móvel exponencial.
 */

/**
 * Média móvel exponencial de uma série numérica.
 * `out_t = alpha * v_t + (1 - alpha) * out_{t-1}`
 *
 * @param alpha fator de suavização (0..1]; menor = mais suave.
 */
export function ema(values: readonly number[], alpha = 0.1): number[] {
  if (alpha <= 0 || alpha > 1) {
    throw new RangeError(`alpha deve estar em (0, 1]: ${alpha}`);
  }
  const out: number[] = [];
  let prev: number | null = null;
  for (const v of values) {
    prev = prev === null ? v : alpha * v + (1 - alpha) * prev;
    out.push(prev);
  }
  return out;
}
