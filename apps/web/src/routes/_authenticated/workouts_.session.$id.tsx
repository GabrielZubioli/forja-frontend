import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Equal,
  Info,
  Minus,
  MoreHorizontal,
  PlayCircle,
  Plus,
  Repeat,
  Sparkles,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import { nextDoubleProgression, platesFor, type ExerciseComparison } from "@forja/domain";
import { queryKeys } from "@/data/query-keys";
import { errorMessage } from "@/data/supabase-helpers";
import {
  addSet,
  discardWorkout,
  fetchWorkoutBoard,
  finishWorkout,
  moveWorkoutDate,
  removeSet,
  saveFinishedWorkoutEdits,
  substituteSessionExercise,
  updateSet,
  type BoardExercise,
  type BoardSet,
  type WorkoutBoard,
} from "@/data/workout-session";
import { videoSearchUrl } from "@/data/exercise-media";
import { SubstituteExerciseDialog } from "@/components/pickers/substitute-exercise-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/date-picker";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmButton } from "@/components/confirm-button";
import { TERMINAR_TREINO_EVENT } from "@/components/train-launch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ErrorState } from "@/components/query-boundary";
import { ExerciseDemo } from "@/components/workouts/exercise-demo-images";
import { ExerciseDetailSheet } from "@/components/workouts/exercise-detail-sheet";
import { RestTimerBar, playRestFinishedSound } from "@/components/workouts/rest-timer";
import { useRestTimer } from "@/hooks/use-rest-timer";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { EQUIPMENT_LABELS, MUSCLE_LABELS, label } from "@/lib/labels";
import { formatDate, formatDuration, toISODate, todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";

/**
 * A execução do treino — um exercício por vez.
 *
 * Em cima, o nome, o tempo e as séries feitas; os números de cada exercício
 * para pular de um a outro. No meio, a demonstração, a última vez, as anilhas
 * e a dica de progressão. Embaixo, a tabela: carga e repetições com − e +, o
 * RIR e o círculo de concluir — que dispara o descanso.
 *
 * ## O cronômetro
 *
 * Corre desde `started_at` — não desde a montagem do componente. Isso é o que
 * faz o tempo sobreviver a fechar o app no meio da série: o relógio é o banco,
 * não a memória do navegador.
 *
 * ## Terminar
 *
 * Pelo ✓ do canto. Com séries pendentes, pede confirmação; sem, encerra direto.
 */
export const Route = createFileRoute("/_authenticated/workouts_/session/$id")({
  head: () => ({
    meta: [
      { title: "Treino em andamento — Habitual Fit" },
      { name: "description", content: "Registre as séries conforme executa." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SessionPage,
});

/** RIR: quantas repetições ainda sobravam. */
const RIR_OPCOES = [
  { valor: 0, texto: "Falha — não sairia mais nenhuma" },
  { valor: 1, texto: "Sobrava 1" },
  { valor: 2, texto: "Sobravam 2" },
  { valor: 3, texto: "Sobravam 3" },
  { valor: 4, texto: "Sobravam 4 ou mais" },
] as const;

function SessionPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const chave = queryKeys.workouts.session(id);

  const [atual, setAtual] = useState(0);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [celebrando, setCelebrando] = useState(false);
  const [recordes, setRecordes] = useState<string[]>([]);
  const [editando, setEditando] = useState(false);
  const descanso = useRestTimer({ onFinish: playRestFinishedSound });

  const board = useQuery({ queryKey: chave, queryFn: () => fetchWorkoutBoard(id) });
  const dados = board.data;
  const terminado = Boolean(dados?.endedAt);
  const somenteLeitura = terminado && !editando;
  useWakeLock(Boolean(dados) && !terminado);

  const invalidar = () => qc.invalidateQueries({ queryKey: chave });

  /** Edição de série com resposta imediata: a tela muda antes do servidor confirmar. */
  const serie = useMutation({
    mutationFn: ({ setId, patch }: { setId: string; patch: Parameters<typeof updateSet>[1] }) =>
      updateSet(setId, patch),
    onMutate: async ({ setId, patch }) => {
      await qc.cancelQueries({ queryKey: chave });
      const anterior = qc.getQueryData<WorkoutBoard>(chave);
      qc.setQueryData<WorkoutBoard>(chave, (b) => (b ? aplicarSerie(b, setId, patch) : b));
      return { anterior };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.anterior) qc.setQueryData(chave, ctx.anterior);
      toast.error(errorMessage(e));
    },
    onSettled: () => void invalidar(),
  });

  const maisSerie = useMutation({
    mutationFn: (exercise: BoardExercise) => addSet(id, exercise),
    onSuccess: () => void invalidar(),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const menosSerie = useMutation({
    mutationFn: (setId: string) => removeSet(setId),
    onSuccess: () => void invalidar(),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const trocar = useMutation({
    mutationFn: ({ de, para }: { de: string; para: string }) =>
      substituteSessionExercise(id, de, para),
    onSuccess: () => {
      toast.success("Exercício substituído", { description: "Suas séries foram mantidas." });
      void invalidar();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const finalizar = useMutation({
    mutationFn: () => finishWorkout(id),
    onSuccess: (resultado) => {
      setRecordes(resultado.personalRecords);
      descanso.stop();
      setCelebrando(true);
      void qc.invalidateQueries({ queryKey: queryKeys.workouts.all });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const descartar = useMutation({
    mutationFn: () => discardWorkout(id),
    onSuccess: () => {
      descanso.stop();
      toast.success("Treino descartado");
      void qc.invalidateQueries({ queryKey: queryKeys.workouts.all });
      void navigate({ to: "/dashboard" });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const salvarEdicao = useMutation({
    mutationFn: () => saveFinishedWorkoutEdits(id),
    onSuccess: () => {
      setEditando(false);
      toast.success("Treino corrigido", { description: "Volume e recordes recalculados." });
      void qc.invalidateQueries({ queryKey: queryKeys.workouts.all });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const mudarData = useMutation({
    mutationFn: (dia: string) =>
      moveWorkoutDate(id, board.data!.startedAt, board.data!.endedAt, dia),
    onSuccess: () => {
      toast.success("Data do treino alterada");
      void qc.invalidateQueries({ queryKey: queryKeys.workouts.all });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const totais = useMemo(() => {
    const sets = dados?.exercises.flatMap((e) => e.sets) ?? [];
    return { feitas: sets.filter((s) => s.completed).length, total: sets.length };
  }, [dados]);

  // O quadradinho do botão central termina o treino: o mesmo fluxo do ✓ do
  // cabeçalho — direto se tudo foi marcado, com confirmação se há pendentes.
  const [confirmarFim, setConfirmarFim] = useState(false);
  const estadoFim = useRef({ terminado, feitas: totais.feitas, total: totais.total });
  estadoFim.current = { terminado, feitas: totais.feitas, total: totais.total };
  const terminarPeloBotao = useRef(() => {});
  terminarPeloBotao.current = () => {
    const { terminado: fim, feitas, total } = estadoFim.current;
    if (fim || finalizar.isPending) return;
    if (feitas === 0) {
      toast("Marque ao menos uma série para terminar", {
        description: "Ou descarte o treino no menu ⋯ do topo.",
      });
      return;
    }
    if (total - feitas > 0) setConfirmarFim(true);
    else finalizar.mutate();
  };
  useEffect(() => {
    const ouvir = () => terminarPeloBotao.current();
    window.addEventListener(TERMINAR_TREINO_EVENT, ouvir);
    return () => window.removeEventListener(TERMINAR_TREINO_EVENT, ouvir);
  }, []);

  // Exercício atual dentro dos limites quando a lista muda (troca, remoção).
  useEffect(() => {
    if (dados && atual >= dados.exercises.length) setAtual(Math.max(0, dados.exercises.length - 1));
  }, [dados, atual]);

  if (board.isPending) return <BoardSkeleton />;
  if (board.isError || !dados) {
    return (
      <div className="p-4 md:p-8">
        <ErrorState message={errorMessage(board.error)} onRetry={board.refetch} />
      </div>
    );
  }

  const exercicio = dados.exercises[atual];
  const pendentes = totais.total - totais.feitas;

  const botaoFinalizar = (
    <span className="grid size-12 place-items-center rounded-full bg-card text-primary">
      <Check className="size-6" strokeWidth={2.5} />
    </span>
  );

  return (
    // Treino em andamento: tela laranja (a cor do botão "treinando"), com os
    // cartões escuros por cima — ver .hf-treino em styles.css.
    <div className={cn(!terminado && "hf-treino -mb-28 min-h-dvh md:mb-0")}>
      <div
        className={cn("mx-auto w-full max-w-3xl px-4 pb-28 md:px-8", !terminado && "hf-treino-in")}
      >
        {/* Cabeçalho: sair, nome e tempo, menu, terminar. */}
        <header className="sticky top-0 z-20 -mx-4 bg-background/95 px-4 pb-3 pt-4 backdrop-blur md:-mx-8 md:px-8">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void navigate({ to: "/dashboard" })}
              aria-label="Sair do treino (continua salvo)"
              className="grid size-12 shrink-0 place-items-center rounded-full bg-card"
            >
              <X className="size-6" />
            </button>
            <div className="min-w-0 flex-1 text-center">
              <p className="truncate text-xl font-extrabold">
                {dados.name.replace(/^[A-Z]\s*—\s*/, "")}
              </p>
              <p className="text-lg tabular-nums text-muted-foreground">
                <Cronometro dados={dados} /> · {totais.feitas}/{totais.total} séries
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Mais opções do treino"
                  className="grid size-12 shrink-0 place-items-center rounded-full bg-card"
                >
                  <MoreHorizontal className="size-6" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {terminado ? (
                  <DropdownMenuItem onSelect={() => setEditando((v) => !v)}>
                    {editando ? "Parar de editar" : "Corrigir cargas e séries"}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onSelect={() => descartar.mutate()}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 size-4" />
                    Descartar treino
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {!terminado &&
              (pendentes === 0 ? (
                <button
                  type="button"
                  onClick={() => finalizar.mutate()}
                  disabled={finalizar.isPending || totais.feitas === 0}
                  aria-label="Terminar treino"
                  className="shrink-0 disabled:opacity-50"
                >
                  {botaoFinalizar}
                </button>
              ) : (
                <ConfirmButton
                  aria-label="Terminar treino"
                  title="Terminar o treino agora?"
                  description={`${pendentes} ${pendentes === 1 ? "série ainda não foi marcada" : "séries ainda não foram marcadas"} e ficarão de fora do registro.`}
                  confirmLabel="Terminar"
                  variant="ghost"
                  className="size-12 shrink-0 rounded-full p-0"
                  disabled={finalizar.isPending || totais.feitas === 0}
                  onConfirm={() => finalizar.mutate()}
                >
                  {botaoFinalizar}
                </ConfirmButton>
              ))}
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-card" aria-hidden>
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${totais.total ? (totais.feitas / totais.total) * 100 : 0}%` }}
            />
          </div>
        </header>

        <AlertDialog open={confirmarFim} onOpenChange={setConfirmarFim}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Terminar o treino agora?</AlertDialogTitle>
              <AlertDialogDescription>
                {pendentes}{" "}
                {pendentes === 1
                  ? "série ainda não foi marcada"
                  : "séries ainda não foram marcadas"}{" "}
                e ficarão de fora do registro.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Continuar treinando</AlertDialogCancel>
              <AlertDialogAction onClick={() => finalizar.mutate()}>Terminar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {terminado && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-2xl bg-card p-3">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Data</span>
              <DatePicker
                className="h-9 w-auto"
                max={todayISO()}
                value={toISODate(new Date(dados.startedAt))}
                disabled={mudarData.isPending}
                onChange={(v) => mudarData.mutate(v)}
                aria-label="Data do treino"
              />
            </div>
            {editando ? (
              <Button
                size="sm"
                className="ml-auto rounded-full"
                onClick={() => salvarEdicao.mutate()}
                disabled={salvarEdicao.isPending}
              >
                <Check className="mr-1.5 size-4" />
                {salvarEdicao.isPending ? "Salvando…" : "Concluir edição"}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                className="ml-auto rounded-full"
                onClick={() => setEditando(true)}
              >
                Corrigir cargas e séries
              </Button>
            )}
          </div>
        )}

        {dados.exercises.length === 0 || !exercicio ? (
          <div className="mt-6 rounded-[1.5rem] bg-card p-6 text-center">
            <p className="text-lg font-semibold">Este treino está sem exercícios</p>
            <p className="mt-1 text-muted-foreground">Adicione exercícios à rotina no Plano.</p>
            <Button className="mt-4 rounded-full" onClick={() => void navigate({ to: "/plan" })}>
              Abrir o Plano
            </Button>
          </div>
        ) : (
          <>
            {/* Um número por exercício: preenchido quando todas as séries estão feitas.
              O respiro (`p-1.5`) é para o anel do exercício atual — a rolagem
              horizontal corta tudo que passa da borda da lista. */}
            <ol
              className="-mx-1.5 mt-1.5 flex gap-2 overflow-x-auto p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              aria-label="Exercícios do treino"
            >
              {dados.exercises.map((e, i) => (
                <li key={`${e.position}-${e.exerciseId}`}>
                  <button
                    type="button"
                    onClick={() => setAtual(i)}
                    aria-label={`${i + 1}. ${e.name}${e.done ? " — feito" : ""}`}
                    aria-current={i === atual ? "step" : undefined}
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold tabular-nums transition-colors",
                      i === atual && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                      e.done
                        ? "bg-primary text-primary-foreground"
                        : i === atual
                          ? "bg-elevated"
                          : "bg-card text-muted-foreground",
                    )}
                  >
                    {e.done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
                  </button>
                </li>
              ))}
            </ol>

            <ExercicioAtual
              key={`${exercicio.position}-${exercicio.exerciseId}`}
              exercicio={exercicio}
              indice={atual}
              total={dados.exercises.length}
              somenteLeitura={somenteLeitura}
              onSerie={(setId, patch) => serie.mutate({ setId, patch })}
              onConcluir={(set, feito) => {
                serie.mutate({
                  setId: set.id,
                  patch: {
                    completed: feito,
                    // Concluir sem ter digitado usa o que estava na tela.
                    ...(feito && set.weightKg === null
                      ? { weight_kg: exercicio.suggestedWeightKg }
                      : {}),
                    ...(feito && set.reps === null ? { reps: exercicio.targetReps } : {}),
                  },
                });
                if (feito && !terminado) descanso.start(set.restSeconds ?? exercicio.restSeconds);
              }}
              onMaisSerie={() => maisSerie.mutate(exercicio)}
              onMenosSerie={(setId) => menosSerie.mutate(setId)}
              onDetalhe={() => setDetalhe(exercicio.exerciseId)}
              onTrocar={(novoId) => trocar.mutateAsync({ de: exercicio.exerciseId, para: novoId })}
            />

            <div className="mt-6 flex gap-3">
              <Button
                variant="secondary"
                className="h-14 flex-1 rounded-2xl text-base"
                onClick={() => setAtual((i) => Math.max(0, i - 1))}
                disabled={atual === 0}
              >
                <ChevronLeft className="mr-1 size-5" />
                Anterior
              </Button>
              <Button
                className="h-14 flex-1 rounded-2xl text-base font-bold"
                onClick={() => setAtual((i) => Math.min(dados.exercises.length - 1, i + 1))}
                disabled={atual >= dados.exercises.length - 1}
              >
                Próximo
                <ChevronRight className="ml-1 size-5" />
              </Button>
            </div>
          </>
        )}

        {!terminado && <RestTimerBar timer={descanso} />}

        {celebrando && (
          <CompletionOverlay
            durationSeconds={finalizar.data?.durationSeconds ?? dados.durationSeconds}
            volumeKg={finalizar.data?.volumeKg ?? dados.totalVolumeKg}
            kcal={finalizar.data?.kcal ?? null}
            comparisons={finalizar.data?.comparisons ?? []}
            records={recordes}
            onClose={() => void navigate({ to: "/stats" })}
          />
        )}

        <ExerciseDetailSheet
          exerciseId={detalhe}
          open={detalhe !== null}
          onOpenChange={(aberto) => !aberto && setDetalhe(null)}
        />
      </div>
    </div>
  );
}

/** Aplica a edição de uma série no cache, recalculando "feito" do exercício. */
function aplicarSerie(
  board: WorkoutBoard,
  setId: string,
  patch: Parameters<typeof updateSet>[1],
): WorkoutBoard {
  const exercises = board.exercises.map((e) => {
    if (!e.sets.some((s) => s.id === setId)) return e;
    const sets = e.sets.map((s) =>
      s.id !== setId
        ? s
        : {
            ...s,
            ...(patch.weight_kg !== undefined ? { weightKg: patch.weight_kg } : {}),
            ...(patch.reps !== undefined ? { reps: patch.reps } : {}),
            ...(patch.completed !== undefined ? { completed: patch.completed } : {}),
            ...(patch.rir !== undefined ? { rir: patch.rir } : {}),
          },
    );
    return { ...e, sets, done: sets.length > 0 && sets.every((s) => s.completed) };
  });
  const feitos = exercises.filter((e) => e.done).length;
  return { ...board, exercises, progress: exercises.length ? feitos / exercises.length : 0 };
}

function Cronometro({ dados }: { dados: WorkoutBoard }) {
  const decorridos = useElapsedSeconds(dados.startedAt, dados.endedAt !== null);
  return <>{formatStopwatch(dados.endedAt ? dados.durationSeconds : decorridos)}</>;
}

/** Passo do − / + de carga: barra e máquina sobem de 2,5; halter de 1. */
function passoDeCarga(equipment: string): number {
  return equipment === "dumbbell" || equipment === "kettlebell" ? 1 : 2.5;
}

function ExercicioAtual({
  exercicio,
  indice,
  total,
  somenteLeitura,
  onSerie,
  onConcluir,
  onMaisSerie,
  onMenosSerie,
  onDetalhe,
  onTrocar,
}: {
  exercicio: BoardExercise;
  indice: number;
  total: number;
  somenteLeitura: boolean;
  onSerie: (setId: string, patch: Parameters<typeof updateSet>[1]) => void;
  onConcluir: (set: BoardSet, feito: boolean) => void;
  onMaisSerie: () => void;
  onMenosSerie: (setId: string) => void;
  onDetalhe: () => void;
  onTrocar: (exerciseId: string) => Promise<unknown>;
}) {
  const passo = passoDeCarga(exercicio.equipment);
  const cargaAtual =
    exercicio.sets.find((s) => !s.completed)?.weightKg ?? exercicio.suggestedWeightKg;
  const ultima = exercicio.lastTime;
  const pt = (n: number) => n.toLocaleString("pt-BR");

  // Dica de progressão (dupla progressão sobre a última vez).
  const minReps = exercicio.repMin ?? exercicio.targetReps ?? 8;
  const maxReps = exercicio.repMax ?? exercicio.targetReps ?? 12;
  const feitasAntes = (ultima?.sets ?? []).filter((s) => s.weightKg !== null && s.reps !== null);
  const sugestao =
    feitasAntes.length > 0
      ? nextDoubleProgression(
          feitasAntes.map((s) => ({ weightKg: s.weightKg!, reps: s.reps! })),
          {
            minReps,
            maxReps: Math.max(minReps, maxReps),
            incrementKg: passo,
            workingSets: Math.min(feitasAntes.length, exercicio.sets.length || 1),
          },
        )
      : null;

  return (
    <article className="mt-4">
      <p className="text-lg text-muted-foreground">
        Exercício {indice + 1} / {total}
      </p>

      <div className="mt-2 overflow-hidden rounded-[1.5rem] bg-white">
        <ExerciseDemo images={exercicio.images} name={exercicio.name} className="aspect-square" />
      </div>

      <div className="mt-5 flex items-start gap-3">
        <h1 className="min-w-0 flex-1 text-balance text-[2rem] font-extrabold leading-tight">
          {exercicio.name}
        </h1>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Opções de ${exercicio.name}`}
              className="grid size-12 shrink-0 place-items-center rounded-full bg-card"
            >
              <MoreHorizontal className="size-6" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{exercicio.name}</DropdownMenuLabel>
            <DropdownMenuItem onSelect={onDetalhe}>
              <Info className="mr-2 size-4" />
              Como executar
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a
                href={exercicio.videoUrl ?? videoSearchUrl(exercicio.name)}
                target="_blank"
                rel="noreferrer noopener"
              >
                <PlayCircle className="mr-2 size-4" />
                Vídeo
              </a>
            </DropdownMenuItem>
            {!somenteLeitura && (
              <>
                <DropdownMenuSeparator />
                <SubstituteExerciseDialog
                  currentExerciseId={exercicio.exerciseId}
                  currentExerciseName={exercicio.name}
                  primaryMuscle={exercicio.primaryMuscle}
                  currentEquipment={exercicio.equipment}
                  onSubstitute={async (alt) => {
                    await onTrocar(alt.id);
                  }}
                  trigger={
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <Repeat className="mr-2 size-4" />
                      Trocar exercício
                    </DropdownMenuItem>
                  }
                />
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Chip>{label(MUSCLE_LABELS, exercicio.primaryMuscle)}</Chip>
        <Chip>{label(EQUIPMENT_LABELS, exercicio.equipment)}</Chip>
        {exercicio.bestKg ? <Chip>Melhor: {pt(exercicio.bestKg)} kg</Chip> : null}
      </div>

      {ultima && ultima.sets.length > 0 && (
        <p className="mt-3 text-lg text-muted-foreground">
          Última vez ({formatDate(ultima.date, "d MMM")}):{" "}
          {ultima.sets
            .map(
              (s) =>
                `${s.weightKg !== null ? `${pt(s.weightKg)}×` : ""}${s.reps ?? "–"}${s.rir !== null ? ` (RIR ${s.rir})` : ""}`,
            )
            .join(", ")}
        </p>
      )}

      {exercicio.equipment === "barbell" && cargaAtual !== null && cargaAtual > 20 && (
        <p className="mt-2 text-lg text-muted-foreground">
          Barra 20 kg · {pt((cargaAtual - 20) / 2)} kg por lado
          {platesFor(cargaAtual).perSide.length > 0 &&
            ` (${platesFor(cargaAtual).perSide.map(pt).join(" + ")})`}
        </p>
      )}

      {sugestao && sugestao.weightKg > 0 && (
        <p
          className={cn(
            "mt-2 flex items-start gap-2 text-lg",
            sugestao.advanced ? "text-primary" : "text-muted-foreground",
          )}
        >
          {sugestao.advanced ? (
            <ArrowUp className="mt-1 size-5 shrink-0" aria-hidden />
          ) : (
            <ArrowRight className="mt-1 size-5 shrink-0" aria-hidden />
          )}
          <span>
            <span className="font-bold">Dupla progressão</span> ·{" "}
            {sugestao.advanced
              ? `Bateu o topo da faixa na última vez — ${pt(sugestao.weightKg)} kg agora.`
              : `Mantenha ${pt(sugestao.weightKg)} kg e busque ${sugestao.targetReps} repetições.`}
          </span>
        </p>
      )}

      {exercicio.notes && (
        <p className="mt-2 flex items-start gap-2 text-muted-foreground">
          <Sparkles className="mt-1 size-4 shrink-0" aria-hidden />
          {exercicio.notes}
        </p>
      )}

      {/* A tabela de séries. */}
      <div className="mt-5 rounded-[1.5rem] bg-card p-4">
        <div className="mb-3 grid grid-cols-[1.75rem_1.5fr_1fr_3rem_2.75rem] items-center gap-1.5 text-center text-xs uppercase tracking-wide text-muted-foreground">
          <span />
          <span>Carga (kg)</span>
          <span>Reps</span>
          <span>RIR</span>
          <span />
        </div>
        <ul className="space-y-2.5">
          {exercicio.sets.map((set) => (
            <li
              key={set.id}
              className="grid grid-cols-[1.75rem_1.5fr_1fr_3rem_2.75rem] items-center gap-1.5"
            >
              <span className="grid size-7 place-items-center rounded-full bg-elevated text-sm tabular-nums text-muted-foreground">
                {set.setIndex}
              </span>
              <Passo
                valor={set.weightKg ?? exercicio.suggestedWeightKg}
                passo={passo}
                rotulo={`Carga da série ${set.setIndex}`}
                desabilitado={somenteLeitura}
                onChange={(v) => onSerie(set.id, { weight_kg: v })}
              />
              <Passo
                valor={set.reps ?? exercicio.targetReps}
                passo={1}
                inteiro
                rotulo={`Repetições da série ${set.setIndex}`}
                desabilitado={somenteLeitura}
                onChange={(v) => onSerie(set.id, { reps: v })}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild disabled={somenteLeitura}>
                  <button
                    type="button"
                    aria-label={`RIR da série ${set.setIndex}${set.rir !== null ? `: ${set.rir}` : ""}`}
                    className={cn(
                      "h-12 rounded-xl bg-elevated text-base tabular-nums",
                      set.rir === null ? "text-muted-foreground" : "font-bold text-foreground",
                    )}
                  >
                    {set.rir === null ? "RIR" : set.rir >= 4 ? "4+" : set.rir}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Repetições sobrando</DropdownMenuLabel>
                  {RIR_OPCOES.map((o) => (
                    <DropdownMenuItem
                      key={o.valor}
                      onSelect={() => onSerie(set.id, { rir: o.valor })}
                    >
                      <span className="mr-2 w-6 font-bold tabular-nums">
                        {o.valor === 4 ? "4+" : o.valor}
                      </span>
                      {o.texto}
                    </DropdownMenuItem>
                  ))}
                  {set.rir !== null && (
                    <DropdownMenuItem onSelect={() => onSerie(set.id, { rir: null })}>
                      Limpar
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <button
                type="button"
                onClick={() => onConcluir(set, !set.completed)}
                disabled={somenteLeitura}
                aria-pressed={set.completed}
                aria-label={`${set.completed ? "Desmarcar" : "Concluir"} a série ${set.setIndex}`}
                className={cn(
                  "grid size-11 place-items-center rounded-full border-2 transition-colors",
                  set.completed
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted-foreground/50",
                )}
              >
                {set.completed && <Check className="size-6" strokeWidth={3} />}
              </button>
            </li>
          ))}
        </ul>
        {!somenteLeitura && (
          <div className="mt-3 flex gap-2">
            <Button variant="ghost" className="flex-1 text-primary" onClick={onMaisSerie}>
              <Plus className="mr-1.5 size-4" aria-hidden />
              Série
            </Button>
            {exercicio.sets.length > 1 && (
              <Button
                variant="ghost"
                className="flex-1 text-muted-foreground"
                onClick={() => onMenosSerie(exercicio.sets.at(-1)!.id)}
              >
                <Minus className="mr-1.5 size-4" aria-hidden />
                Série
              </Button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-lg bg-elevated px-3 py-1.5 text-base text-muted-foreground">
      {children}
    </span>
  );
}

/** − valor + : o número também é editável direto. */
function Passo({
  valor,
  passo,
  inteiro = false,
  rotulo,
  desabilitado,
  onChange,
}: {
  valor: number | null;
  passo: number;
  inteiro?: boolean;
  rotulo: string;
  desabilitado: boolean;
  onChange: (v: number | null) => void;
}) {
  const [rascunho, setRascunho] = useState(valor === null ? "" : String(valor));
  useEffect(() => setRascunho(valor === null ? "" : String(valor)), [valor]);

  const ajustar = (delta: number) => {
    const base = valor ?? 0;
    const novo = Math.max(0, Math.round((base + delta) * 100) / 100);
    onChange(inteiro ? Math.round(novo) : novo);
  };

  return (
    <div className="flex h-12 items-center rounded-xl bg-elevated">
      <button
        type="button"
        onClick={() => ajustar(-passo)}
        disabled={desabilitado || !valor}
        aria-label={`Diminuir ${rotulo.toLowerCase()}`}
        className="grid h-full w-7 shrink-0 place-items-center disabled:opacity-30"
      >
        <Minus className="size-4" />
      </button>
      <label className="min-w-0 flex-1">
        <span className="sr-only">{rotulo}</span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={passo}
          disabled={desabilitado}
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          onBlur={() => {
            const t = rascunho.trim().replace(",", ".");
            const n = t === "" ? null : Number(t);
            if (n !== null && (!Number.isFinite(n) || n < 0)) {
              setRascunho(valor === null ? "" : String(valor));
              return;
            }
            if (n !== valor) onChange(n === null ? null : inteiro ? Math.round(n) : n);
          }}
          className="w-full min-w-0 bg-transparent text-center text-base font-semibold tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
      </label>
      <button
        type="button"
        onClick={() => ajustar(passo)}
        disabled={desabilitado}
        aria-label={`Aumentar ${rotulo.toLowerCase()}`}
        className="grid h-full w-7 shrink-0 place-items-center disabled:opacity-30"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-5 md:px-8">
      <Skeleton className="mb-4 h-14 w-full rounded-2xl" />
      <Skeleton className="mb-4 aspect-square w-full rounded-[1.5rem]" />
      <Skeleton className="mb-3 h-9 w-2/3" />
      <Skeleton className="h-48 w-full rounded-[1.5rem]" />
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

/**
 * A comemoração.
 *
 * Dura o tempo de ser lida e sai do caminho. Um treino concluído é o momento em
 * que o app tem algo a celebrar — e é barato reconhecer isso.
 */
function CompletionOverlay({
  durationSeconds,
  volumeKg,
  kcal,
  comparisons,
  records,
  onClose,
}: {
  durationSeconds: number;
  volumeKg: number;
  kcal: number | null;
  comparisons: ExerciseComparison[];
  records: string[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-background/90 p-6 backdrop-blur-sm"
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
          {kcal !== null && (
            <div className="col-span-2 rounded-2xl bg-muted/60 p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Gasto estimado
              </p>
              <p className="mt-1 text-xl font-bold tabular-nums">~{kcal} kcal</p>
            </div>
          )}
        </div>

        <ComparisonList comparisons={comparisons} />

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

const TREND = {
  up: { icon: ArrowUp, text: "subiu", className: "text-success" },
  same: { icon: Equal, text: "igual", className: "text-muted-foreground" },
  down: { icon: ArrowDown, text: "caiu", className: "text-muted-foreground" },
  new: { icon: Sparkles, text: "primeira vez", className: "text-primary" },
} as const;

/** Hoje × última vez, por exercício. Queda não é vermelha: dia ruim faz parte. */
function ComparisonList({ comparisons }: { comparisons: ExerciseComparison[] }) {
  const comMelhor = comparisons.filter((c) => c.best);
  if (comMelhor.length === 0) return null;
  const serie = (s: ExerciseComparison["best"]) =>
    s
      ? s.weightKg
        ? `${s.weightKg.toLocaleString("pt-BR")} kg × ${s.reps}`
        : `${s.reps} reps`
      : "—";
  return (
    <div className="mt-4 rounded-2xl bg-muted/60 p-4 text-left">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        Comparado à última vez
      </p>
      <ul className="mt-2 space-y-1.5">
        {comMelhor.map((c) => {
          const t = TREND[c.trend];
          return (
            <li key={c.exerciseId} className="flex items-center gap-2 text-sm">
              <t.icon className={cn("size-4 shrink-0", t.className)} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {serie(c.best)}
                <span className="sr-only"> — {t.text}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
