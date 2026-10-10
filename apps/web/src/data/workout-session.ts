import { supabase } from "@/integrations/supabase/client";
import { assertOk, num, unwrap, unwrapList, unwrapMaybe } from "@/data/supabase-helpers";
import { advanceRoutineForTemplate } from "@/data/routines";
import { startSessionFromTemplate } from "@/data/workouts";
import { exerciseImages } from "@/data/exercise-media";
import { toISODate } from "@/lib/date";
import {
  compareWithLastSession,
  epley1RM,
  sessionVolume,
  strengthTrainingKcal,
  type ExerciseComparison,
  type SimpleSet,
} from "@forja/domain";

/**
 * A sessão de treino como o usuário a executa.
 *
 * Registro série a série: cada série tem carga, repetições, RIR (gravado como
 * RPE = 10 − RIR) e o círculo de concluída. A tela mostra ao lado o que foi
 * feito da última vez, a melhor carga e a sugestão de progressão — por isso o
 * carregador junta o histórico de cada exercício numa consulta só.
 *
 * Concluir uma série sem ter digitado nada grava o que estava na tela (a carga
 * sugerida e as repetições do plano): quem não quer digitar ainda produz dado
 * que alimenta volume, recordes e progressão.
 */

export interface BoardSet {
  id: string;
  setIndex: number;
  weightKg: number | null;
  reps: number | null;
  completed: boolean;
  restSeconds: number | null;
  /** Repetições em reserva (guardado como RPE = 10 − RIR). */
  rir: number | null;
}

export interface LastTime {
  /** `YYYY-MM-DD` da sessão anterior com este exercício. */
  date: string;
  sets: { weightKg: number | null; reps: number | null; rir: number | null }[];
}

export interface BoardExercise {
  exerciseId: string;
  position: number;
  name: string;
  /** Grupo muscular principal e secundários, já em código de enum. */
  primaryMuscle: string;
  secondaryMuscles: string[];
  equipment: string;
  /** Imagens da demonstração — do banco ou da base local. Nunca vazia sem motivo. */
  images: string[];
  videoUrl: string | null;
  notes: string | null;
  targetReps: number | null;
  restSeconds: number;
  supersetGroup: number | null;
  sets: BoardSet[];
  /** Carga sugerida: o que a pessoa levantou da última vez neste exercício. */
  suggestedWeightKg: number | null;
  /** Faixa de repetições do plano, quando houver. */
  repMin: number | null;
  repMax: number | null;
  /** As séries da sessão anterior com este exercício. */
  lastTime: LastTime | null;
  /** Maior carga já registrada neste exercício. */
  bestKg: number | null;
  done: boolean;
}

export interface WorkoutBoard {
  sessionId: string;
  name: string;
  templateId: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  totalVolumeKg: number;
  exercises: BoardExercise[];
  /** 0–1. Fração de exercícios concluídos. */
  progress: number;
}

/**
 * Abre o treino de uma divisão: retoma o que já estava aberto, ou cria.
 *
 * Retomar é o que impede o app de criar uma sessão nova a cada vez que a pessoa
 * sai da tela e volta — o que produziria três "treinos" para um único treino, e
 * um histórico que não descreve nada.
 */
export async function openWorkoutForTemplate(userId: string, templateId: string): Promise<string> {
  const aberta = unwrapMaybe(
    "procurar treino em andamento",
    await supabase
      .from("workout_sessions")
      .select("id")
      .eq("user_id", userId)
      .eq("template_id", templateId)
      .is("ended_at", null)
      .is("deleted_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );

  if (aberta) return aberta.id;
  return startSessionFromTemplate(userId, templateId);
}

/** O treino inteiro numa consulta: sessão, séries, exercícios e mídia. */
export async function fetchWorkoutBoard(sessionId: string): Promise<WorkoutBoard> {
  const session = unwrap(
    "carregar treino",
    await supabase
      .from("workout_sessions")
      .select("id, name, template_id, started_at, ended_at, duration_seconds, total_volume_kg")
      .eq("id", sessionId)
      .single(),
  );

  const rows = unwrapList(
    "carregar séries do treino",
    await supabase
      .from("workout_sets")
      .select(
        "id, exercise_id, position, set_index, weight_kg, reps, rpe, rest_seconds, completed, superset_group, notes, exercises(name, primary_muscle, secondary_muscles, equipment, image_urls, video_url)",
      )
      .eq("session_id", sessionId)
      .order("position")
      .order("set_index"),
  );

  // Prescrição e observações vivem no template, não na série. Sem isto, a tela
  // de execução não teria como mostrar "3 × 8–12" nem a observação do plano.
  const prescricao = session.template_id
    ? await fetchPrescription(session.template_id)
    : new Map<string, Prescription>();

  const historico = await fetchExerciseHistory(sessionId, [
    ...new Set(rows.map((r) => r.exercise_id)),
  ]);

  const porExercicio = new Map<string, BoardExercise>();

  for (const row of rows) {
    const chave = `${row.position}-${row.exercise_id}`;
    let grupo = porExercicio.get(chave);

    if (!grupo) {
      const ex = row.exercises;
      const nome = ex?.name ?? "Exercício";
      const p = prescricao.get(row.exercise_id);

      grupo = {
        exerciseId: row.exercise_id,
        position: row.position,
        name: nome,
        primaryMuscle: ex?.primary_muscle ?? "full_body",
        secondaryMuscles: ex?.secondary_muscles ?? [],
        equipment: ex?.equipment ?? "other",
        images: exerciseImages(nome, ex?.image_urls),
        videoUrl: ex?.video_url ?? null,
        notes: p?.notes ?? row.notes ?? null,
        targetReps: p?.repsLabel ?? null,
        restSeconds: p?.restSeconds ?? num(row.rest_seconds, 90),
        supersetGroup: row.superset_group,
        sets: [],
        suggestedWeightKg: historico.get(row.exercise_id)?.suggestedKg ?? null,
        repMin: p?.repMin ?? null,
        repMax: p?.repMax ?? null,
        lastTime: historico.get(row.exercise_id)?.lastTime ?? null,
        bestKg: historico.get(row.exercise_id)?.bestKg ?? null,
        done: false,
      };
      porExercicio.set(chave, grupo);
    }

    grupo.sets.push({
      id: row.id,
      setIndex: row.set_index,
      weightKg: row.weight_kg === null ? null : num(row.weight_kg),
      reps: row.reps === null ? null : num(row.reps),
      completed: row.completed,
      restSeconds: row.rest_seconds === null ? null : num(row.rest_seconds),
      rir: rirFromRpe(row.rpe),
    });
  }

  const exercises = [...porExercicio.values()]
    .map((e) => ({ ...e, done: e.sets.length > 0 && e.sets.every((s) => s.completed) }))
    .sort((a, b) => a.position - b.position);

  const concluidos = exercises.filter((e) => e.done).length;

  return {
    sessionId: session.id,
    name: session.name,
    templateId: session.template_id,
    startedAt: session.started_at,
    endedAt: session.ended_at,
    durationSeconds: num(session.duration_seconds),
    totalVolumeKg: num(session.total_volume_kg),
    exercises,
    progress: exercises.length === 0 ? 0 : concluidos / exercises.length,
  };
}

interface Prescription {
  /** `"8–12"` ou `"10"`, já formatado — a UI não deve refazer essa decisão. */
  repsLabel: number | null;
  repsText: string;
  repMin: number | null;
  repMax: number | null;
  restSeconds: number;
  notes: string | null;
}

async function fetchPrescription(templateId: string): Promise<Map<string, Prescription>> {
  const itens = unwrapList(
    "carregar prescrição do treino",
    await supabase
      .from("workout_template_exercises")
      .select("exercise_id, target_reps, target_rep_min, target_rep_max, rest_seconds, notes")
      .eq("template_id", templateId),
  );

  return new Map(
    itens.map((i) => [
      i.exercise_id,
      {
        repsLabel: i.target_reps,
        repsText:
          i.target_rep_min && i.target_rep_max
            ? `${i.target_rep_min}–${i.target_rep_max}`
            : String(i.target_reps ?? 10),
        repMin: i.target_rep_min,
        repMax: i.target_rep_max,
        restSeconds: num(i.rest_seconds, 90),
        notes: i.notes,
      },
    ]),
  );
}

/**
 * Histórico de cada exercício, ignorando a sessão atual: as séries da última
 * vez (com data), a carga sugerida e a melhor carga já feita.
 *
 * Ignorar a sessão atual importa: sem isso, a sugestão passaria a ser o que a
 * pessoa acabou de digitar hoje, e o "última vez" viraria um espelho.
 */
async function fetchExerciseHistory(
  sessionId: string,
  exerciseIds: readonly string[],
): Promise<Map<string, { suggestedKg: number | null; bestKg: number | null; lastTime: LastTime }>> {
  const resultado = new Map<
    string,
    { suggestedKg: number | null; bestKg: number | null; lastTime: LastTime }
  >();
  if (exerciseIds.length === 0) return resultado;

  const rows = unwrapList(
    "carregar histórico dos exercícios",
    await supabase
      .from("workout_sets")
      .select(
        "exercise_id, session_id, set_index, weight_kg, reps, rpe, workout_sessions!inner(started_at, ended_at, deleted_at)",
      )
      .in("exercise_id", exerciseIds as string[])
      .neq("session_id", sessionId)
      .eq("completed", true)
      .not("workout_sessions.ended_at", "is", null)
      .is("workout_sessions.deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(exerciseIds.length * 60),
  );

  // As linhas vêm da mais recente para a mais antiga: a primeira de cada
  // exercício aponta a sessão anterior; a melhor carga olha todas.
  const sessaoDe = new Map<string, { id: string; date: string }>();
  const series = new Map<string, (LastTime["sets"][number] & { setIndex: number })[]>();
  for (const r of rows) {
    if (!sessaoDe.has(r.exercise_id)) {
      sessaoDe.set(r.exercise_id, {
        id: r.session_id,
        date: toISODate(new Date(r.workout_sessions.started_at)),
      });
    }
    const atual = resultado.get(r.exercise_id) ?? {
      suggestedKg: null,
      bestKg: null,
      lastTime: { date: sessaoDe.get(r.exercise_id)!.date, sets: [] },
    };
    const kg = r.weight_kg === null ? null : num(r.weight_kg);
    if (kg !== null) atual.bestKg = Math.max(atual.bestKg ?? 0, kg);
    if (sessaoDe.get(r.exercise_id)!.id === r.session_id) {
      const lista = series.get(r.exercise_id) ?? [];
      lista.push({ weightKg: kg, reps: r.reps, rir: rirFromRpe(r.rpe), setIndex: r.set_index });
      series.set(r.exercise_id, lista);
      if (kg !== null) atual.suggestedKg = Math.max(atual.suggestedKg ?? 0, kg);
    }
    resultado.set(r.exercise_id, atual);
  }
  for (const [id, h] of resultado) {
    h.lastTime.sets = (series.get(id) ?? [])
      .sort((x, y) => x.setIndex - y.setIndex)
      .map(({ weightKg, reps, rir }) => ({ weightKg, reps, rir }));
  }
  return resultado;
}

/** RPE gravado → RIR mostrado. RIR 0 = falha. */
function rirFromRpe(rpe: number | string | null): number | null {
  return rpe === null ? null : Math.max(0, Math.round(10 - num(rpe)));
}

/**
 * Troca o exercício de todas as séries daquela posição, preservando o registro.
 *
 * Trocar é diferente de apagar e recriar: quem fez três séries de supino e
 * encontrou o banco ocupado não deve perder o que já registrou ao migrar para o
 * crucifixo.
 */
export async function substituteSessionExercise(
  sessionId: string,
  fromExerciseId: string,
  toExerciseId: string,
): Promise<void> {
  assertOk(
    "substituir exercício",
    await supabase
      .from("workout_sets")
      .update({ exercise_id: toExerciseId })
      .eq("session_id", sessionId)
      .eq("exercise_id", fromExerciseId),
  );
}

/** Ajusta uma série específica — para quem quer registrar a carga real. */
export async function updateSet(
  setId: string,
  patch: {
    weight_kg?: number | null;
    reps?: number | null;
    completed?: boolean;
    rir?: number | null;
  },
): Promise<void> {
  const { rir, ...resto } = patch;
  const linha = rir === undefined ? resto : { ...resto, rpe: rir === null ? null : 10 - rir };
  assertOk("salvar série", await supabase.from("workout_sets").update(linha).eq("id", setId));
}

/** Mais uma série no exercício, copiando carga e reps da última. */
export async function addSet(sessionId: string, exercise: BoardExercise): Promise<void> {
  const ultima = exercise.sets.at(-1);
  assertOk(
    "adicionar série",
    await supabase.from("workout_sets").insert({
      session_id: sessionId,
      exercise_id: exercise.exerciseId,
      position: exercise.position,
      set_index: (ultima?.setIndex ?? 0) + 1,
      weight_kg: ultima?.weightKg ?? exercise.suggestedWeightKg,
      reps: ultima?.reps ?? exercise.targetReps,
      rest_seconds: exercise.restSeconds,
      completed: false,
    }),
  );
}

export async function removeSet(setId: string): Promise<void> {
  assertOk("remover série", await supabase.from("workout_sets").delete().eq("id", setId));
}

export interface FinishResult {
  durationSeconds: number;
  volumeKg: number;
  personalRecords: string[];
  /** Estimativa pelo último peso registrado; `null` sem peso. */
  kcal: number | null;
  /** Hoje × última vez, por exercício. */
  comparisons: ExerciseComparison[];
}

/**
 * Encerra o treino: grava duração, volume, recordes e avança a divisão.
 *
 * Chamado pelo ✓ da tela de treino (com confirmação se houver séries pendentes).
 */
export async function finishWorkout(sessionId: string): Promise<FinishResult> {
  const board = await fetchWorkoutBoard(sessionId);

  if (board.endedAt) {
    return {
      durationSeconds: board.durationSeconds,
      volumeKg: board.totalVolumeKg,
      personalRecords: [],
      kcal: null,
      comparisons: [],
    };
  }

  const agora = new Date();
  const duration = Math.max(
    1,
    Math.round((agora.getTime() - new Date(board.startedAt).getTime()) / 1000),
  );

  const volume = sessionVolume(
    board.exercises.flatMap((e) =>
      e.sets.map((s) => ({
        weightKg: s.weightKg,
        reps: s.reps,
        setType: "working" as const,
        completed: s.completed,
      })),
    ),
  );

  const personalRecords = await marcarRecordes(board);

  assertOk(
    "finalizar treino",
    await supabase
      .from("workout_sessions")
      .update({
        ended_at: agora.toISOString(),
        duration_seconds: duration,
        total_volume_kg: volume,
      })
      .eq("id", sessionId),
  );

  if (board.templateId) {
    try {
      await advanceRoutineForTemplate(board.templateId);
    } catch (error) {
      // O avanço da sequência é secundário: falhar aqui não pode invalidar o
      // treino que a pessoa acabou de fazer.
      console.error("[rotina] não foi possível avançar a sequência:", error);
    }
  }

  return {
    durationSeconds: duration,
    volumeKg: volume,
    personalRecords,
    kcal: await estimarCalorias(duration),
    comparisons: await compararComAnterior(board),
  };
}

/** Compara o melhor 1RM estimado do treino com o histórico e marca os recordes. */
async function marcarRecordes(board: WorkoutBoard): Promise<string[]> {
  const recordes: string[] = [];

  for (const exercise of board.exercises) {
    const melhorHoje = exercise.sets
      .filter((s) => s.completed && (s.weightKg ?? 0) > 0 && (s.reps ?? 0) > 0)
      .reduce(
        (melhor, s) => {
          const e1rm = epley1RM(s.weightKg!, s.reps!);
          return e1rm > melhor.e1rm ? { e1rm, setId: s.id } : melhor;
        },
        { e1rm: 0, setId: "" },
      );

    if (melhorHoje.e1rm === 0) continue;

    const historico = unwrapList(
      "carregar recorde do exercício",
      await supabase
        .from("workout_sets")
        .select("weight_kg, reps, workout_sessions!inner(id)")
        .eq("exercise_id", exercise.exerciseId)
        .eq("completed", true)
        .neq("session_id", board.sessionId)
        .not("weight_kg", "is", null)
        .limit(500),
    );

    const melhorAnterior = historico.reduce(
      (best, s) => Math.max(best, epley1RM(num(s.weight_kg), num(s.reps))),
      0,
    );

    // Margem de 0,1 kg: sem ela, ruído de arredondamento vira "recorde".
    if (melhorHoje.e1rm > melhorAnterior + 0.1) {
      recordes.push(exercise.name);
      assertOk(
        "marcar recorde",
        await supabase.from("workout_sets").update({ is_pr: true }).eq("id", melhorHoje.setId),
      );
    }
  }

  return recordes;
}

/**
 * Descarta um treino aberto.
 *
 * Existe porque abrir a tela cria a sessão. Quem entrou só para conferir a
 * ficha precisa de uma saída que não deixe um treino fantasma no histórico —
 * ainda que sessões sem `ended_at` já não contem em lugar nenhum.
 */
export async function discardWorkout(sessionId: string): Promise<void> {
  assertOk(
    "descartar treino",
    await supabase.from("workout_sessions").delete().eq("id", sessionId),
  );
}

/** Gasto estimado do treino; secundário, então falha vira "sem estimativa". */
async function estimarCalorias(durationSeconds: number): Promise<number | null> {
  try {
    const row = unwrapMaybe(
      "buscar último peso",
      await supabase
        .from("body_weights")
        .select("weight_kg")
        .order("log_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    );
    return row ? strengthTrainingKcal(num(row.weight_kg), durationSeconds) : null;
  } catch {
    return null;
  }
}

/**
 * Depois de editar um treino já salvo: refaz o volume e os recordes a partir
 * das séries corrigidas. Os recordes da sessão são zerados e recalculados — uma
 * carga digitada errado não pode continuar contando como PR.
 */
export async function saveFinishedWorkoutEdits(sessionId: string): Promise<void> {
  const board = await fetchWorkoutBoard(sessionId);
  const volume = sessionVolume(
    board.exercises.flatMap((e) =>
      e.sets.map((s) => ({
        weightKg: s.weightKg,
        reps: s.reps,
        setType: "working" as const,
        completed: s.completed,
      })),
    ),
  );
  assertOk(
    "zerar recordes do treino",
    await supabase.from("workout_sets").update({ is_pr: false }).eq("session_id", sessionId),
  );
  await marcarRecordes(board);
  assertOk(
    "salvar volume do treino",
    await supabase.from("workout_sessions").update({ total_volume_kg: volume }).eq("id", sessionId),
  );
}

/** Move um treino para outro dia, mantendo o horário e a duração. */
export async function moveWorkoutDate(
  sessionId: string,
  startedAt: string,
  endedAt: string | null,
  newDay: string,
): Promise<void> {
  const inicio = new Date(startedAt);
  const [ano, mes, dia] = newDay.split("-").map(Number);
  const novoInicio = new Date(inicio);
  novoInicio.setFullYear(ano!, mes! - 1, dia!);
  const delta = novoInicio.getTime() - inicio.getTime();
  assertOk(
    "mudar a data do treino",
    await supabase
      .from("workout_sessions")
      .update({
        started_at: novoInicio.toISOString(),
        ended_at: endedAt ? new Date(new Date(endedAt).getTime() + delta).toISOString() : null,
      })
      .eq("id", sessionId),
  );
}

/** Melhor série de cada exercício hoje × na sessão anterior em que ele apareceu. */
async function compararComAnterior(board: WorkoutBoard): Promise<ExerciseComparison[]> {
  const ids = board.exercises.map((e) => e.exerciseId);
  if (ids.length === 0) return [];
  try {
    const rows = unwrapList(
      "carregar a última vez de cada exercício",
      await supabase
        .from("workout_sets")
        .select(
          "exercise_id, session_id, weight_kg, reps, workout_sessions!inner(ended_at, deleted_at)",
        )
        .in("exercise_id", ids)
        .neq("session_id", board.sessionId)
        .eq("completed", true)
        .not("workout_sessions.ended_at", "is", null)
        .is("workout_sessions.deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(ids.length * 40),
    );
    // A primeira linha de cada exercício aponta a sessão mais recente dele.
    const sessaoDe = new Map<string, string>();
    const anterior = new Map<string, SimpleSet[]>();
    for (const r of rows) {
      if (!sessaoDe.has(r.exercise_id)) sessaoDe.set(r.exercise_id, r.session_id);
      if (sessaoDe.get(r.exercise_id) !== r.session_id) continue;
      const lista = anterior.get(r.exercise_id) ?? [];
      lista.push({ weightKg: r.weight_kg === null ? null : num(r.weight_kg), reps: r.reps });
      anterior.set(r.exercise_id, lista);
    }
    return compareWithLastSession(
      board.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        name: e.name,
        sets: e.sets.filter((x) => x.completed),
      })),
      anterior,
    );
  } catch {
    // Comparação é enfeite do resumo: falhar aqui não pode falhar o treino.
    return [];
  }
}

/** Janela em que um treino aberto ainda conta como "em andamento". */
const OPEN_SESSION_HOURS = 6;

/**
 * Treino aberto agora, se houver — o que deixa o botão central laranja.
 * Só os iniciados nas últimas horas: uma sessão esquecida aberta ontem não
 * pode prender o app em "treino em andamento".
 */
export async function fetchOpenSessionId(): Promise<string | null> {
  const desde = new Date(Date.now() - OPEN_SESSION_HOURS * 3_600_000).toISOString();
  const row = unwrapMaybe(
    "procurar treino em andamento",
    await supabase
      .from("workout_sessions")
      .select("id")
      .is("ended_at", null)
      .is("deleted_at", null)
      .gte("started_at", desde)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  return row?.id ?? null;
}
