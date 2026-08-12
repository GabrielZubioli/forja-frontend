import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Info,
  PlayCircle,
  Timer,
  Trash2,
  Trophy,
} from "lucide-react";
import { queryKeys } from "@/data/query-keys";
import { errorMessage } from "@/data/supabase-helpers";
import {
  discardWorkout,
  fetchWorkoutBoard,
  finishWorkout,
  setExerciseDone,
  substituteSessionExercise,
  updateSet,
  type BoardExercise,
  type WorkoutBoard,
} from "@/data/workout-session";
import { videoSearchUrl } from "@/data/exercise-media";
import { SubstituteExerciseDialog } from "@/components/pickers/substitute-exercise-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmButton } from "@/components/confirm-button";
import { ErrorState } from "@/components/query-boundary";
import { ExerciseDemo } from "@/components/workouts/exercise-demo-images";
import { ExerciseDetailSheet } from "@/components/workouts/exercise-detail-sheet";
import { EQUIPMENT_LABELS, MUSCLE_LABELS, label } from "@/lib/labels";
import { formatDuration } from "@/lib/date";
import { cn } from "@/lib/utils";

/**
 * A execução do treino.
 *
 * ## O fluxo, inteiro
 *
 * Entrou → viu os exercícios → executou → marcou → acabou. Sem botão de
 * "iniciar" (abrir a tela já é iniciar), sem botão de "finalizar" (marcar o
 * último exercício já é finalizar), sem planilha.
 *
 * ## O cronômetro
 *
 * Corre desde `started_at` — não desde a montagem do componente. Isso é o que
 * faz o tempo sobreviver a fechar o app no meio da série: o relógio é o banco,
 * não a memória do navegador.
 *
 * ## Por que marcar o exercício, e não a série
 *
 * Porque é a unidade em que a pessoa pensa ("já fiz o supino"). As séries
 * continuam existindo embaixo, para quem quiser registrar carga real — e é o
 * que mantém volume, progressão e recorde funcionando. Quem não abrir esse
 * detalhe ainda produz dado utilizável, porque marcar preenche as séries com a
 * carga da última vez.
 */
export const Route = createFileRoute("/_authenticated/workouts_/session/$id")({
  head: () => ({
    meta: [
      { title: "Treino em andamento — Forja" },
      { name: "description", content: "Marque os exercícios conforme executa." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SessionPage,
});

function SessionPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [celebrando, setCelebrando] = useState(false);
  const [recordes, setRecordes] = useState<string[]>([]);

  const board = useQuery({
    queryKey: queryKeys.workouts.session(id),
    queryFn: () => fetchWorkoutBoard(id),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.workouts.session(id) });

  const finalizar = useMutation({
    mutationFn: () => finishWorkout(id),
    onSuccess: (resultado) => {
      setRecordes(resultado.personalRecords);
      setCelebrando(true);
      // Progresso semanal, mensal, histórico e estatísticas leem de
      // `workout_sessions`: invalidar a raiz atualiza as quatro coisas de uma
      // vez, sem a tela precisar saber quais são.
      void qc.invalidateQueries({ queryKey: queryKeys.workouts.all });
      void invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const marcar = useMutation({
    mutationFn: ({ exercise, done }: { exercise: BoardExercise; done: boolean }) =>
      setExerciseDone(exercise, done),
    onMutate: async ({ exercise, done }) => {
      await qc.cancelQueries({ queryKey: queryKeys.workouts.session(id) });
      const anterior = qc.getQueryData<WorkoutBoard>(queryKeys.workouts.session(id));

      // Otimista: marcar é a ação repetida da tela, e meio segundo de espera
      // entre a série e o registro é o suficiente para a pessoa parar de
      // registrar.
      qc.setQueryData<WorkoutBoard>(queryKeys.workouts.session(id), (atual) =>
        atual ? aplicarMarcacao(atual, exercise.exerciseId, done) : atual,
      );

      return { anterior };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.anterior) qc.setQueryData(queryKeys.workouts.session(id), ctx.anterior);
      toast.error(errorMessage(e));
    },
    onSettled: () => void invalidate(),
  });

  const trocar = useMutation({
    mutationFn: ({ de, para }: { de: string; para: string }) =>
      substituteSessionExercise(id, de, para),
    onSuccess: () => {
      toast.success("Exercício substituído", { description: "Suas séries foram mantidas." });
      void invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const descartar = useMutation({
    mutationFn: () => discardWorkout(id),
    onSuccess: () => {
      toast.success("Treino descartado");
      void qc.invalidateQueries({ queryKey: queryKeys.workouts.all });
      void navigate({ to: "/workouts" });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const dados = board.data;
  const terminado = Boolean(dados?.endedAt);
  const tudoFeito = Boolean(
    dados && dados.exercises.length > 0 && dados.exercises.every((e) => e.done),
  );

  /**
   * Conclusão automática.
   *
   * A trava por `useRef` existe porque o efeito reage ao estado do cache, que
   * muda várias vezes durante a marcação otimista — sem ela, o último clique
   * dispararia duas ou três finalizações concorrentes.
   */
  const finalizando = useRef(false);
  // A dependência é `finalizar.mutate` (estável entre renderizações), e não o
  // objeto da mutação, que é recriado a cada render e faria o efeito rodar sem
  // necessidade dezenas de vezes durante a marcação.
  const finalizarMutate = finalizar.mutate;
  useEffect(() => {
    if (!tudoFeito || terminado || finalizando.current) return;
    finalizando.current = true;
    finalizarMutate();
  }, [tudoFeito, terminado, finalizarMutate]);

  if (board.isPending) return <BoardSkeleton />;
  if (board.isError || !dados) {
    return (
      <div className="p-4 md:p-8">
        <ErrorState message={errorMessage(board.error)} onRetry={board.refetch} />
      </div>
    );
  }

  const concluidos = dados.exercises.filter((e) => e.done).length;

  return (
    <div className="pb-24">
      <TopBar
        name={dados.name}
        startedAt={dados.startedAt}
        endedAt={dados.endedAt}
        durationSeconds={dados.durationSeconds}
      />

      <div className="mx-auto w-full max-w-3xl px-4 md:px-8">
        <div className="mb-5">
          <div className="mb-1.5 flex items-baseline justify-between text-sm">
            <span className="font-medium">
              {concluidos} de {dados.exercises.length}{" "}
              {dados.exercises.length === 1 ? "exercício" : "exercícios"}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {Math.round(dados.progress * 100)}%
            </span>
          </div>
          <Progress value={dados.progress * 100} aria-label="Progresso do treino" />
        </div>

        {dados.exercises.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center">
              <p className="font-semibold">Este treino está sem exercícios</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Volte para a divisão e adicione os exercícios que você quer fazer.
              </p>
              <Button asChild className="mt-4">
                <Link to="/workouts">Ver a divisão</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {dados.exercises.map((exercise, i) => (
              <ExerciseCard
                key={exercise.exerciseId}
                exercise={exercise}
                index={i}
                readOnly={terminado}
                onToggle={(done) => marcar.mutate({ exercise, done })}
                onOpenDetail={() => setDetalhe(exercise.exerciseId)}
                onSubstitute={(novoId) =>
                  trocar.mutateAsync({ de: exercise.exerciseId, para: novoId })
                }
                onChanged={invalidate}
              />
            ))}
          </ul>
        )}

        {!terminado && dados.exercises.length > 0 && (
          <div className="mt-6 space-y-2">
            <Button
              size="lg"
              variant="outline"
              className="h-12 w-full rounded-xl"
              onClick={() => finalizar.mutate()}
              disabled={finalizar.isPending || concluidos === 0}
            >
              <Check className="mr-1.5 size-5" />
              Encerrar treino agora
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Ao marcar o último exercício, o treino é salvo sozinho.
            </p>

            <ConfirmButton
              title="Descartar este treino?"
              description="Nada do que você marcou aqui será salvo. Seu histórico anterior continua intacto."
              confirmLabel="Descartar"
              onConfirm={() => descartar.mutate()}
              aria-label="Descartar treino"
              size="sm"
              className="w-full text-muted-foreground"
            >
              <Trash2 className="mr-1.5 size-4" />
              Descartar
            </ConfirmButton>
          </div>
        )}
      </div>

      {celebrando && (
        <CompletionOverlay
          durationSeconds={finalizar.data?.durationSeconds ?? dados.durationSeconds}
          volumeKg={finalizar.data?.volumeKg ?? dados.totalVolumeKg}
          records={recordes}
          onClose={() => void navigate({ to: "/workouts" })}
        />
      )}

      <ExerciseDetailSheet
        exerciseId={detalhe}
        open={detalhe !== null}
        onOpenChange={(aberto) => !aberto && setDetalhe(null)}
      />
    </div>
  );
}

/** Aplica a marcação no cache, para a UI responder antes do banco. */
function aplicarMarcacao(board: WorkoutBoard, exerciseId: string, done: boolean): WorkoutBoard {
  const exercises = board.exercises.map((e) =>
    e.exerciseId === exerciseId
      ? {
          ...e,
          done,
          sets: e.sets.map((s) => ({
            ...s,
            completed: done,
            weightKg: done ? (s.weightKg ?? e.suggestedWeightKg) : s.weightKg,
            reps: done ? (s.reps ?? e.targetReps) : s.reps,
          })),
        }
      : e,
  );

  const feitos = exercises.filter((e) => e.done).length;
  return { ...board, exercises, progress: exercises.length ? feitos / exercises.length : 0 };
}

/**
 * O cabeçalho com o cronômetro.
 *
 * Fica colado no topo porque é a única informação que a pessoa consulta de
 * relance, com o celular apoiado no banco.
 */
function TopBar({
  name,
  startedAt,
  endedAt,
  durationSeconds,
}: {
  name: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
}) {
  const decorridos = useElapsedSeconds(startedAt, endedAt !== null);

  return (
    <div className="sticky top-0 z-20 mb-5 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3 md:px-8">
        <Button asChild variant="ghost" size="icon" className="shrink-0" aria-label="Voltar">
          <Link to="/workouts">
            <ArrowLeft className="size-5" />
          </Link>
        </Button>

        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-tight">{name}</p>
          <p className="text-xs text-muted-foreground">
            {endedAt ? "Treino concluído" : "Em andamento"}
          </p>
        </div>

        <div
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 tabular-nums",
            endedAt ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
          )}
          role="timer"
          aria-live="off"
          aria-label="Tempo de treino"
        >
          <Timer className="size-4" aria-hidden />
          <span className="text-base font-bold">
            {formatStopwatch(endedAt ? durationSeconds : decorridos)}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Segundos desde o início, contados de verdade.
 *
 * Baseia-se no horário de início gravado no banco em vez de acumular um
 * contador local: um contador local para de contar quando o navegador
 * descarrega a aba em segundo plano — que é o estado normal de um celular no
 * bolso entre uma série e outra.
 */
function useElapsedSeconds(startedAt: string, parado: boolean): number {
  const inicio = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    if (parado) return;
    const timer = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [parado]);

  return Math.max(0, Math.floor((agora - inicio) / 1000));
}

/** `01:23:45` acima de uma hora, `23:45` abaixo. */
function formatStopwatch(totalSeconds: number): string {
  const total = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function ExerciseCard({
  exercise,
  index,
  readOnly,
  onToggle,
  onOpenDetail,
  onSubstitute,
  onChanged,
}: {
  exercise: BoardExercise;
  index: number;
  readOnly: boolean;
  onToggle: (done: boolean) => void;
  onOpenDetail: () => void;
  onSubstitute: (exerciseId: string) => Promise<unknown>;
  onChanged: () => void | Promise<unknown>;
}) {
  const [aberto, setAberto] = useState(false);

  const seriesFeitas = exercise.sets.filter((s) => s.completed).length;

  return (
    <li>
      <Card
        className={cn(
          "overflow-hidden transition-colors",
          exercise.done && "border-primary/30 bg-primary/[0.04]",
        )}
      >
        <CardContent className="p-3">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onOpenDetail}
              className="w-24 shrink-0 sm:w-28"
              aria-label={`Ver execução de ${exercise.name}`}
            >
              <ExerciseDemo images={exercise.images} name={exercise.name} autoPlay={false} />
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-balance font-semibold leading-snug",
                      exercise.done && "text-muted-foreground line-through",
                    )}
                  >
                    <span className="mr-1.5 text-muted-foreground">{index + 1}.</span>
                    {exercise.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {label(MUSCLE_LABELS, exercise.primaryMuscle)} ·{" "}
                    {label(EQUIPMENT_LABELS, exercise.equipment)}
                    {exercise.supersetGroup !== null && " · em supersérie"}
                  </p>
                </div>

                {/* A caixa de conclusão: grande, à direita, no polegar. */}
                <label
                  className={cn(
                    "flex shrink-0 cursor-pointer flex-col items-center gap-1 rounded-xl px-2 py-1",
                    readOnly && "pointer-events-none opacity-70",
                  )}
                >
                  <Checkbox
                    checked={exercise.done}
                    disabled={readOnly}
                    onCheckedChange={(v) => onToggle(v === true)}
                    className="size-6"
                    aria-label={`Marcar ${exercise.name} como concluído`}
                  />
                  <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {exercise.done ? "feito" : "marcar"}
                  </span>
                </label>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" className="tabular-nums font-normal">
                  {exercise.sets.length} × {exercise.targetReps ?? 10}
                </Badge>
                {exercise.suggestedWeightKg !== null && (
                  <Badge variant="outline" className="tabular-nums font-normal">
                    Carga sugerida {exercise.suggestedWeightKg} kg
                  </Badge>
                )}
                <Badge variant="outline" className="tabular-nums font-normal">
                  {exercise.restSeconds}s descanso
                </Badge>
                {!exercise.done && seriesFeitas > 0 && (
                  <Badge variant="outline" className="font-normal">
                    {seriesFeitas} de {exercise.sets.length} séries
                  </Badge>
                )}
              </div>

              {exercise.notes && (
                <p className="mt-2 text-pretty text-xs leading-relaxed text-muted-foreground">
                  {exercise.notes}
                </p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-1">
                <Button size="sm" variant="ghost" className="h-8 px-2" onClick={onOpenDetail}>
                  <Info className="mr-1 size-3.5" />
                  Ver execução
                </Button>

                <Button asChild size="sm" variant="ghost" className="h-8 px-2">
                  <a
                    href={exercise.videoUrl ?? videoSearchUrl(exercise.name)}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <PlayCircle className="mr-1 size-3.5" />
                    Vídeo
                  </a>
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2"
                  onClick={() => setAberto((v) => !v)}
                  aria-expanded={aberto}
                >
                  <ChevronDown
                    className={cn("mr-1 size-3.5 transition-transform", aberto && "rotate-180")}
                  />
                  {aberto ? "Ocultar séries" : "Registrar carga"}
                </Button>

                {/* Trocar durante o treino, não só na ficha: o aparelho ocupado
                    e a dor no ombro acontecem no meio da série, e a alternativa
                    era pular o exercício. A troca preserva o que já foi
                    registrado. */}
                {!readOnly && (
                  <SubstituteExerciseDialog
                    currentExerciseId={exercise.exerciseId}
                    currentExerciseName={exercise.name}
                    primaryMuscle={exercise.primaryMuscle}
                    currentEquipment={exercise.equipment}
                    onSubstitute={async (alternativa) => {
                      await onSubstitute(alternativa.id);
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {aberto && <SetList exercise={exercise} readOnly={readOnly} onChanged={onChanged} />}
        </CardContent>
      </Card>
    </li>
  );
}

/**
 * As séries, para quem quer registrar a carga real.
 *
 * Fica fechado por padrão. Quem só quer treinar marca o exercício e segue; quem
 * acompanha progressão abre e digita. As duas pessoas usam a mesma tela sem uma
 * atrapalhar a outra.
 */
function SetList({
  exercise,
  readOnly,
  onChanged,
}: {
  exercise: BoardExercise;
  readOnly: boolean;
  onChanged: () => void | Promise<unknown>;
}) {
  const salvar = useMutation({
    mutationFn: ({ setId, patch }: { setId: string; patch: Parameters<typeof updateSet>[1] }) =>
      updateSet(setId, patch),
    onSuccess: () => void onChanged(),
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="mt-3 border-t border-border pt-3">
      <ul className="space-y-2">
        {exercise.sets.map((set) => (
          <li key={set.id} className="flex items-center gap-2">
            <span className="w-10 shrink-0 text-xs font-medium text-muted-foreground">
              {set.setIndex}ª
            </span>

            <NumberField
              suffix="kg"
              value={set.weightKg ?? exercise.suggestedWeightKg}
              disabled={readOnly}
              onCommit={(v) => salvar.mutate({ setId: set.id, patch: { weight_kg: v } })}
              ariaLabel={`Carga da ${set.setIndex}ª série de ${exercise.name}`}
            />
            <NumberField
              suffix="reps"
              value={set.reps ?? exercise.targetReps}
              disabled={readOnly}
              onCommit={(v) => salvar.mutate({ setId: set.id, patch: { reps: v } })}
              ariaLabel={`Repetições da ${set.setIndex}ª série de ${exercise.name}`}
            />

            <Checkbox
              checked={set.completed}
              disabled={readOnly}
              onCheckedChange={(v) =>
                salvar.mutate({ setId: set.id, patch: { completed: v === true } })
              }
              aria-label={`Concluir a ${set.setIndex}ª série`}
              className="ml-auto size-5 shrink-0"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function NumberField({
  value,
  suffix,
  disabled,
  onCommit,
  ariaLabel,
}: {
  value: number | null;
  suffix: string;
  disabled: boolean;
  onCommit: (value: number | null) => void;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));

  // O valor do servidor volta a mandar quando muda por fora (marcar o exercício
  // preenche as séries). Sem isto, o campo continuaria mostrando o rascunho
  // vazio depois de o banco ter gravado a carga sugerida.
  useEffect(() => {
    setDraft(value === null ? "" : String(value));
  }, [value]);

  return (
    <label className="relative flex-1">
      <span className="sr-only">{ariaLabel}</span>
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        step="0.5"
        disabled={disabled}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = draft.trim() === "" ? null : Number(draft);
          if (n !== null && !Number.isFinite(n))
            return setDraft(value === null ? "" : String(value));
          if (n !== value) onCommit(n);
        }}
        className="h-10 pr-10 tabular-nums"
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
        {suffix}
      </span>
    </label>
  );
}

/**
 * A comemoração.
 *
 * Dura o tempo de ser lida e sai do caminho. Um treino concluído é o momento em
 * que o app tem algo a celebrar — e é barato reconhecer isso.
 */
function CompletionOverlay({
  durationSeconds,
  volumeKg,
  records,
  onClose,
}: {
  durationSeconds: number;
  volumeKg: number;
  records: string[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/90 p-6 backdrop-blur-sm"
      role="alertdialog"
      aria-labelledby="treino-concluido"
    >
      <div className="w-full max-w-sm text-center">
        <span
          className="mx-auto grid size-24 animate-in place-items-center rounded-full bg-primary text-primary-foreground zoom-in-50 duration-500"
          aria-hidden
        >
          <Check className="size-12" strokeWidth={3} />
        </span>

        <h2 id="treino-concluido" className="mt-6 text-2xl font-bold tracking-tight">
          Treino concluído!
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">Treino salvo com sucesso.</p>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-muted/60 p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Tempo</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{formatDuration(durationSeconds)}</p>
          </div>
          <div className="rounded-2xl bg-muted/60 p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Volume</p>
            <p className="mt-1 text-xl font-bold tabular-nums">
              {Math.round(volumeKg).toLocaleString("pt-BR")} kg
            </p>
          </div>
        </div>

        {records.length > 0 && (
          <div className="mt-4 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-left">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Trophy className="size-4 shrink-0 text-primary" aria-hidden />
              {records.length === 1 ? "Novo recorde pessoal" : "Novos recordes pessoais"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{records.join(", ")}</p>
          </div>
        )}

        <Button
          size="lg"
          className="mt-6 h-14 w-full rounded-2xl text-base font-semibold"
          onClick={onClose}
        >
          Ver meu progresso
        </Button>
      </div>
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-5 md:px-8">
      <Skeleton className="mb-5 h-14 w-full rounded-xl" />
      <Skeleton className="mb-5 h-2 w-full rounded-full" />
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
