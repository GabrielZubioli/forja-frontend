/**
 * Progresso entre o peso inicial e o peso-alvo.
 *
 * ## Por que não é uma regra de três
 *
 * O primeiro instinto é `atual / meta`, e ele erra sempre: quem sai de 65 kg
 * rumo a 75 apareceria com 87% do caminho andado no primeiro dia, antes de
 * ganhar um grama. O progresso precisa ser medido a partir de **onde a pessoa
 * começou**, não de zero.
 *
 * A segunda armadilha é o sentido. Emagrecer faz o total ficar negativo
 * (`60 - 80 = -20`) e o percorrido também (`75 - 80 = -5`). A razão entre os
 * dois resolve os dois sentidos sem nenhum `if`: `-5 / -20 = 0.25`, os mesmos
 * 25% que `+5 / +20` daria em quem está ganhando peso.
 *
 * Está aqui, e não dentro do componente, porque é a única parte do cabeçalho do
 * perfil que pode estar errada sem parecer errada — o desenho da barra denuncia
 * um leiaute quebrado, mas não denuncia um percentual plausível e falso.
 */

export type WeightJourney = {
  startKg: number;
  currentKg: number;
  goalKg: number;
  /** 0 a 100, já arredondado e limitado à faixa. */
  percent: number;
  /** Quanto falta, sempre positivo. */
  remainingKg: number;
  /** A meta foi alcançada ou ultrapassada? */
  reached: boolean;
};

/**
 * Devolve `null` quando a jornada não pode ser desenhada com honestidade:
 * falta algum dos três pesos, ou a meta é o próprio ponto de partida (o que
 * tornaria o denominador zero e o percentual, infinito).
 */
export function weightJourney({
  startKg,
  currentKg,
  goalKg,
}: {
  startKg: number | null | undefined;
  currentKg: number | null | undefined;
  goalKg: number | null | undefined;
}): WeightJourney | null {
  if (!startKg || !currentKg || !goalKg) return null;
  if (startKg === goalKg) return null;

  const total = goalKg - startKg;
  const traveled = currentKg - startKg;

  // Sair do caminho (engordar quando a meta é emagrecer) dá razão negativa;
  // passar da meta dá razão acima de 1. Ambos são limitados — a barra mostra
  // "no começo" ou "completo", e o texto ao lado dá o número real.
  const ratio = Math.max(0, Math.min(1, traveled / total));

  const remaining = goalKg - currentKg;
  // `toFixed` antes de `abs` para evitar `-0` e o acúmulo de erro binário que
  // faria 2,9999999999 aparecer no lugar de 3.
  const remainingKg = Math.abs(Number(remaining.toFixed(1)));

  return {
    startKg,
    currentKg,
    goalKg,
    percent: Math.round(ratio * 100),
    remainingKg,
    reached: ratio >= 1,
  };
}
