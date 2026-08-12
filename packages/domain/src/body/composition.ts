/**
 * Composição corporal.
 *
 * Três medidas com propósitos diferentes — e limitações que a UI precisa
 * declarar em vez de esconder atrás de um número bonito.
 */

export type BmiCategory =
  "underweight" | "normal" | "overweight" | "obese_1" | "obese_2" | "obese_3";

export interface BmiResult {
  bmi: number;
  category: BmiCategory;
}

/**
 * Índice de massa corporal.
 *
 * **O IMC não distingue músculo de gordura.** Um praticante de musculação de
 * 90 kg e 1,75 m aparece como "obeso grau I" com percentual de gordura baixo.
 * Por isso ele é exibido no app como referência de partida, nunca como
 * diagnóstico — e sempre ao lado das medidas de circunferência, que dizem mais
 * sobre a composição do que o peso sozinho.
 */
export function bmi(weightKg: number, heightCm: number): BmiResult {
  const m = heightCm / 100;
  const valor = m > 0 ? weightKg / (m * m) : 0;
  const arredondado = Math.round(valor * 10) / 10;

  const category: BmiCategory =
    valor < 18.5
      ? "underweight"
      : valor < 25
        ? "normal"
        : valor < 30
          ? "overweight"
          : valor < 35
            ? "obese_1"
            : valor < 40
              ? "obese_2"
              : "obese_3";

  return { bmi: arredondado, category };
}

export interface NavyBodyFatInput {
  sex: "male" | "female" | "other";
  heightCm: number;
  neckCm: number;
  waistCm: number;
  /** Obrigatório para o cálculo feminino. */
  hipCm?: number | undefined;
}

/**
 * Percentual de gordura pelo método da Marinha americana.
 *
 * Usa circunferências, que qualquer pessoa mede em casa com uma fita — ao
 * contrário de dobras cutâneas (exigem adipômetro e técnica) ou bioimpedância
 * (exige balança específica e varia com hidratação).
 *
 * **Margem de erro de 3 a 4 pontos percentuais.** É pouco confiável como valor
 * absoluto e bastante útil como tendência: medido do mesmo jeito toda semana,
 * o erro é consistente e a *variação* é real. A UI diz isso.
 *
 * `sex: "other"` usa a fórmula masculina por não haver alternativa validada; o
 * resultado é ainda menos preciso, e cabe à UI sinalizar.
 */
export function navyBodyFat(input: NavyBodyFatInput): number | null {
  const { sex, heightCm, neckCm, waistCm, hipCm } = input;

  if (heightCm <= 0 || neckCm <= 0 || waistCm <= 0) return null;
  if (sex === "female" && (!hipCm || hipCm <= 0)) return null;

  // As fórmulas usam log na base 10 e foram calibradas em centímetros.
  const log10 = Math.log10;

  let pct: number;
  if (sex === "female") {
    const soma = waistCm + hipCm! - neckCm;
    if (soma <= 0) return null;
    pct = 163.205 * log10(soma) - 97.684 * log10(heightCm) - 78.387;
  } else {
    const diferenca = waistCm - neckCm;
    // Cintura menor que o pescoço não é um corpo humano — é erro de medição.
    if (diferenca <= 0) return null;
    pct = 86.01 * log10(diferenca) - 70.041 * log10(heightCm) + 36.76;
  }

  // Fora desta faixa o resultado é ruído da fórmula, não medida.
  if (!Number.isFinite(pct) || pct < 3 || pct > 65) return null;
  return Math.round(pct * 10) / 10;
}

export interface GoalProgress {
  /** 0 a 1. Passa de 1 quando a meta foi superada. */
  ratio: number;
  /** Distância que falta, na unidade da meta. */
  remaining: number;
  achieved: boolean;
}

/**
 * Progresso rumo a uma meta numérica.
 *
 * Medido a partir do **valor inicial**, não do zero. Sair de 100 kg para 90 com
 * meta de 85 é 66% do caminho — e não 94%, que é o que a razão com o zero
 * diria. A diferença importa: a leitura errada faz um progresso real parecer
 * quase completo, e o esforço que falta parecer desproporcional.
 */
export function goalProgress(start: number, current: number, target: number): GoalProgress {
  const total = target - start;
  const percorrido = current - start;

  // Meta igual ao início: nada a percorrer. Considerar cumprida evita divisão
  // por zero e é a leitura correta ("manter" já está sendo cumprido).
  if (Math.abs(total) < 0.001) {
    return { ratio: 1, remaining: 0, achieved: true };
  }

  const ratio = percorrido / total;
  const remaining = target - current;
  // A meta pode ser de aumento ou de redução: o sinal de `total` diz a direção.
  const achieved = total > 0 ? current >= target : current <= target;

  return {
    ratio: Math.max(0, ratio),
    remaining: Math.round(Math.abs(remaining) * 100) / 100,
    achieved,
  };
}

/**
 * Ritmo semanal a partir de uma série de pesos diários.
 *
 * Usa regressão linear sobre a janela em vez da diferença entre pontas: o peso
 * do dia oscila até 1,5 kg com sal, água e horário da pesagem, e comparar dois
 * pontos isolados transforma esse ruído em "ganhou 1 kg esta semana".
 */
export function weeklyRate(
  points: readonly { dayIndex: number; weightKg: number }[],
): number | null {
  if (points.length < 4) return null;

  const n = points.length;
  const somaX = points.reduce((s, p) => s + p.dayIndex, 0);
  const somaY = points.reduce((s, p) => s + p.weightKg, 0);
  const somaXY = points.reduce((s, p) => s + p.dayIndex * p.weightKg, 0);
  const somaXX = points.reduce((s, p) => s + p.dayIndex * p.dayIndex, 0);

  const denominador = n * somaXX - somaX * somaX;
  // Todas as pesagens no mesmo dia: não há inclinação a estimar.
  if (Math.abs(denominador) < 1e-9) return null;

  const inclinacaoDiaria = (n * somaXY - somaX * somaY) / denominador;
  return Math.round(inclinacaoDiaria * 7 * 100) / 100;
}
