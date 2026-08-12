import { z } from "zod";
import type { Muscle } from "./volume";

/**
 * Recuperação muscular.
 *
 * Responde "o que dá para treinar hoje?" a partir de **quando** cada grupo foi
 * estimulado pela última vez e **quanto** volume levou. É o que permite ao app
 * recomendar a próxima divisão em vez de apenas seguir a sequência cegamente.
 *
 * ## Modelo
 *
 * A síntese proteica muscular fica elevada por volta de 24–48h após o treino, e
 * o tempo até a recuperação completa cresce com o volume da sessão: 4 séries
 * pedem menos descanso que 12. Modelamos como:
 *
 * ```
 * horasNecessarias = BASE + POR_SERIE × seriesEfetivas   (limitado a MAX)
 * recuperacao      = min(1, horasDesdeOTreino / horasNecessarias)
 * ```
 *
 * É deliberadamente simples. Recuperação real depende de sono, calorias, idade,
 * proximidade da falha e experiência — variáveis que o app não mede. Um modelo
 * transparente e explicável vale mais aqui que um sofisticado e opaco: o número
 * serve para **orientar**, e a UI deixa claro que é estimativa.
 */

/** Horas mínimas de recuperação, mesmo após um estímulo leve. */
const BASE_HOURS = 24;
/** Horas adicionais por série efetiva. */
const HOURS_PER_SET = 4;
/** Teto: acima disso é mais provável que o problema não seja recuperação local. */
const MAX_HOURS = 96;

export const recoveryParamsSchema = z.object({
  baseHours: z.number().positive().default(BASE_HOURS),
  hoursPerSet: z.number().nonnegative().default(HOURS_PER_SET),
  maxHours: z.number().positive().default(MAX_HOURS),
});

export type RecoveryParams = z.infer<typeof recoveryParamsSchema>;

/** Estímulo registrado num músculo, numa data. */
export interface MuscleStimulus {
  muscle: Muscle;
  /** Momento do treino (ISO ou Date). */
  at: string | Date;
  /** Séries efetivas que atingiram o músculo naquela sessão. */
  sets: number;
}

export type RecoveryStatus = "recovered" | "recovering" | "fatigued";

export interface MuscleRecovery {
  muscle: Muscle;
  /** 0 = acabou de treinar · 1 = totalmente recuperado. */
  ratio: number;
  percent: number;
  status: RecoveryStatus;
  hoursSince: number;
  hoursNeeded: number;
  /** Horas que ainda faltam (0 se já recuperado). */
  hoursRemaining: number;
  lastTrainedAt: Date;
  lastSets: number;
}

/**
 * Recuperação de cada músculo estimulado recentemente.
 *
 * Músculos ausentes da lista simplesmente não aparecem no resultado — "não
 * treinado no período" não é o mesmo que "recuperado a 100%", e forçar um valor
 * inventaria informação.
 */
export function computeMuscleRecovery(
  stimuli: readonly MuscleStimulus[],
  now: Date = new Date(),
  rawParams: Partial<RecoveryParams> = {},
): MuscleRecovery[] {
  const params = recoveryParamsSchema.parse(rawParams);

  // Só o estímulo mais recente de cada músculo importa: é ele que determina a
  // fadiga corrente. Somar sessões antigas superestimaria a fadiga acumulada.
  const latest = new Map<Muscle, { at: Date; sets: number }>();

  for (const stimulus of stimuli) {
    const at = stimulus.at instanceof Date ? stimulus.at : new Date(stimulus.at);
    if (Number.isNaN(at.getTime())) continue;
    if (at.getTime() > now.getTime()) continue; // registro no futuro: ignora

    const current = latest.get(stimulus.muscle);
    if (!current || at.getTime() > current.at.getTime()) {
      latest.set(stimulus.muscle, { at, sets: Math.max(0, stimulus.sets) });
    } else if (at.getTime() === current.at.getTime()) {
      // Mesma sessão: acumula as séries daquele músculo.
      current.sets += Math.max(0, stimulus.sets);
    }
  }

  const result: MuscleRecovery[] = [];

  for (const [muscle, { at, sets }] of latest) {
    const hoursSince = (now.getTime() - at.getTime()) / 3_600_000;
    const hoursNeeded = Math.min(params.maxHours, params.baseHours + params.hoursPerSet * sets);
    const ratio = hoursNeeded > 0 ? Math.min(1, hoursSince / hoursNeeded) : 1;

    result.push({
      muscle,
      ratio,
      percent: Math.round(ratio * 100),
      status: statusFrom(ratio),
      hoursSince: Math.round(hoursSince),
      hoursNeeded: Math.round(hoursNeeded),
      hoursRemaining: Math.max(0, Math.round(hoursNeeded - hoursSince)),
      lastTrainedAt: at,
      lastSets: sets,
    });
  }

  // Menos recuperado primeiro: é a informação acionável.
  return result.sort((a, b) => a.ratio - b.ratio);
}

/**
 * Faixas de status.
 *
 * Abaixo de 50% o músculo ainda está claramente em reparo; entre 50% e 90% dá
 * para treinar com volume reduzido; a partir de 90% considera-se pronto — exigir
 * 100% adiaria treinos por poucas horas sem ganho prático.
 */
function statusFrom(ratio: number): RecoveryStatus {
  if (ratio >= 0.9) return "recovered";
  if (ratio >= 0.5) return "recovering";
  return "fatigued";
}

export interface SplitRecovery<T> {
  split: T;
  /** Média de recuperação dos músculos que a divisão treina (0..1). */
  score: number;
  /** Músculos da divisão ainda fatigados. */
  fatigued: MuscleRecovery[];
}

/**
 * Ordena divisões pela prontidão dos músculos que cada uma treina.
 *
 * Músculos sem estímulo recente contam como recuperados para efeito de
 * ranqueamento — se não foram treinados na janela observada, não há fadiga
 * conhecida que desaconselhe treiná-los.
 */
export function rankSplitsByRecovery<T>(
  splits: readonly { split: T; muscles: readonly Muscle[] }[],
  recovery: readonly MuscleRecovery[],
): SplitRecovery<T>[] {
  const byMuscle = new Map(recovery.map((r) => [r.muscle, r]));

  return splits
    .map(({ split, muscles }) => {
      if (muscles.length === 0) return { split, score: 1, fatigued: [] };

      const entradas = muscles.map((m) => byMuscle.get(m));
      const soma = entradas.reduce((total, entry) => total + (entry?.ratio ?? 1), 0);
      const fatigued = entradas.filter(
        (entry): entry is MuscleRecovery => entry !== undefined && entry.status === "fatigued",
      );

      return { split, score: soma / muscles.length, fatigued };
    })
    .sort((a, b) => b.score - a.score);
}

/** Menor recuperação entre os músculos observados — resumo para o dashboard. */
export function overallReadiness(recovery: readonly MuscleRecovery[]): number {
  if (recovery.length === 0) return 1;
  const soma = recovery.reduce((total, r) => total + r.ratio, 0);
  return soma / recovery.length;
}
