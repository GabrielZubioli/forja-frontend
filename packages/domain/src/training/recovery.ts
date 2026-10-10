import type { Muscle } from "./volume";

/**
 * Recuperação muscular.
 *
 * Responde "o que dá para treinar hoje?" a partir de **quando** cada grupo foi
 * estimulado e **quanto** volume levou. É o que permite ao app recomendar a
 * próxima divisão em vez de apenas seguir a sequência cegamente.
 *
 * ## Modelo
 *
 * - **Estímulo em séries efetivas**, não tonelagem: a resposta de hipertrofia
 *   acompanha séries duras, e 8 séries num músculo são ~uma sessão completa
 *   (o platô por sessão). Cada sessão conta no máximo 12.
 * - **Fadiga que decai com meia-vida própria por músculo.** Membros inferiores
 *   recuperam mais devagar que os superiores (força em 10RM volta em 48–72h,
 *   com agachamento mais lento que supino), então: braços, ombros e core 24h;
 *   peito e costas 30h; pernas 48h.
 * - **Treinos recentes se somam.** Um músculo treinado ontem e anteontem está
 *   mais cansado que um treinado só ontem — o modelo anterior via apenas o
 *   último treino.
 *
 * ```
 * carga(t)  = Σ min(séries, 12)/8 × 2^(−horas desde o treino / meia-vida)
 * pronto    quando carga ≤ −ln(0,75) ≈ 0,29  (fadiga 1 − e^(−carga) ≤ 25%)
 * ```
 *
 * `ratio` é o progresso desde o último treino até ficar pronto (0 = acabou de
 * treinar, 1 = pronto), que é o que a UI mostra. Como a soma de exponenciais
 * com a mesma meia-vida decai como uma só, o tempo restante é exato.
 *
 * Continua sendo estimativa: sono, calorias, idade e proximidade da falha não
 * são medidos. A UI deixa isso claro.
 */

/** Meia-vida da fadiga, em horas, por músculo. */
const HALF_LIFE_HOURS: Partial<Record<Muscle, number>> = {
  chest: 30,
  back: 30,
  lats: 30,
  traps: 30,
  quads: 48,
  hamstrings: 48,
  glutes: 48,
  calves: 48,
  adductors: 48,
  abductors: 48,
};
/** Braços, ombros, core e o resto. */
const DEFAULT_HALF_LIFE = 24;
/** Séries que equivalem a uma sessão completa num músculo. */
const SETS_PER_SESSION = 8;
/** Acima disso, mais séries na mesma sessão não somam fadiga. */
const MAX_SETS_PER_SESSION = 12;
/** Carga abaixo da qual o músculo está pronto: fadiga 1 − e^(−carga) ≤ 25%. */
const READY_LOAD = -Math.log(0.75);

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
): MuscleRecovery[] {
  // Séries por músculo e instante: exercícios da mesma sessão se somam.
  const sessions = new Map<Muscle, Map<number, number>>();

  for (const stimulus of stimuli) {
    const at = stimulus.at instanceof Date ? stimulus.at : new Date(stimulus.at);
    const ms = at.getTime();
    if (Number.isNaN(ms) || ms > now.getTime()) continue; // inválido ou no futuro
    const porInstante = sessions.get(stimulus.muscle) ?? new Map<number, number>();
    porInstante.set(ms, (porInstante.get(ms) ?? 0) + Math.max(0, stimulus.sets));
    sessions.set(stimulus.muscle, porInstante);
  }

  const result: MuscleRecovery[] = [];

  for (const [muscle, porInstante] of sessions) {
    const halfLife = HALF_LIFE_HOURS[muscle] ?? DEFAULT_HALF_LIFE;
    const ultimo = Math.max(...porInstante.keys());
    const lastSets = porInstante.get(ultimo) ?? 0;

    // Carga logo após o último treino, somando o resíduo dos anteriores.
    let carga = 0;
    for (const [ms, sets] of porInstante) {
      const horasAntes = (ultimo - ms) / 3_600_000;
      carga +=
        (Math.min(sets, MAX_SETS_PER_SESSION) / SETS_PER_SESSION) * 2 ** (-horasAntes / halfLife);
    }

    const hoursSince = (now.getTime() - ultimo) / 3_600_000;
    const hoursNeeded = carga > READY_LOAD ? halfLife * Math.log2(carga / READY_LOAD) : 0;
    const ratio = hoursNeeded > 0 ? Math.min(1, hoursSince / hoursNeeded) : 1;

    result.push({
      muscle,
      ratio,
      percent: Math.round(ratio * 100),
      status: statusFrom(ratio),
      hoursSince: Math.round(hoursSince),
      hoursNeeded: Math.round(hoursNeeded),
      hoursRemaining: Math.max(0, Math.round(hoursNeeded - hoursSince)),
      lastTrainedAt: new Date(ultimo),
      lastSets,
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
