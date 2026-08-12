import { supabase } from "@/integrations/supabase/client";
import { assertOk, num, unwrap, unwrapList, unwrapMaybe } from "@/data/supabase-helpers";
import { advanceRoutineForTemplate } from "@/data/routines";
import { startSessionFromTemplate } from "@/data/workouts";
import { exerciseImages } from "@/data/exercise-media";
import { epley1RM, sessionVolume } from "@forja/domain";

/**
 * A sessão de treino como o usuário a executa.
 *
 * ## A mudança de modelo
 *
 * Antes, treinar era: apertar "Iniciar treino", cair numa planilha de séries e
 * preencher peso e repetições linha a linha. Preciso, e errado para o momento —
 * ninguém quer operar uma planilha entre uma série de agachamento e outra.
 *
 * Agora o treino é uma **lista de exercícios com caixinhas**. Abriu, o
 * cronômetro corre; fez o exercício, marca; marcou todos, acabou. O registro
 * detalhado (carga por série) continua existindo para quem quiser — mas
 * embaixo, expandido sob demanda, e nunca no caminho de quem só quer treinar.
 *
 * ## O que "marcar um exercício" grava
 *
 * Todas as séries daquele exercício viram `completed = true`, preenchidas com a
 * carga sugerida quando o usuário não digitou nada. É o que mantém volume,
 * recorde pessoal e estatísticas funcionando sem exigir digitação: quem quer
 * precisão ajusta os números; quem não quer ainda produz dado utilizável.
 */

export interface BoardSet {
  id: string;
  setIndex: number;
  weightKg: number | null;
  reps: number | null;
  completed: boolean;
  restSeconds: number | null;
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
        "id, exercise_id, position, set_index, weight_kg, reps, rest_seconds, completed, superset_group, notes, exercises(name, primary_muscle, secondary_muscles, equipment, image_urls, video_url)",
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

  const ultimas = await fetchPreviousLoads(sessionId, [...new Set(rows.map((r) => r.exercise_id))]);

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
        suggestedWeightKg: ultimas.get(row.exercise_id) ?? null,
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
        restSeconds: num(i.rest_seconds, 90),
        notes: i.notes,
      },
    ]),
  );
}

/**
 * A carga da última vez, ignorando a sessão atual.
 *
 * Ignorar a sessão atual importa: sem isso, a sugestão passaria a ser o que a
 * pessoa acabou de digitar hoje, e o campo "última vez" viraria um espelho.
 */
async function fetchPreviousLoads(
  sessionId: string,
  exerciseIds: readonly string[],
): Promise<Map<string, number>> {
  const resultado = new Map<string, number>();
  if (exerciseIds.length === 0) return resultado;

  const rows = unwrapList(
    "carregar cargas anteriores",
    await supabase
      .from("workout_sets")
      .select("exercise_id, weight_kg, created_at, workout_sessions!inner(ended_at)")
      .in("exercise_id", exerciseIds as string[])
      .neq("session_id", sessionId)
      .eq("completed", true)
      .not("weight_kg", "is", null)
      .order("created_at", { ascending: false })
      .limit(exerciseIds.length * 20),
  );

  for (const row of rows) {
    if (resultado.has(row.exercise_id)) continue;
    resultado.set(row.exercise_id, num(row.weight_kg));
  }
  return resultado;
}

/**
 * Marca (ou desmarca) um exercício inteiro.
 *
 * Ao concluir, as séries sem número recebem a carga sugerida e as repetições
 * prescritas. É a diferença entre um registro que alimenta volume, progressão e
 * recorde — e um monte de linhas com `NULL` que não sustentam nenhuma
 * estatística.
 */
export async function setExerciseDone(exercise: BoardExercise, done: boolean): Promise<void> {
  const ids = exercise.sets.map((s) => s.id);
  if (ids.length === 0) return;

  if (!done) {
    assertOk(
      "desmarcar exercício",
      await supabase.from("workout_sets").update({ completed: false }).in("id", ids),
    );
    return;
  }

  const semNumeros = exercise.sets.filter((s) => s.weightKg === null || s.reps === null);

  // Duas escritas em vez de uma por série: a maioria das séries já tem número
  // e só precisa do `completed`.
  const completas = exercise.sets.filter((s) => !semNumeros.includes(s));
  if (completas.length > 0) {
    assertOk(
      "concluir exercício",
      await supabase
        .from("workout_sets")
        .update({ completed: true })
        .in(
          "id",
          completas.map((s) => s.id),
        ),
    );
  }

  for (const set of semNumeros) {
    assertOk(
      "concluir série",
      await supabase
        .from("workout_sets")
        .update({
          completed: true,
          weight_kg: set.weightKg ?? exercise.suggestedWeightKg,
          reps: set.reps ?? exercise.targetReps ?? 10,
        })
        .eq("id", set.id),
    );
  }
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
  patch: { weight_kg?: number | null; reps?: number | null; completed?: boolean },
): Promise<void> {
  assertOk("salvar série", await supabase.from("workout_sets").update(patch).eq("id", setId));
}

export interface FinishResult {
  durationSeconds: number;
  volumeKg: number;
  personalRecords: string[];
}

/**
 * Encerra o treino: grava duração, volume, recordes e avança a divisão.
 *
 * Chamado **automaticamente** quando o último exercício é marcado. O usuário não
 * deveria precisar apertar "finalizar" para dizer ao app o que o app já sabe.
 */
export async function finishWorkout(sessionId: string): Promise<FinishResult> {
  const board = await fetchWorkoutBoard(sessionId);

  if (board.endedAt) {
    return {
      durationSeconds: board.durationSeconds,
      volumeKg: board.totalVolumeKg,
      personalRecords: [],
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

  return { durationSeconds: duration, volumeKg: volume, personalRecords };
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
