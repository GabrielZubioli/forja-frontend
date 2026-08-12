import { epley1RM } from "./one-rep-max";

/**
 * Detecção de estagnação, fadiga e desalinhamento — o "treinador" do app.
 *
 * ## Por que é determinístico
 *
 * Estas conclusões vêm de aritmética sobre os dados do usuário, não de
 * linguagem. Um modelo de linguagem produziria a mesma frase com menos
 * confiabilidade, custo por chamada e nenhuma garantia de reprodutibilidade —
 * e é impossível testar "o LLM percebeu a estagnação?".
 *
 * O papel do LLM, no app, é **explicar** estes achados em conversa. Os números
 * saem daqui.
 *
 * ## Por que exige histórico mínimo
 *
 * Toda função aqui se recusa a concluir com poucos dados, e diz o que falta.
 * Um app que anuncia "você estagnou!" depois de duas sessões destrói a própria
 * credibilidade — e a única coisa que ele detectou foi que o usuário é novo.
 */

export interface ExerciseSessionSummary {
  /** Chave `YYYY-MM-DD` local. */
  date: string;
  /** Melhor série de trabalho da sessão. */
  bestWeightKg: number;
  bestReps: number;
  /** RPE médio das séries de trabalho, quando registrado. */
  avgRpe?: number | undefined;
  /** Tonelagem das séries de trabalho concluídas. */
  volumeKg: number;
}

export type StagnationVerdict =
  | { kind: "insufficient_data"; sessionsNeeded: number }
  | { kind: "progressing"; changePct: number }
  | { kind: "plateau"; sessions: number; changePct: number }
  | { kind: "regressing"; changePct: number }
  | { kind: "overreaching"; sessions: number; rpeIncrease: number };

/**
 * Analisa a progressão de um exercício.
 *
 * Usa o **e1RM** (carga estimada para uma repetição), não a carga bruta: subir
 * de 60 kg × 8 para 60 kg × 11 é progresso real que a carga bruta não enxerga,
 * e é exatamente assim que a dupla progressão funciona.
 *
 * `overreaching` é o achado mais valioso e o que nenhum app comum faz: quando
 * o e1RM **não** sobe *e* o RPE sobe, o corpo está gastando mais para entregar
 * o mesmo. Isso é fadiga acumulada, não falta de estímulo — e a resposta certa
 * é descarga, não mais volume. Tratar os dois casos como "estagnação" leva
 * metade dos usuários a piorar o próprio problema.
 */
export function analyzeStagnation(
  sessions: readonly ExerciseSessionSummary[],
  minSessions = 4,
): StagnationVerdict {
  if (sessions.length < minSessions) {
    return { kind: "insufficient_data", sessionsNeeded: minSessions - sessions.length };
  }

  // Ordem cronológica garantida — a origem pode vir ordenada ao contrário.
  const ordenadas = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  const janela = ordenadas.slice(-minSessions);

  const e1rm = janela.map((s) => epley1RM(s.bestWeightKg, s.bestReps));
  const primeiro = e1rm[0]!;
  const ultimo = e1rm.at(-1)!;
  if (primeiro <= 0) return { kind: "insufficient_data", sessionsNeeded: 1 };

  const changePct = ((ultimo - primeiro) / primeiro) * 100;

  // Compara metades em vez de só as pontas: uma sessão ruim isolada no fim
  // (dormiu mal, treinou com pressa) não deve ser lida como regressão.
  const metade = Math.floor(janela.length / 2);
  const mediaInicio = media(e1rm.slice(0, metade));
  const mediaFim = media(e1rm.slice(-metade));
  const variacaoMedia = mediaInicio > 0 ? ((mediaFim - mediaInicio) / mediaInicio) * 100 : 0;

  const rpes = janela.map((s) => s.avgRpe).filter((r): r is number => typeof r === "number");
  const temRpe = rpes.length >= janela.length - 1 && rpes.length >= 2;
  const aumentoRpe = temRpe ? rpes.at(-1)! - rpes[0]! : 0;

  // Esforço subindo com desempenho parado: fadiga, não falta de estímulo.
  if (temRpe && aumentoRpe >= 1 && variacaoMedia < 1.5) {
    return { kind: "overreaching", sessions: janela.length, rpeIncrease: aumentoRpe };
  }

  // O limiar de −3% existe porque o e1RM oscila com sono, hidratação e horário.
  if (variacaoMedia < -3) return { kind: "regressing", changePct };
  if (variacaoMedia < 1.5) return { kind: "plateau", sessions: janela.length, changePct };

  return { kind: "progressing", changePct };
}

function media(valores: readonly number[]): number {
  if (valores.length === 0) return 0;
  return valores.reduce((s, v) => s + v, 0) / valores.length;
}

export interface WeeklyVolumeByMuscle {
  muscle: string;
  /** Séries efetivas na semana (secundários contam fracionado). */
  sets: number;
}

/**
 * Faixa produtiva de séries semanais por grupo muscular.
 *
 * Abaixo do mínimo, o estímulo é insuficiente para adaptação; acima do máximo,
 * o volume passa a exigir mais recuperação do que entrega em resultado. As
 * faixas são amplas de propósito — a resposta individual varia bastante, e
 * fingir precisão de uma série seria falso rigor.
 *
 * Braços, panturrilha e core ficam de fora: recebem tanto volume indireto que
 * contá-los isoladamente gera alertas falsos.
 */
const PRODUCTIVE_RANGE: Record<string, { min: number; max: number }> = {
  chest: { min: 10, max: 20 },
  back: { min: 10, max: 22 },
  lats: { min: 10, max: 22 },
  shoulders: { min: 8, max: 20 },
  side_delts: { min: 8, max: 20 },
  quads: { min: 10, max: 20 },
  hamstrings: { min: 8, max: 18 },
  glutes: { min: 8, max: 18 },
};

export type VolumeVerdict = {
  muscle: string;
  sets: number;
  status: "low" | "productive" | "high";
  range: { min: number; max: number };
};

export function analyzeWeeklyVolume(volumes: readonly WeeklyVolumeByMuscle[]): VolumeVerdict[] {
  return volumes
    .map((v) => {
      const range = PRODUCTIVE_RANGE[v.muscle];
      if (!range) return null;

      const status: VolumeVerdict["status"] =
        v.sets < range.min ? "low" : v.sets > range.max ? "high" : "productive";

      return { muscle: v.muscle, sets: Math.round(v.sets * 10) / 10, status, range };
    })
    .filter((v): v is VolumeVerdict => v !== null);
}

export interface AdherenceInput {
  /** Treinos concluídos nos últimos 7 dias. */
  workoutsLast7: number;
  /** Treinos planejados por semana. */
  plannedPerWeek: number;
  /** Dias com registro alimentar nos últimos 7. */
  loggedDaysLast7: number;
  /** Dias desde a última pesagem. `null` se nunca pesou. */
  daysSinceWeighIn: number | null;
}

export type AdherenceFlag =
  | { kind: "workouts_behind"; missing: number }
  | { kind: "diet_untracked"; days: number }
  | { kind: "weigh_in_overdue"; days: number }
  | { kind: "on_track" };

/**
 * Sinais de aderência.
 *
 * Ordenados por impacto: faltar treino importa mais que esquecer de pesar. A
 * lista é curta de propósito — cinco avisos simultâneos é o mesmo que nenhum.
 */
export function analyzeAdherence(input: AdherenceInput): AdherenceFlag[] {
  const flags: AdherenceFlag[] = [];

  const faltando = input.plannedPerWeek - input.workoutsLast7;
  // Tolera uma falta: cobrar por um treino perdido numa semana normal é
  // pressão sem informação. Duas ou mais indicam um padrão.
  if (faltando >= 2) flags.push({ kind: "workouts_behind", missing: faltando });

  if (input.loggedDaysLast7 <= 3) {
    flags.push({ kind: "diet_untracked", days: 7 - input.loggedDaysLast7 });
  }

  if (input.daysSinceWeighIn !== null && input.daysSinceWeighIn >= 10) {
    flags.push({ kind: "weigh_in_overdue", days: input.daysSinceWeighIn });
  }

  return flags.length > 0 ? flags : [{ kind: "on_track" }];
}

export interface EnergyAlignmentInput {
  /** Variação de peso por semana observada na tendência (kg). */
  weeklyWeightChangeKg: number;
  /** Direção pretendida. */
  goal: "lose" | "maintain" | "gain";
  /** Meta calórica atual. */
  currentKcalTarget: number;
  /** Dias de diário considerados. */
  loggedDays: number;
}

export type EnergyVerdict =
  | { kind: "insufficient_data"; daysNeeded: number }
  | { kind: "aligned"; observedKgPerWeek: number }
  | { kind: "too_fast"; observedKgPerWeek: number; suggestedKcal: number }
  | { kind: "too_slow"; observedKgPerWeek: number; suggestedKcal: number };

/** Ritmos semanais sustentáveis, em kg. */
const TARGET_RATE: Record<EnergyAlignmentInput["goal"], { min: number; max: number }> = {
  // Perder mais rápido que 1% do peso por semana custa músculo.
  lose: { min: -0.9, max: -0.2 },
  maintain: { min: -0.25, max: 0.25 },
  // Ganhar rápido demais é ganho de gordura, não de músculo.
  gain: { min: 0.1, max: 0.4 },
};

/**
 * Compara o ritmo observado com o pretendido e sugere ajuste calórico.
 *
 * O ajuste é modesto (±10%) de propósito: uma correção agressiva sobre uma
 * estimativa ruidosa produz oscilação, e o usuário passa a perseguir a própria
 * balança. Duas semanas de dados são o mínimo — abaixo disso, o que se mede é
 * retenção de água, não composição corporal.
 */
export function analyzeEnergyAlignment(input: EnergyAlignmentInput): EnergyVerdict {
  const MIN_DIAS = 14;
  if (input.loggedDays < MIN_DIAS) {
    return { kind: "insufficient_data", daysNeeded: MIN_DIAS - input.loggedDays };
  }

  const faixa = TARGET_RATE[input.goal];
  const ritmo = Math.round(input.weeklyWeightChangeKg * 100) / 100;

  if (ritmo >= faixa.min && ritmo <= faixa.max) {
    return { kind: "aligned", observedKgPerWeek: ritmo };
  }

  const perdendoDemais = input.goal === "lose" && ritmo < faixa.min;
  const ganhandoDemais = input.goal === "gain" && ritmo > faixa.max;
  const rapidoDemais =
    perdendoDemais || ganhandoDemais || (input.goal === "maintain" && Math.abs(ritmo) > 0.25);

  const fator = rapidoDemais
    ? input.goal === "lose"
      ? 1.1 // comer mais para desacelerar a perda
      : 0.9
    : input.goal === "lose"
      ? 0.9 // comer menos para acelerar
      : 1.1;

  const sugerido = Math.round((input.currentKcalTarget * fator) / 10) * 10;

  return rapidoDemais
    ? { kind: "too_fast", observedKgPerWeek: ritmo, suggestedKcal: sugerido }
    : { kind: "too_slow", observedKgPerWeek: ritmo, suggestedKcal: sugerido };
}
