import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
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
import { ErrorState } from "@/components/query-boundary";
import { NoRoutineCard } from "@/components/home/today-workout-card";
import { RoutineIcon } from "@/components/workouts/routine-icon";
import { formatLongDate, todayISO } from "@/lib/date";

/**
 * Treinar: o que falta fazer hoje e, abaixo, todos os treinos do plano.
 *
 * É a tela de ação do app, por isso foge do padrão: fundo no verde da marca e
 * elementos escuros. As cores são as da marca, fixas — o contraste é o mesmo
 * no tema claro e no escuro. Ela chega pela transição do botão central (o
 * punho que sobe trazendo o verde), que pinta a tela inteira desta mesma cor.
 *
 * Com um treino aberto, volta direto para ele. Sem pendência hoje (já treinou
 * ou é descanso), diz isso, mas deixa os treinos à mão.
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
  /** Só o botão tocado mostra que está abrindo; os outros ficam como estão. */
  const abrindo = (templateId: string) => comecar.isPending && comecar.variables === templateId;
  const iniciar = (templateId: string) => {
    if (!comecar.isPending) comecar.mutate(templateId);
  };

  if (aberto.isPending || aberto.data || rotina.isPending || feitos.isPending) {
    return (
      <TelaVerde>
        <div className="space-y-3" role="status" aria-label="Carregando">
          <div className="h-32 animate-pulse rounded-[1.5rem] bg-[#020306]/15" />
          <div className="h-20 animate-pulse rounded-[1.25rem] bg-[#020306]/10" />
          <div className="h-20 animate-pulse rounded-[1.25rem] bg-[#020306]/10" />
        </div>
      </TelaVerde>
    );
  }

  if (rotina.isError || feitos.isError) {
    return (
      <TelaVerde>
        <ErrorState
          message={errorMessage(rotina.error ?? feitos.error)}
          onRetry={() => {
            void rotina.refetch();
            void feitos.refetch();
          }}
        />
      </TelaVerde>
    );
  }

  const r = rotina.data;
  if (!r || r.templates.length === 0) {
    return (
      <TelaVerde>
        <NoRoutineCard />
      </TelaVerde>
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
    <TelaVerde>
      {pendentes.length > 0 ? (
        <section aria-label="Treinos de hoje">
          <Titulo>{pendentes.length === 1 ? "Treino de hoje" : "Treinos de hoje"}</Titulo>
          <ul className="space-y-3">
            {pendentes.map((t, i) => (
              <li
                key={t.id}
                className="animate-in fade-in slide-in-from-bottom-3 fill-mode-backwards duration-500"
                style={{ animationDelay: `${200 + i * 90}ms` }}
              >
                <button
                  type="button"
                  onClick={() => iniciar(t.id)}
                  aria-busy={abrindo(t.id)}
                  className="flex w-full items-center gap-4 rounded-[1.75rem] bg-[#020306] p-5 text-left text-white shadow-[0_18px_40px_-18px_rgba(2,3,6,0.7)] transition-transform active:scale-[0.98] disabled:opacity-70"
                >
                  <RoutineIcon
                    icon={t.icon}
                    name={t.name}
                    className="size-14 rounded-2xl bg-[#01D798] text-[#020306] [&>svg]:size-7"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-2xl font-extrabold">
                      {splitDisplayName(t.name)}
                    </span>
                    <span className="block text-white/60">
                      {t.exerciseCount} {t.exerciseCount === 1 ? "exercício" : "exercícios"}
                    </span>
                  </span>
                  <span className="grid size-14 shrink-0 place-items-center rounded-full bg-[#01D798] text-[#020306]">
                    {abrindo(t.id) ? (
                      <Loader2 className="size-6 animate-spin" aria-hidden />
                    ) : (
                      <Play className="ml-0.5 size-6 fill-current" aria-hidden />
                    )}
                  </span>
                  <span className="sr-only">Começar</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section
          className="flex items-center gap-4 rounded-[1.75rem] bg-[#020306] p-5 text-white animate-in fade-in slide-in-from-bottom-3 fill-mode-backwards delay-200 duration-500"
          aria-label="Hoje"
        >
          {treinouHoje ? (
            <CheckCircle2 className="size-14 shrink-0 text-[#01D798]" strokeWidth={2.25} aria-hidden />
          ) : (
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[#01D798] text-[#020306]">
              <Moon className="size-7" aria-hidden />
            </span>
          )}
          <div className="min-w-0">
            <p className="text-xl font-bold">
              {treinouHoje ? "Você já treinou hoje" : "Hoje é dia de descanso"}
            </p>
            <p className="text-white/60">
              {treinouHoje
                ? "Se quiser treinar mais, escolha abaixo."
                : "Aproveite para recuperar. Se quiser treinar mesmo assim, escolha abaixo."}
            </p>
          </div>
        </section>
      )}

      {outros.length > 0 && (
        <section aria-label="Seus treinos" className="mt-8">
          <Titulo>{pendentes.length > 0 ? "Outros treinos" : "Seus treinos"}</Titulo>
          <ul className="space-y-2.5">
            {outros.map((t, i) => (
              <li
                key={t.id}
                className="flex items-center gap-3 rounded-[1.25rem] bg-[#020306]/90 p-3.5 text-white animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-500"
                style={{ animationDelay: `${320 + i * 60}ms` }}
              >
                <RoutineIcon icon={t.icon} name={t.name} className="bg-white/10 text-[#01D798]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-lg font-semibold">
                    {splitDisplayName(t.name)}
                  </span>
                  <span className="block text-sm text-white/55">
                    {t.exerciseCount} {t.exerciseCount === 1 ? "exercício" : "exercícios"}
                    {feita(t) && " · feito hoje ✓"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => iniciar(t.id)}
                  aria-busy={abrindo(t.id)}
                  disabled={t.exerciseCount === 0}
                  className="grid min-w-[6.5rem] shrink-0 place-items-center rounded-full bg-[#01D798] px-4 py-2 font-bold text-[#020306] transition-transform active:scale-95 disabled:opacity-50"
                  aria-label={`Começar ${splitDisplayName(t.name)}`}
                >
                  {abrindo(t.id) ? (
                    <Loader2 className="size-5 animate-spin" aria-hidden />
                  ) : (
                    "Começar"
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link
        to="/plan"
        className="mt-6 flex items-center justify-between rounded-[1.25rem] px-4 py-3 font-semibold text-[#020306]/75 transition-colors hover:bg-[#020306]/10 hover:text-[#020306]"
      >
        Editar rotinas e agenda no Plano
        <ChevronRight className="size-5" aria-hidden />
      </Link>
    </TelaVerde>
  );
}

/**
 * O fundo verde ocupa a tela inteira: anula o respiro inferior do layout
 * (`-mb-28`) e repõe o próprio, para não sobrar uma faixa escura acima da barra.
 */
function TelaVerde({ children }: { children: ReactNode }) {
  return (
    <div className="-mb-28 min-h-dvh bg-[#01D798] pb-36 text-[#020306] md:mb-0 md:pb-10">
      <div className="mx-auto w-full max-w-3xl px-4 pt-6 md:px-8 md:pt-8">
        <header className="mb-6">
          <h1 className="text-[2.75rem] font-extrabold leading-none tracking-tight">Treinar</h1>
          <p className="mt-2 text-lg font-medium text-[#020306]/65 first-letter:uppercase">
            {formatLongDate(todayISO()).toLowerCase()}
          </p>
        </header>
        {children}
      </div>
    </div>
  );
}

function Titulo({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 px-1 text-sm font-bold uppercase tracking-wider text-[#020306]/65">
      {children}
    </h2>
  );
}
