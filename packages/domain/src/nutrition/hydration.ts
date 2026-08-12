/**
 * Meta de hidratação.
 *
 * A regra popular dos "2 litros por dia" é um número redondo sem base: uma
 * pessoa de 50 kg sedentária e uma de 100 kg que treina seis vezes por semana
 * não têm a mesma necessidade. A referência usada aqui — 35 ml por quilo de
 * peso — acompanha a massa corporal, que é o que de fato determina o volume de
 * água do organismo, e soma o que se perde treinando.
 *
 * Ainda é uma estimativa. Sede, cor da urina, calor e medicação mudam o valor
 * real, e a UI diz isso em vez de vender o número como prescrição médica.
 */

const ML_POR_KG = 35;

/** Perda média por hora de treino de força, em ml. */
const ML_POR_HORA_TREINO = 500;

export interface HydrationInput {
  weightKg: number;
  /** Minutos de treino no dia. */
  trainingMinutes?: number;
  /** Clima quente aumenta a perda por transpiração. */
  hotClimate?: boolean;
}

export function waterTargetMl({
  weightKg,
  trainingMinutes = 0,
  hotClimate = false,
}: HydrationInput): number {
  const base = weightKg * ML_POR_KG;
  const treino = (trainingMinutes / 60) * ML_POR_HORA_TREINO;
  const clima = hotClimate ? base * 0.15 : 0;

  // Arredonda para 100 ml: precisão de mililitro numa estimativa é ruído, e
  // "2.847 ml" sugere um rigor que o cálculo não tem.
  return Math.round((base + treino + clima) / 100) * 100;
}

/** Tamanhos de copo oferecidos como atalho de registro. */
export const WATER_QUICK_ADD_ML = [200, 300, 500, 750] as const;
