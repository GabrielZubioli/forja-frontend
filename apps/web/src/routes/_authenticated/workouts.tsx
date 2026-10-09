import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Copy,
  GripVertical,
  Info,
  MoreVertical,
  Play,
  Plus,
  Repeat,
  Timer,
  Trash2,
  Trophy,
} from "lucide-react";
import { queryKeys } from "@/data/query-keys";
import { errorMessage } from "@/data/supabase-helpers";
import {
  addTemplateItem,
  duplicateTemplateItem,
  fetchWorkoutWeek,
  removeTemplateItem,
  swapTemplateExercise,
  updateTemplateItem,
  type WeekExercise,
  type WeekSplit,
} from "@/data/workout-week";
import { ensureActiveRoutine, fetchCompletedWorkouts } from "@/data/routines";
import { fetchPersonalRecords } from "@/data/workouts";
import { openWorkoutForTemplate } from "@/data/workout-session";
import { useCurrentUserId } from "@/hooks/use-current-user";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmButton } from "@/components/confirm-button";
import { EmptyState, ErrorState } from "@/components/query-boundary";
import { BodyMap, aggregateMuscleIntensities } from "@/components/body-map/body-map";
import { ExerciseDetailSheet } from "@/components/workouts/exercise-detail-sheet";
import { BodyPartProgressCard, RecoveryCard } from "@/components/workouts/progress-cards";
import { ActivityHeatmap } from "@/components/workouts/activity-heatmap";
import { ExerciseDemo } from "@/components/workouts/exercise-demo-images";
import { exerciseImages } from "@/data/exercise-media";
import { ExercisePicker } from "@/components/pickers/exercise-picker";
import { NoRoutineCard } from "@/components/home/today-workout-card";
import { EQUIPMENT_LABELS, label } from "@/lib/labels";
import { formatDate, formatDuration, toISODate, todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";
import { addDays, endOfMonth, startOfMonth, startOfWeek } from "date-fns";
import {
  TRAINING_PROGRAMS,
  WEEKDAY_INITIALS,
  WEEKDAY_LABELS,
  projectSchedule,
  type Weekday,
} from "@forja/domain";

/**
 * O módulo de musculação.
 *
 * A tela responde três perguntas, nesta ordem:
 *
 * 1. **Em que ponto da semana eu estou?** — a faixa de dias, com o que foi
 *    feito, o que falta e o que é descanso.
 * 2. **O que este treino trabalha?** — o mapa corporal, que comunica em meio
 *    segundo o que uma lista de nomes levaria dez para transmitir.
 * 3. **Quais exercícios, e como?** — a lista, com demonstração, prescrição e
 *    edição direta.
 *
 * Selecionar outro dia troca as três coisas ao mesmo tempo. É o que transforma
 * a tela numa ficha navegável em vez de uma lista de templates.
 */
export const Route = createFileRoute("/_authenticated/workouts")({
  head: () => ({
    meta: [
      { title: "Treino — Forja" },
      { name: "description", content: "Sua semana de treino, exercícios e progressão." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WorkoutsPage,
});

function WorkoutsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const userId = useCurrentUserId();
  const today = todayISO();

  const [detailExerciseId, setDetailExerciseId] = useState<string | null>(null);
  const [splitOverride, setSplitOverride] = useState<number | null>(null);

  /**
   * A semana — consertada se vier quebrada.
   *
   * Uma rotina inexistente, ou existente com todas as divisões vazias, é sempre
   * resultado de uma geração que falhou: ninguém apaga um a um os exercícios de
   * todos os dias. Em vez de anunciar "esta divisão está vazia" e deixar o
   * usuário sem saída, o app remonta a rotina a partir das respostas do
   * questionário, que ficaram salvas no banco.
   */
  const week = useQuery({
    queryKey: [...queryKeys.workouts.all, "week"],
    queryFn: async () => {
      const atual = await fetchWorkoutWeek();
      const vazia =
        !atual || atual.splits.length === 0 || atual.splits.every((s) => s.exercises.length === 0);

      if (!vazia) return atual;

      await ensureActiveRoutine(userId);
      return fetchWorkoutWeek();
    },
  });

  const completed = useQuery({
    queryKey: [...queryKeys.workouts.all, "completed-week"],
    queryFn: () => {
      const inicio = startOfWeek(new Date(), { weekStartsOn: 1 });
      return fetchCompletedWorkouts(toISODate(inicio), toISODate(addDays(inicio, 6)));
    },
  });

  /**
   * O mês, para as estatísticas.
   *
   * Consulta separada da semana porque as duas respondem perguntas diferentes —
   * "o que falta nesta semana?" e "como está o mês?" — e porque a da semana é
   * usada na projeção da agenda, que não deve enxergar treinos de fora dela.
   */
  const mes = useQuery({
    queryKey: [...queryKeys.workouts.all, "completed-month"],
    queryFn: () => {
      const agora = new Date();
      return fetchCompletedWorkouts(toISODate(startOfMonth(agora)), toISODate(endOfMonth(agora)));
    },
  });

  const history = useQuery({
    queryKey: queryKeys.workouts.history(),
    queryFn: async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { unwrapList } = await import("@/data/supabase-helpers");
      return unwrapList(
        "carregar histórico",
        await supabase
          .from("workout_sessions")
          .select("id, name, started_at, ended_at, duration_seconds, total_volume_kg")
          .is("deleted_at", null)
          .not("ended_at", "is", null)
          .order("started_at", { ascending: false })
          .limit(10),
      );
    },
  });

  const records = useQuery({
    queryKey: queryKeys.workouts.personalRecords(),
    queryFn: () => fetchPersonalRecords(),
  });

  /**
   * Abrir o treino é o único caminho de execução.
   *
   * O botão "Iniciar treino" criava a sessão e navegava para uma rota que nunca
   * era renderizada (a rota-pai não tinha `<Outlet />`), então nada acontecia na
   * tela — o clássico "botão morto". Agora abrir retoma a sessão em andamento
   * ou cria uma nova, e o cronômetro começa a correr na tela seguinte.
   */
  const abrirTreino = useMutation({
    mutationFn: (templateId: string) => openWorkoutForTemplate(userId, templateId),
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: queryKeys.workouts.all });
      void navigate({ to: "/workouts/session/$id", params: { id } });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.workouts.all });

  /** Projeção da semana corrente, para a faixa de dias. */
  const semana = useMemo(() => {
    if (!week.data || week.data.splits.length === 0) return [];
    const inicio = startOfWeek(new Date(), { weekStartsOn: 1 });
    const dias = Array.from({ length: 7 }, (_, i) => toISODate(addDays(inicio, i)));

    return projectSchedule(
      dias,
      today,
      {
        weekdays: week.data.trainingWeekdays.length ? week.data.trainingWeekdays : [1, 3, 5],
        splitCount: week.data.splits.length,
        currentIndex: week.data.currentIndex,
      },
      completed.data ?? [],
    );
  }, [week.data, completed.data, today]);

  if (week.isPending) return <WeekSkeleton />;
  if (week.isError) {
    return (
      <PageBody>
        <ErrorState message={errorMessage(week.error)} onRetry={week.refetch} />
      </PageBody>
    );
  }
  if (!week.data || week.data.splits.length === 0) {
    return (
      <>
        <PageHeader title="Treino" description="Monte sua rotina para começar." />
        <PageBody>
          <NoRoutineCard />
        </PageBody>
      </>
    );
  }

  const dados = week.data;
  const indiceAtual = splitOverride ?? dados.currentIndex % dados.splits.length;
  const split = dados.splits[indiceAtual]!;

  return (
    <>
      <PageHeader
        title="Treino"
        description={dados.routineName}
        action={
          <Button asChild variant="outline">
            <Link to="/exercises">Biblioteca</Link>
          </Button>
        }
      />

      <PageBody>
        {/* 1 — A semana */}
        <section aria-label="Semana de treino" className="mb-5">
          <div className="grid grid-cols-7 gap-1.5">
            {semana.map((dia) => {
              const divisao = dia.splitIndex !== null ? dados.splits[dia.splitIndex] : undefined;
              const feito = dia.status === "done";
              const selecionado =
                divisao !== undefined && dados.splits.indexOf(divisao) === indiceAtual;

              return (
                <button
                  key={dia.date}
                  type="button"
                  disabled={!divisao}
                  onClick={() => divisao && setSplitOverride(dados.splits.indexOf(divisao))}
                  aria-label={`${WEEKDAY_LABELS[dia.weekday as Weekday]}${divisao ? ` — treino ${divisao.letter ?? ""}` : " — descanso"}`}
                  aria-current={dia.isToday ? "date" : undefined}
                  className={cn(
                    "flex min-h-[4.25rem] flex-col items-center justify-center gap-1 rounded-xl border-2 transition-all",
                    "disabled:cursor-default",
                    feito
                      ? "border-primary bg-primary text-primary-foreground"
                      : selecionado
                        ? "border-primary bg-primary/10"
                        : dia.status === "rest"
                          ? "border-transparent bg-muted/40 text-muted-foreground"
                          : "border-border hover:border-primary/40",
                    dia.isToday && !feito && !selecionado && "border-primary/60",
                  )}
                >
                  <span className="text-[10px] font-medium uppercase opacity-70">
                    {WEEKDAY_INITIALS[dia.weekday as Weekday]}
                  </span>
                  <span className="text-sm font-bold leading-none">
                    {feito ? "✓" : (divisao?.letter ?? "—")}
                  </span>
                  {dia.isToday && (
                    <span className="text-[9px] font-medium uppercase tracking-wide opacity-80">
                      hoje
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* 2 — Mapa corporal + ação */}
        <Card className="mb-4 overflow-hidden">
          <CardContent className="p-5">
            <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
              <BodyMap
                muscles={aggregateMuscleIntensities(split.exercises.flatMap((e) => e.muscles))}
                className="shrink-0"
              />

              <div className="w-full text-center sm:text-left">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Divisão {split.letter ?? indiceAtual + 1}
                </p>
                <h2 className="mt-1 text-balance text-xl font-bold leading-tight tracking-tight">
                  {split.name.replace(/^[A-Z]\s*—\s*/, "")}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {split.exercises.length}{" "}
                  {split.exercises.length === 1 ? "exercício" : "exercícios"} ·{" "}
                  {split.exercises.reduce((s, e) => s + e.targetSets, 0)} séries ·{" "}
                  {estimarDuracao(split)}
                </p>

                <Button
                  size="lg"
                  className="mt-4 h-12 w-full rounded-xl text-base font-semibold sm:w-auto sm:px-8"
                  onClick={() => abrirTreino.mutate(split.templateId)}
                  disabled={abrirTreino.isPending || split.exercises.length === 0}
                >
                  <Play className="mr-1.5 size-5" aria-hidden />
                  Abrir treino
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">
                  A lista de exercícios abre com o cronômetro correndo.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 3 — Exercícios */}
        <section aria-label="Exercícios do treino">
          <div className="mb-3 flex items-center justify-between px-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Exercícios
            </h3>
            <ExercisePicker
              title="Adicionar exercício"
              onPick={async (exercise) => {
                await addTemplateItem(split.templateId, exercise.id, split.exercises.length + 1);
                toast.success("Exercício adicionado");
                await invalidate();
              }}
              trigger={
                <Button size="sm" variant="ghost">
                  <Plus className="mr-1 size-4" />
                  Adicionar
                </Button>
              }
            />
          </div>

          {split.exercises.length === 0 ? (
            <EmptyState
              icon={<Plus className="size-6" />}
              title="Esta divisão está vazia"
              description="Adicione exercícios para montar o treino."
            />
          ) : (
            <ul className="space-y-2.5">
              {split.exercises.map((exercise, i) => (
                <ExerciseRow
                  key={exercise.itemId}
                  exercise={exercise}
                  index={i}
                  templateId={split.templateId}
                  onOpenDetail={() => setDetailExerciseId(exercise.exerciseId)}
                  onChanged={invalidate}
                />
              ))}
            </ul>
          )}
        </section>

        {/* 4 — Progresso da semana e do mês */}
        <section className="mt-8" aria-label="Seu progresso">
          <h3 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Seu progresso
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile
              label="Nesta semana"
              value={`${(completed.data ?? []).length}/${dados.daysPerWeek}`}
              hint="treinos"
            />
            <StatTile label="Neste mês" value={String((mes.data ?? []).length)} hint="treinos" />
            <StatTile
              label="Volume do mês"
              value={`${Math.round(
                (mes.data ?? []).reduce((s, w) => s + w.volumeKg, 0) / 1000,
              ).toLocaleString("pt-BR")} t`}
              hint="carga total"
            />
            <StatTile
              label="Tempo no mês"
              value={formatDuration((mes.data ?? []).reduce((s, w) => s + w.durationSeconds, 0))}
              hint="em treino"
            />
          </div>
        </section>

        <section className="mt-8" aria-labelledby="constancia-titulo">
          <h3
            id="constancia-titulo"
            className="mb-3 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Constância
          </h3>
          <ActivityHeatmap />
        </section>

        <section className="mt-8" aria-labelledby="partes-titulo">
          <h3
            id="partes-titulo"
            className="mb-3 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Por parte do corpo
          </h3>
          <BodyPartProgressCard />
        </section>

        <section className="mt-8" aria-labelledby="recuperacao-titulo">
          <h3
            id="recuperacao-titulo"
            className="mb-3 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Recuperação muscular
          </h3>
          <RecoveryCard />
        </section>

        {/* Programas prontos — trocar de plano sem responder tudo de novo */}
        <section className="mt-8" aria-labelledby="programas-titulo">
          <h3
            id="programas-titulo"
            className="mb-3 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Programas prontos
          </h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {TRAINING_PROGRAMS.map((p) => (
              <li key={p.slug}>
                <Card className="h-full">
                  <CardContent className="flex h-full flex-col gap-2 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-tight">{p.name}</p>
                      <p className="mt-1 text-pretty text-sm text-muted-foreground">
                        {p.description}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        {p.input.daysPerWeek}× por semana · {p.weeks} semanas
                      </span>
                      <Button asChild size="sm" variant="outline">
                        <Link to="/workouts/routines/new" search={{ programa: p.slug }}>
                          Começar
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        {/* 5 — Recordes pessoais */}
        <section className="mt-8" aria-labelledby="recordes-titulo">
          <h3
            id="recordes-titulo"
            className="mb-3 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Recordes
          </h3>
          {records.isPending ? (
            <Skeleton className="h-24 w-full rounded-xl" />
          ) : records.isError ? (
            <ErrorState message={errorMessage(records.error)} onRetry={records.refetch} compact />
          ) : (records.data ?? []).length === 0 ? (
            <p className="px-1 text-sm text-muted-foreground">
              Ao bater uma marca nova, ela fica guardada aqui.
            </p>
          ) : (
            <Card>
              <CardContent className="p-0">
                <ul className="divide-y divide-border">
                  {(records.data ?? []).map((r) => (
                    <li key={r.exerciseId}>
                      <Link
                        to="/exercises/$id"
                        params={{ id: r.exerciseId }}
                        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50"
                      >
                        <Trophy className="size-4 shrink-0 text-primary" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{r.exerciseName}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(r.date, "d 'de' MMM")} · 1RM estimado {Math.round(r.e1rm)}{" "}
                            kg
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">
                          {r.weightKg.toLocaleString("pt-BR")} kg × {r.reps}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </section>

        {/* 6 — Histórico recente */}
        <section className="mt-8">
          <h3 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Últimos treinos
          </h3>
          {history.isPending ? (
            <Skeleton className="h-24 w-full rounded-xl" />
          ) : (history.data ?? []).length === 0 ? (
            <p className="px-1 text-sm text-muted-foreground">
              Nenhum treino concluído ainda. O primeiro aparece aqui.
            </p>
          ) : (
            <Card>
              <CardContent className="p-0">
                <ul className="divide-y divide-border">
                  {(history.data ?? []).map((s) => (
                    <li key={s.id}>
                      <Link
                        to="/workouts/session/$id"
                        params={{ id: s.id }}
                        className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent/50"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{s.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDuration(s.duration_seconds)}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                          {Math.round(Number(s.total_volume_kg ?? 0)).toLocaleString("pt-BR")} kg
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </section>
      </PageBody>

      <ExerciseDetailSheet
        exerciseId={detailExerciseId}
        open={detailExerciseId !== null}
        onOpenChange={(open) => !open && setDetailExerciseId(null)}
      />
    </>
  );
}

/** Um número do progresso. Quatro deles cabem numa linha no celular. */
function StatTile({ label: rotulo, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums leading-tight">{value}</p>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

/**
 * Uma linha de exercício.
 *
 * Séries, repetições, carga e descanso são editáveis **no lugar**, sem abrir
 * diálogo. Ajustar o descanso de 90 para 120 segundos é uma decisão de dois
 * segundos que não merece uma tela; empurrá-la para um modal é o que faz o
 * usuário desistir de personalizar e acabar seguindo um plano que não serve.
 */
function ExerciseRow({
  exercise,
  index,
  templateId,
  onOpenDetail,
  onChanged,
}: {
  exercise: WeekExercise;
  index: number;
  templateId: string;
  onOpenDetail: () => void;
  onChanged: () => void | Promise<unknown>;
}) {
  const [expandido, setExpandido] = useState(false);

  const salvar = useMutation({
    mutationFn: (patch: Parameters<typeof updateTemplateItem>[1]) =>
      updateTemplateItem(exercise.itemId, patch),
    onSuccess: () => void onChanged(),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remover = useMutation({
    mutationFn: () => removeTemplateItem(exercise.itemId),
    onSuccess: () => {
      toast.success("Exercício removido");
      void onChanged();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const duplicar = useMutation({
    mutationFn: () => duplicateTemplateItem(exercise, templateId),
    onSuccess: () => {
      toast.success("Exercício duplicado");
      void onChanged();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const trocar = useMutation({
    mutationFn: (newId: string) => swapTemplateExercise(exercise.itemId, newId),
    onSuccess: () => {
      toast.success("Exercício trocado — séries e descanso preservados");
      void onChanged();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const faixaReps =
    exercise.targetRepMin && exercise.targetRepMax
      ? `${exercise.targetRepMin}–${exercise.targetRepMax}`
      : String(exercise.targetReps);

  return (
    <li>
      <Card className="overflow-hidden transition-shadow hover:shadow-sm">
        <CardContent className="p-3">
          <div className="flex gap-3">
            <span className="mt-1 hidden text-muted-foreground sm:block" aria-hidden>
              <GripVertical className="size-4" />
            </span>

            <button
              type="button"
              onClick={onOpenDetail}
              className="shrink-0"
              aria-label={`Ver detalhes de ${exercise.name}`}
            >
              <ExerciseDemo
                images={exerciseImages(exercise.name, exercise.imageUrls)}
                name={exercise.name}
                autoPlay={false}
                interactive={false}
                className="w-20 sm:w-24"
              />
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <button type="button" onClick={onOpenDetail} className="min-w-0 flex-1 text-left">
                  <p className="text-balance font-semibold leading-snug">
                    <span className="mr-1.5 text-muted-foreground">{index + 1}.</span>
                    {exercise.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {label(EQUIPMENT_LABELS, exercise.equipment)}
                    {exercise.supersetGroup !== null && " · em supersérie"}
                  </p>
                </button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 shrink-0"
                      aria-label={`Opções de ${exercise.name}`}
                    >
                      <MoreVertical className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={onOpenDetail}>
                      <Info className="mr-2 size-4" />
                      Ver execução
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setExpandido((v) => !v)}>
                      <Timer className="mr-2 size-4" />
                      {expandido ? "Ocultar ajustes" : "Ajustar séries e descanso"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => duplicar.mutate()}>
                      <Copy className="mr-2 size-4" />
                      Duplicar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <ExercisePicker
                      title={`Trocar ${exercise.name}`}
                      muscle={exercise.primaryMuscle}
                      onPick={async (ex) => trocar.mutateAsync(ex.id)}
                      trigger={
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                          <Repeat className="mr-2 size-4" />
                          Trocar exercício
                        </DropdownMenuItem>
                      }
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" className="tabular-nums font-normal">
                  {exercise.targetSets} × {faixaReps}
                </Badge>
                <Badge variant="outline" className="tabular-nums font-normal">
                  {exercise.restSeconds}s descanso
                </Badge>
                {exercise.targetRpe && (
                  <Badge variant="outline" className="tabular-nums font-normal">
                    RPE {exercise.targetRpe}
                  </Badge>
                )}
                {exercise.cadence && (
                  <Badge variant="outline" className="tabular-nums font-normal">
                    {exercise.cadence}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {expandido && (
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 sm:grid-cols-4">
              <NumberInput
                label="Séries"
                value={exercise.targetSets}
                min={1}
                max={12}
                onCommit={(v) => salvar.mutate({ target_sets: v })}
              />
              <NumberInput
                label="Repetições"
                value={exercise.targetReps}
                min={1}
                max={100}
                onCommit={(v) => salvar.mutate({ target_reps: v })}
              />
              <NumberInput
                label="Descanso (s)"
                value={exercise.restSeconds}
                min={0}
                max={600}
                step={15}
                onCommit={(v) => salvar.mutate({ rest_seconds: v })}
              />
              <NumberInput
                label="RPE alvo"
                value={exercise.targetRpe ?? 8}
                min={1}
                max={10}
                onCommit={(v) => salvar.mutate({ target_rpe: v })}
              />

              <div className="col-span-2 flex items-end sm:col-span-4">
                <ConfirmButton
                  aria-label={`Remover ${exercise.name} do treino`}
                  title="Remover do treino?"
                  description={`“${exercise.name}” sai desta divisão. Seu histórico de séries continua salvo.`}
                  confirmLabel="Remover"
                  onConfirm={() => remover.mutate()}
                >
                  <Trash2 className="mr-1.5 size-4" />
                  Remover exercício
                </ConfirmButton>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </li>
  );
}

/**
 * Campo numérico que grava ao sair do foco, não a cada tecla.
 *
 * Gravar a cada dígito produziria uma escrita por caractere — "120" viraria
 * três requisições, e o valor intermediário "1" chegaria a ser persistido.
 */
function NumberInput({
  label: labelText,
  value,
  min,
  max,
  step = 1,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{labelText}</span>
      <Input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = Number(draft);
          if (!Number.isFinite(n)) return setDraft(String(value));
          const clamped = Math.max(min, Math.min(max, n));
          setDraft(String(clamped));
          if (clamped !== value) onCommit(clamped);
        }}
        className="h-10 tabular-nums"
      />
    </label>
  );
}

/**
 * Duração estimada do treino.
 *
 * Soma o descanso prescrito com ~35 s por série de execução. É uma
 * aproximação declarada como tal ("~45 min"), não uma promessa: o tempo real
 * depende de fila no aparelho e de conversa entre séries.
 */
function estimarDuracao(split: WeekSplit): string {
  const segundos = split.exercises.reduce(
    (total, e) => total + e.targetSets * (e.restSeconds + 35),
    0,
  );
  return `~${Math.round(segundos / 60)} min`;
}

function WeekSkeleton() {
  return (
    <>
      <PageHeader title="Treino" description="Carregando sua semana…" />
      <PageBody>
        <div className="mb-5 grid grid-cols-7 gap-1.5">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="h-[4.25rem] rounded-xl" />
          ))}
        </div>
        <Skeleton className="mb-4 h-64 w-full rounded-xl" />
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      </PageBody>
    </>
  );
}
