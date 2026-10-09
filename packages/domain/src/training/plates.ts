/**
 * Anilhas por lado da barra para chegar a uma carga.
 *
 * Guloso da maior para a menor: com as anilhas padrão de academia (cada uma
 * múltipla da seguinte, exceto 15) o guloso acerta, e é como as pessoas montam
 * a barra. Quando a carga não fecha com o que existe, devolve o que dá e diz
 * quanto sobrou — melhor que fingir precisão.
 */

/** Anilhas comuns no Brasil, em kg. */
export const STANDARD_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25] as const;

export interface PlateLoad {
  /** Anilhas de um lado, da maior para a menor. */
  perSide: number[];
  /** Carga total montada (barra + 2 × lado). */
  loadedKg: number;
  /** Quanto faltou para a carga pedida (0 quando fechou). */
  missingKg: number;
}

export function platesFor(
  targetKg: number,
  barKg = 20,
  plates: readonly number[] = STANDARD_PLATES_KG,
): PlateLoad {
  const ordenadas = [...plates].sort((a, b) => b - a);
  let lado = Math.max(0, (targetKg - barKg) / 2);
  const perSide: number[] = [];
  for (const p of ordenadas) {
    // Tolerância de 1 g contra erro de ponto flutuante (2,5 + 1,25 …).
    while (lado + 1e-3 >= p) {
      perSide.push(p);
      lado -= p;
    }
  }
  const loadedKg = barKg + 2 * perSide.reduce((s, p) => s + p, 0);
  return {
    perSide,
    loadedKg,
    missingKg: Math.max(0, Math.round((targetKg - loadedKg) * 100) / 100),
  };
}
