import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronRight, Loader2, Moon, Play } from "lucide-react";
import { toast } from "sonner";
import { todaysWorkout, weekdayOf } from "@forja/domain";
import { queryKeys } from "@/data/query-keys";
import {
  fetchActiveRoutine,
  fetchCompletedWorkouts,
  scheduleInputOf,
  splitDisplayName,
  type ActiveRoutine,
} from "@/data/routines";
import { fetchOpenSessionId, openWorkoutForTemplate } from "@/data/workout-session";
import { errorMessage } from "@/data/supabase-helpers";
import { useCurrentUserId } from "@/hooks/use-current-user";
import { PageBody, PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/query-boundary";
import { NoRoutineCard } from "@/components/home/today-workout-card";
import { RoutineIcon } from "@/components/workouts/routine-icon";
import { todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";

/**
 * Treinar: o que falta fazer hoje e, abaixo, todos os treinos do plano.
 *
 * Com um treino aberto, volta direto para ele — é o botão central laranja.
 * Sem pendência hoje (já treinou ou é descanso), diz isso, mas deixa os
 * treinos à mão para quem quiser treinar mesmo assim.
 */
export const Route = createFileRoute("/_authenticated/train")({
  head: () => ({
    meta: [{ title: "Treinar — Habitual Fit" }, { name: "robots", content: "noindex" }],
  }),
  component: TrainPage,
});

type Template = ActiveRoutine["templates"][number];

function TrainPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const userId = useCurrentUserId();
  const hoje = todayISO();

  const aberto = useQuery({
    queryKey: [...queryKeys.workouts.all, "open-session"],
    queryFn: fetchOpenSessionId,
  });
  const rotina = useQuery({
    queryKey: queryKeys.workouts.activeRoutine(),
    queryFn: fetchActiveRoutine,
  });
  const feitos = useQuery({
    queryKey: [...queryKeys.workouts.all, "completed", hoje],
    queryFn: () => fetchCompletedWorkouts(hoje, hoje),
  });

  useEffect(() => {
    if (aberto.data) {
      void navigate({ to: "/workouts/session/$id", params: { id: aberto.data }, replace: true });
    }
  }, [aberto.data, navigate]);

  const comecar = useMutation({
    mutationFn: (templateId: string) => openWorkoutForTemplate(userId, templateId),
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: queryKeys.workouts.all });
      void navigate({ to: "/workouts/session/$id", params: { id } });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const header = <PageHeader title="Treinar" />;

  if (aberto.isPending || aberto.data || rotina.isPending || feitos.isPending) {
    return (
      <>
        {header}
        <PageBody>
          <div className="space-y-3" role="status" aria-label="Carregando">
            <Skeleton className="h-32 w-full rounded-[1.5rem]" />
            <Skeleton className="h-20 w-full rounded-[1.25rem]" />
            <Skeleton className="h-20 w-full rounded-[1.25rem]" />
          </div>
        </PageBody>
      </>
    );
  }

  if (rotina.isError || feitos.isError) {
    return (
      <>
        {header}
        <PageBody>
          <ErrorState
            message={errorMessage(rotina.error ?? feitos.error)}
            onRetry={() => {
              void rotina.refetch();
              void feitos.refetch();
            }}
          />
        </PageBody>
      </>
    );
  }

  const r = rotina.data;
  if (!r || r.templates.length === 0) {
    return (
      <>
        {header}
        <PageBody>
          <NoRoutineCard />
        </PageBody>
      </>
    );
  }

  const deHoje = feitos.data.filter((w) => w.date === hoje);
  const treinouHoje = deHoje.length > 0;
  const feita = (t: Template) => deHoje.some((w) => w.splitIndex === t.order);

  // Semana fixa: todas as rotinas do dia que faltam. Rotação: a próxima da
  // sequência, se hoje é dia de treino e ainda não treinou.
  let pendentes: Template[];
  if (r.scheduleMode === "fixed") {
    const dia = weekdayOf(hoje);
    pendentes = r.templates.filter((t) => t.weekdays.includes(dia) && !feita(t));
  } else {
    const { splitIndex, isPlannedDay, alreadyDone } = todaysWorkout(
      hoje,
      scheduleInputOf(r),
      feitos.data,
    );
    const t = r.templates[splitIndex];
    pendentes = t && isPlannedDay && !alreadyDone ? [t] : [];
  }
  pendentes = pendentes.filter((t) => t.exerciseCount > 0);
  const outros = r.templates.filter((t) => !pendentes.includes(t));

  return (
    <>
      {header}
      <PageBody>
        {pendentes.length > 0 ? (
          <section aria-label="Treinos de hoje">
            <h2 className="mb-3 px-1 text-lg text-muted-foreground">
              {pendentes.length === 1 ? "Treino de hoje" : "Treinos de hoje"}
            </h2>
            <ul className="space-y-3">
              {pendentes.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => comecar.mutate(t.id)}
                    disabled={comecar.isPending}
                    className="flex w-full items-center gap-4 rounded-[1.5rem] bg-primary p-5 text-left text-primary-foreground transition-opacity disabled:opacity-60"
                  >
                    <RoutineIcon
                      icon={t.icon}
                      name={t.name}
                      className="size-14 rounded-2xl bg-primary-foreground/15 text-primary-foreground [&>svg]:size-7"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-2xl font-bold">
                        {splitDisplayName(t.name)}
                      </span>
                      <span className="block opacity-80">
                        {t.exerciseCount} {t.exerciseCount === 1 ? "exercício" : "exercícios"}
                      </span>
                    </span>
                    {comecar.isPending && comecar.variables === t.id ? (
                      <Loader2 className="size-7 shrink-0 animate-spin" aria-hidden />
                    ) : (
                      <Play className="size-7 shrink-0 fill-current" aria-hidden />
                    )}
                    <span className="sr-only">Começar</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section
            className="flex items-center gap-4 rounded-[1.5rem] bg-card p-5"
            aria-label="Hoje"
          >
            <span
              className={cn(
                "grid size-14 shrink-0 place-items-center rounded-2xl",
                treinouHoje ? "bg-primary text-primary-foreground" : "bg-elevated",
              )}
            >
              {treinouHoje ? (
                <CheckCircle2 className="size-7" aria-hidden />
              ) : (
                <Moon className="size-7" aria-hidden />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-xl font-bold">
                {treinouHoje ? "Você já treinou hoje" : "Hoje é dia de descanso"}
              </p>
              <p className="text-muted-foreground">
                {treinouHoje
                  ? "Agora é descansar: o músculo cresce na recuperação. Se quiser treinar mais, escolha abaixo."
                  : "Aproveite para recuperar. Se quiser treinar mesmo assim, escolha abaixo."}
              </p>
            </div>
          </section>
        )}

        {outros.length > 0 && (
          <section aria-label="Seus treinos" className="mt-8">
            <h2 className="mb-3 px-1 text-lg text-muted-foreground">
              {pendentes.length > 0 ? "Outros treinos" : "Seus treinos"}
            </h2>
            <ul className="space-y-3">
              {outros.map((t) => (
                <li key={t.id} className="flex items-center gap-3 rounded-[1.25rem] bg-card p-4">
                  <RoutineIcon icon={t.icon} name={t.name} muted />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-lg font-semibold">
                      {splitDisplayName(t.name)}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {t.exerciseCount} {t.exerciseCount === 1 ? "exercício" : "exercícios"}
                      {feita(t) && " · feito hoje ✓"}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => comecar.mutate(t.id)}
                    disabled={comecar.isPending || t.exerciseCount === 0}
                    className="shrink-0 rounded-xl bg-primary-soft px-4 py-2 font-medium text-primary-soft-foreground disabled:opacity-50"
                    aria-label={`Começar ${splitDisplayName(t.name)}`}
                  >
                    Começar
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Link
          to="/plan"
          className="mt-6 flex items-center justify-between rounded-[1.25rem] px-4 py-3 text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
        >
          Editar rotinas e agenda no Plano
          <ChevronRight className="size-5" aria-hidden />
        </Link>
      </PageBody>
    </>
  );
}
