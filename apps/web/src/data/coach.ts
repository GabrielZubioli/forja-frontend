import { supabase } from "@/integrations/supabase/client";
import { num, unwrapList, unwrapMaybe } from "@/data/supabase-helpers";
import { toISODate, todayISO } from "@/lib/date";
import { addDays, differenceInCalendarDays } from "date-fns";
import {
  analyzeAdherence,
  analyzeEnergyAlignment,
  analyzeStagnation,
  analyzeWeeklyVolume,
  ema,
  type AdherenceFlag,
  type EnergyVerdict,
  type ExerciseSessionSummary,
  type VolumeVerdict,
} from "@forja/domain";

/**
 * O treinador — parte determinística.
 *
 * Reúne os dados do usuário, roda as análises puras de `@forja/domain` e
 * traduz os vereditos em recomendações acionáveis.
 *
 * O que **não** acontece aqui: nenhuma chamada a modelo de linguagem. Estes
 * números são aritmética sobre o histórico, e um LLM só acrescentaria custo,
 * latência e incerteza. O papel dele no app é conversar sobre estes achados,
 * na tela do chat — não produzi-los.
 */

export interface CoachInsight {
  id: string;
  kind:
    | "deload"
    | "load_increase"
    | "exercise_swap"
    | "volume_increase"
    | "volume_decrease"
    | "diet_adjust"
    | "consistency"
    | "check_in"
    | "hydration";
  title: string;
  body: string;
  /** 0 = informativo, 1 = atenção, 2 = importante. */
  severity: 0 | 1 | 2;
  action?: { label: string; to: string } | undefined;
}

const LOOKBACK_DAYS = 28;

/**
 * Calcula as recomendações do momento.
 *
 * Deliberadamente **limitado a três**. Um painel com oito avisos é um painel
 * que o usuário fecha sem ler; a triagem por severidade é o que mantém cada
 * aviso significando alguma coisa.
 */
export async function fetchCoachInsights(): Promise<CoachInsight[]> {
  const hoje = todayISO();
  const desde = toISODate(addDays(new Date(), -LOOKBACK_DAYS));

  const [profile, sessoes, pesos, diasComDiario] = await Promise.all([
    fetchProfile(),
    fetchRecentSessions(desde),
    fetchWeights(desde),
    fetchLoggedDays(toISODate(addDays(new Date(), -7))),
  ]);

  const insights: CoachInsight[] = [];

  // ------------------------------------------------------------- aderência
  const ultimaPesagem = pesos.at(-1)?.date;
  const flags = analyzeAdherence({
    workoutsLast7: sessoes.filter((s) => s.date >= toISODate(addDays(new Date(), -7))).length,
    plannedPerWeek: num(profile?.days_per_week, 3),
    loggedDaysLast7: diasComDiario,
    daysSinceWeighIn: ultimaPesagem
      ? differenceInCalendarDays(new Date(), new Date(`${ultimaPesagem}T12:00:00`))
      : null,
  });

  for (const flag of flags) insights.push(...adherenceToInsight(flag));

  // ------------------------------------------------------- energia vs peso
  if (pesos.length >= 8) {
    const serie = pesos.map((p) => p.weightKg);
    const suavizada = ema(serie, 0.25);
    const atual = suavizada.at(-1);
    const anterior = suavizada.length > 7 ? suavizada.at(-8) : undefined;

    if (atual !== undefined && anterior !== undefined) {
      const veredito = analyzeEnergyAlignment({
        weeklyWeightChangeKg: atual - anterior,
        goal: (profile?.goal ?? "maintain") as "lose" | "maintain" | "gain",
        currentKcalTarget: num(profile?.daily_kcal_target, 2000),
        loggedDays: pesos.length,
      });
      const insight = energyToInsight(veredito);
      if (insight) insights.push(insight);
    }
  }

  // ------------------------------------------------- estagnação por exercício
  const porExercicio = groupByExercise(sessoes);
  for (const [exerciseId, dados] of porExercicio) {
    // Só exercícios com histórico suficiente; o resto seria adivinhação.
    if (dados.sessions.length < 4) continue;

    const veredito = analyzeStagnation(dados.sessions);
    if (veredito.kind === "overreaching") {
      insights.push({
        id: `deload:${exerciseId}`,
        kind: "deload",
        severity: 2,
        title: `${dados.name}: sinal de fadiga acumulada`,
        body: `Nas últimas ${veredito.sessions} sessões a carga não subiu, mas o esforço percebido aumentou ${veredito.rpeIncrease.toFixed(1)} ponto${veredito.rpeIncrease >= 2 ? "s" : ""}. Isso costuma ser fadiga, não falta de estímulo — reduza a carga em 10% por uma semana e volte mais forte.`,
        action: { label: "Ver exercício", to: `/exercises/${exerciseId}` },
      });
    } else if (veredito.kind === "plateau") {
      insights.push({
        id: `plateau:${exerciseId}`,
        kind: "exercise_swap",
        severity: 1,
        title: `${dados.name} parou de progredir`,
        body: `${veredito.sessions} sessões sem avanço na carga estimada. Vale trocar por uma variação do mesmo padrão de movimento, ou revisar séries e descanso.`,
        action: { label: "Ver exercício", to: `/exercises/${exerciseId}` },
      });
    } else if (veredito.kind === "regressing") {
      insights.push({
        id: `regress:${exerciseId}`,
        kind: "deload",
        severity: 2,
        title: `${dados.name} está caindo`,
        body: `Queda de ${Math.abs(veredito.changePct).toFixed(0)}% na carga estimada. Vale checar sono, calorias e se o volume total da semana não está alto demais.`,
        action: { label: "Ver exercício", to: `/exercises/${exerciseId}` },
      });
    }
  }

  // ------------------------------------------------------ volume por grupo
  const volumes = await fetchWeeklyMuscleVolume(toISODate(addDays(new Date(), -7)));
  for (const v of analyzeWeeklyVolume(volumes)) {
    const insight = volumeToInsight(v);
    if (insight) insights.push(insight);
  }

  void hoje;

  return insights.sort((a, b) => b.severity - a.severity).slice(0, 3);
}

// --------------------------------------------------------------- tradutores

function adherenceToInsight(flag: AdherenceFlag): CoachInsight[] {
  switch (flag.kind) {
    case "workouts_behind":
      return [
        {
          id: "adherence:workouts",
          kind: "consistency",
          severity: 1,
          title: `${flag.missing} treinos a menos esta semana`,
          body: "A sequência A → B → C não se perde: ela espera por você. Um treino curto vale mais que nenhum — comece por ele.",
          action: { label: "Treinar agora", to: "/workouts" },
        },
      ];
    case "diet_untracked":
      return [
        {
          id: "adherence:diet",
          kind: "consistency",
          severity: 1,
          title: "Seu diário está parado",
          body: "Sem registro não dá para ajustar as metas ao que está acontecendo de verdade. Marcar as refeições do plano leva poucos segundos.",
          action: { label: "Abrir dieta", to: "/diet" },
        },
      ];
    case "weigh_in_overdue":
      return [
        {
          id: "adherence:weight",
          kind: "check_in",
          severity: 0,
          title: `Sem pesagem há ${flag.days} dias`,
          body: "A tendência de peso é o que diz se as calorias estão certas. Uma pesagem por semana já basta.",
          action: { label: "Registrar peso", to: "/body" },
        },
      ];
    case "on_track":
      return [];
  }
}

function energyToInsight(v: EnergyVerdict): CoachInsight | null {
  if (v.kind === "insufficient_data" || v.kind === "aligned") return null;

  const rapido = v.kind === "too_fast";
  return {
    id: "energy:alignment",
    kind: "diet_adjust",
    severity: rapido ? 2 : 1,
    title: rapido ? "Seu ritmo está acelerado demais" : "O peso não está respondendo",
    body: rapido
      ? `Você está a ${Math.abs(v.observedKgPerWeek).toFixed(2)} kg por semana. Nesse ritmo, parte do que sai é músculo. Sugerimos ${v.suggestedKcal.toLocaleString("pt-BR")} kcal por dia.`
      : `A tendência está em ${v.observedKgPerWeek > 0 ? "+" : ""}${v.observedKgPerWeek.toFixed(2)} kg por semana, longe do esperado. Sugerimos ${v.suggestedKcal.toLocaleString("pt-BR")} kcal por dia.`,
    action: { label: "Ajustar metas", to: "/settings" },
  };
}

function volumeToInsight(v: VolumeVerdict): CoachInsight | null {
  if (v.status === "productive") return null;

  const baixo = v.status === "low";
  return {
    id: `volume:${v.muscle}`,
    kind: baixo ? "volume_increase" : "volume_decrease",
    severity: baixo ? 1 : 0,
    title: baixo
      ? `Volume baixo em ${muscleLabel(v.muscle)}`
      : `Volume alto em ${muscleLabel(v.muscle)}`,
    body: baixo
      ? `${v.sets} séries efetivas nesta semana, abaixo da faixa produtiva de ${v.range.min} a ${v.range.max}. Adicionar um exercício ou uma série ajudaria.`
      : `${v.sets} séries efetivas nesta semana, acima de ${v.range.max}. Mais volume aqui exige mais recuperação do que costuma render.`,
    action: { label: "Ajustar treino", to: "/workouts" },
  };
}

const MUSCLE_PT: Record<string, string> = {
  chest: "peito",
  back: "costas",
  lats: "dorsais",
  shoulders: "ombros",
  side_delts: "deltoides laterais",
  quads: "quadríceps",
  hamstrings: "posteriores",
  glutes: "glúteos",
};

const muscleLabel = (m: string) => MUSCLE_PT[m] ?? m;

// ------------------------------------------------------------- consultas

async function fetchProfile() {
  return unwrapMaybe(
    "carregar perfil do treinador",
    await supabase.from("profiles").select("goal, daily_kcal_target, days_per_week").maybeSingle(),
  );
}

interface SessionRow {
  date: string;
  exerciseId: string;
  name: string;
  weightKg: number;
  reps: number;
  rpe: number | null;
}

async function fetchRecentSessions(desde: string): Promise<SessionRow[]> {
  const rows = unwrapList(
    "carregar sessões recentes",
    await supabase
      .from("workout_sets")
      .select(
        "weight_kg, reps, rpe, set_type, completed, exercise_id, exercises(name), workout_sessions!inner(started_at, ended_at, deleted_at)",
      )
      .eq("completed", true)
      .neq("set_type", "warmup")
      .gte("workout_sessions.started_at", `${desde}T00:00:00`)
      .not("workout_sessions.ended_at", "is", null)
      .is("workout_sessions.deleted_at", null)
      .limit(1200),
  );

  return rows
    .filter((r) => r.workout_sessions)
    .map((r) => ({
      date: toISODate(new Date(r.workout_sessions!.started_at)),
      exerciseId: r.exercise_id,
      name: r.exercises?.name ?? "Exercício",
      weightKg: num(r.weight_kg),
      reps: num(r.reps),
      rpe: r.rpe !== null ? num(r.rpe) : null,
    }));
}

/** Agrupa as séries por exercício e reduz cada dia à melhor série de trabalho. */
function groupByExercise(rows: readonly SessionRow[]) {
  const porExercicio = new Map<string, { name: string; porDia: Map<string, SessionRow[]> }>();

  for (const row of rows) {
    if (row.weightKg <= 0 || row.reps <= 0) continue;
    const entry = porExercicio.get(row.exerciseId) ?? { name: row.name, porDia: new Map() };
    const dia = entry.porDia.get(row.date) ?? [];
    dia.push(row);
    entry.porDia.set(row.date, dia);
    porExercicio.set(row.exerciseId, entry);
  }

  const resultado = new Map<string, { name: string; sessions: ExerciseSessionSummary[] }>();

  for (const [id, entry] of porExercicio) {
    const sessions: ExerciseSessionSummary[] = [...entry.porDia.entries()]
      .map(([date, series]) => {
        // A melhor série do dia por e1RM implícito: peso × reps é uma
        // aproximação suficiente para escolher entre séries do mesmo dia.
        const melhor = series.reduce((a, b) =>
          a.weightKg * (1 + a.reps / 30) >= b.weightKg * (1 + b.reps / 30) ? a : b,
        );
        const rpes = series.map((s) => s.rpe).filter((r): r is number => r !== null);

        return {
          date,
          bestWeightKg: melhor.weightKg,
          bestReps: melhor.reps,
          volumeKg: series.reduce((sum, s) => sum + s.weightKg * s.reps, 0),
          ...(rpes.length > 0 ? { avgRpe: rpes.reduce((a, b) => a + b, 0) / rpes.length } : {}),
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    resultado.set(id, { name: entry.name, sessions });
  }

  return resultado;
}

async function fetchWeights(desde: string) {
  const rows = unwrapList(
    "carregar peso",
    await supabase
      .from("body_weights")
      .select("log_date, weight_kg")
      .gte("log_date", desde)
      .order("log_date"),
  );
  return rows.map((r) => ({ date: r.log_date, weightKg: num(r.weight_kg) }));
}

async function fetchLoggedDays(desde: string): Promise<number> {
  const rows = unwrapList(
    "contar dias com diário",
    await supabase
      .from("food_log_entries")
      .select("log_date")
      .eq("consumed", true)
      .gte("log_date", desde),
  );
  return new Set(rows.map((r) => r.log_date)).size;
}

/**
 * Séries efetivas por músculo na semana.
 *
 * Usa `exercise_muscles` — a tabela de contribuição 0–1 — em vez de contar
 * `primary_muscle` inteiro. Sem ela, uma série de supino contaria como série
 * cheia de tríceps e o volume de braço apareceria inflado em ~100%.
 */
async function fetchWeeklyMuscleVolume(desde: string) {
  const rows = unwrapList(
    "calcular volume por músculo",
    await supabase
      .from("workout_sets")
      .select(
        "exercise_id, set_type, completed, exercises(exercise_muscles(muscle, contribution)), workout_sessions!inner(started_at, ended_at, deleted_at)",
      )
      .eq("completed", true)
      .neq("set_type", "warmup")
      .gte("workout_sessions.started_at", `${desde}T00:00:00`)
      .not("workout_sessions.ended_at", "is", null)
      .is("workout_sessions.deleted_at", null)
      .limit(1200),
  );

  const porMusculo = new Map<string, number>();
  for (const row of rows) {
    for (const m of row.exercises?.exercise_muscles ?? []) {
      porMusculo.set(m.muscle, (porMusculo.get(m.muscle) ?? 0) + num(m.contribution));
    }
  }

  return [...porMusculo.entries()].map(([muscle, sets]) => ({ muscle, sets }));
}
