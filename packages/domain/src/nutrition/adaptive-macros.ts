import { z } from "zod";
import { KCAL_PER_KG } from "../shared/units";

/**
 * Metas adaptativas estilo MacroFactor via **filtro de Kalman** de 2 estados.
 *
 * Modelo. O estado latente é `x = [pesoReal, tdee]`:
 *  - `pesoReal` (kg): peso corporal "verdadeiro", livre do ruído da balança
 *    (água, glicogênio, conteúdo intestinal).
 *  - `tdee` (kcal/dia): gasto energético total, tratado como passeio aleatório
 *    lento (adapta ao longo das semanas).
 *
 * Dinâmica (de um dia para o próximo, com a ingestão `u` do dia anterior como
 * entrada de controle conhecida):
 *
 *   pesoReal_t = pesoReal_{t-1} + (u_{t-1} - tdee) / KCAL_PER_KG
 *   tdee_t     = tdee_{t-1}
 *
 *   F = [[1, -1/K], [0, 1]]      B·u = [u/K, 0]ᵀ      (K = KCAL_PER_KG)
 *
 * Observação: a balança mede `z = pesoReal + ruído`  →  H = [1, 0].
 *
 * Dias sem pesagem fazem apenas o passo de predição (sem update). Dias sem
 * registro de ingestão assumem balanço neutro (ingestão = tdee estimado), o que
 * evita introduzir viés e apenas aumenta a incerteza.
 */

export const kalmanParamsSchema = z.object({
  /** Energia por kg de massa corporal. */
  kcalPerKg: z.number().positive().default(KCAL_PER_KG),
  /** Ruído de processo do peso (kg²/dia). Pequeno: a dinâmica é modelada. */
  processNoiseWeight: z.number().nonnegative().default(0.001),
  /** Ruído de processo do TDEE (kcal²/dia). Governa a velocidade de adaptação. */
  processNoiseTdee: z.number().nonnegative().default(9),
  /** Variância da medição de peso (kg²). ~0.5 ⇒ desvio ~0.7 kg de flutuação diária. */
  measurementNoiseWeight: z.number().positive().default(0.5),
});

export type KalmanParams = z.infer<typeof kalmanParamsSchema>;

export interface DailyObservation {
  /** Chave de dia UTC `YYYY-MM-DD`. */
  date: string;
  /** Peso medido na balança (kg), ou null se não houve pesagem. */
  weightKg: number | null;
  /** Ingestão calórica registrada (kcal), ou null se não registrada. */
  intakeKcal: number | null;
}

export interface AdaptiveState {
  /** Peso real filtrado (kg). */
  weightKg: number;
  /** TDEE estimado (kcal/dia). */
  tdeeKcal: number;
  /** Variância do peso real (kg²). */
  weightVar: number;
  /** Variância do TDEE (kcal²). */
  tdeeVar: number;
}

export interface TdeeEstimate extends AdaptiveState {
  date: string;
}

export interface InitialGuess {
  weightKg: number;
  tdeeKcal: number;
  /** Incerteza inicial do peso (kg²). */
  weightVar?: number;
  /** Incerteza inicial do TDEE (kcal²). Alta ⇒ aprende rápido no início. */
  tdeeVar?: number;
}

// --- Álgebra 2×2 mínima (evita dependência de lib de matrizes) ---
type Mat2 = readonly [number, number, number, number]; // [a b; c d] row-major
type Vec2 = readonly [number, number];

function matVec(m: Mat2, v: Vec2): Vec2 {
  return [m[0] * v[0] + m[1] * v[1], m[2] * v[0] + m[3] * v[1]];
}
function matMul(a: Mat2, b: Mat2): Mat2 {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
  ];
}
function transpose(m: Mat2): Mat2 {
  return [m[0], m[2], m[1], m[3]];
}
function addMat(a: Mat2, b: Mat2): Mat2 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];
}

/**
 * Roda o filtro sobre uma série ordenada de observações diárias e retorna a
 * estimativa (peso real + TDEE) para cada dia.
 */
export function estimateTdeeSeries(
  observations: readonly DailyObservation[],
  initial: InitialGuess,
  rawParams: Partial<KalmanParams> = {},
): TdeeEstimate[] {
  const params = kalmanParamsSchema.parse(rawParams);
  const K = params.kcalPerKg;

  let x: Vec2 = [initial.weightKg, initial.tdeeKcal];
  let P: Mat2 = [initial.weightVar ?? 1, 0, 0, initial.tdeeVar ?? 10_000];

  const F: Mat2 = [1, -1 / K, 0, 1];
  const Ft = transpose(F);
  const Q: Mat2 = [params.processNoiseWeight, 0, 0, params.processNoiseTdee];
  const R = params.measurementNoiseWeight;

  const out: TdeeEstimate[] = [];

  for (const obs of observations) {
    // Ingestão do dia: se ausente, assume balanço neutro (= TDEE atual estimado).
    const intake = obs.intakeKcal ?? x[1];

    // --- Predição ---
    // x_pred = F·x + [intake/K, 0]
    const fx = matVec(F, x);
    let xPred: Vec2 = [fx[0] + intake / K, fx[1]];
    // P_pred = F·P·Fᵀ + Q
    let PPred: Mat2 = addMat(matMul(matMul(F, P), Ft), Q);

    // --- Atualização (só quando há pesagem) ---
    if (obs.weightKg != null) {
      const y = obs.weightKg - xPred[0]; // inovação (H = [1,0])
      const S = PPred[0] + R; // H·P·Hᵀ + R
      const kGain: Vec2 = [PPred[0] / S, PPred[2] / S]; // P·Hᵀ / S
      xPred = [xPred[0] + kGain[0] * y, xPred[1] + kGain[1] * y];
      // P = (I - K·H)·P_pred, com K·H = [[k0,0],[k1,0]]
      PPred = [
        (1 - kGain[0]) * PPred[0],
        (1 - kGain[0]) * PPred[1],
        PPred[2] - kGain[1] * PPred[0],
        PPred[3] - kGain[1] * PPred[1],
      ];
    }

    x = xPred;
    P = PPred;
    out.push({
      date: obs.date,
      weightKg: x[0],
      tdeeKcal: x[1],
      weightVar: P[0],
      tdeeVar: P[3],
    });
  }

  return out;
}

/** Última estimativa da série, ou null se vazia. */
export function latestEstimate(estimates: readonly TdeeEstimate[]): TdeeEstimate | null {
  return estimates.length > 0 ? estimates[estimates.length - 1]! : null;
}

/**
 * Meta calórica diária para atingir uma variação de peso semanal desejada
 * (negativa = perder, positiva = ganhar), a partir do TDEE estimado.
 */
export function adaptiveCalorieTarget(
  tdeeKcal: number,
  weeklyWeightChangeKg: number,
  kcalPerKg: number = KCAL_PER_KG,
): number {
  const dailyDelta = (weeklyWeightChangeKg * kcalPerKg) / 7;
  return Math.round(tdeeKcal + dailyDelta);
}
