import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { addDays, startOfWeek } from "date-fns";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Flame,
  Moon,
  Plus,
  Target,
  Utensils,
} from "lucide-react";
import {
  WEEKDAY_LABELS,
  ema,
  nutritionTotals,
  projectSchedule,
  todaysWorkout,
  weekStart,
  weekdayOf,
  weeklyStreak,
  type Weekday,
} from "@forja/domain";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/data/query-keys";
import { errorMessage, num, unwrapMaybe } from "@/data/supabase-helpers";
import { hasCompletedOnboarding } from "@/data/onboarding";
import { isComplete } from "@/lib/onboarding/schema";
import { loadDraft } from "@/lib/onboarding/storage";
import { fetchActiveRoutine, fetchCompletedWorkouts, scheduleInputOf } from "@/data/routines";
import { openWorkoutForTemplate } from "@/data/workout-session";
import { ensureDayMaterialized, fetchDayEntries } from "@/data/diet-day";
import { ensureActiveMealPlan } from "@/data/meal-plans";
import { fetchGoalWeight, fetchWeighIns, fetchWorkoutCounts } from "@/data/body";
import { useCurrentUserId } from "@/hooks/use-current-user";
import { Skeleton } from "@/components/ui/skeleton";
import { CoachIcon } from "@/components/coach/coach-icon";
import { NoRoutineCard } from "@/components/home/today-workout-card";
import { WaterCard } from "@/components/home/water-card";
import { CoachTips } from "@/components/coach/coach-tips";
import { LazyWeightChart } from "@/components/charts/lazy-chart";
import { formatDate, formatLongDate, fromISODate, toISODate, todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand-logo";

/**
 * Início: a semana, o treino de hoje e o resto do dia.
 *
 * Ordem: a sequência de semanas; a semana com o treino de hoje e o botão de
 * começar; o peso contra a meta; a dieta do dia; a água; o treinador.
 * Gráficos longos e histórico vivem em Estatísticas.
 */
export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Início — Habitual Fit" },
      { name: "description", content: "Sua semana, o treino de hoje e o resto do dia." },
      { name: "robots", content: "noindex" },
    ],
  }),
  // Quem chega sem ter passado pela geração vai montá-la.
  // Sem plano: com as respostas no aparelho, vai montá-lo; sem elas (primeiro
  // login com Google, por exemplo), direto para o questionário.
  beforeLoad: async () => {
    if (await hasCompletedOnboarding()) return;
    throw redirect({ to: isComplete(loadDraft()) ? "/preparando" : "/" });
  },
  component: Home,
});

const INICIAIS: Record<Weekday, string> = {
  0: "DOM",
  1: "SEG",
  2: "TER",
  3: "QUA",
  4: "QUI",
  5: "SEX",
  6: "SÁB",
};

function Home() {
  const today = todayISO();

  const profile = useQuery({
    queryKey: queryKeys.profile(),
    queryFn: async () =>
      unwrapMaybe("carregar perfil", await supabase.from("profiles").select("*").maybeSingle()),
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-8 pt-6 md:px-8 md:pt-8">
      <header className="mb-6">
        <h1>
          <BrandLogo className="h-12" />
        </h1>
        <p className="mt-2 text-lg text-muted-foreground first-letter:uppercase">
          {formatLongDate(today).toLowerCase()}
        </p>
      </header>

      <div className="space-y-4">
        <SequenciaCard />
        <SemanaCard />
        <PesoCard />
        <DietaCard
          kcalTarget={num(profile.data?.daily_kcal_target)}
          proteinTarget={num(profile.data?.protein_g_target)}
          loadingProfile={profile.isPending}
        />
        <WaterCard date={today} targetMl={num(profile.data?.water_ml_target, 2500)} />
        <Link
          to="/coach"
          className="flex items-center gap-4 rounded-[1.5rem] bg-card p-5 transition-colors hover:bg-elevated"
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-info text-info-foreground">
            <CoachIcon className="size-6" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xl">Treinador</span>
            <span className="block text-muted-foreground">Pergunte sobre seu treino e dieta</span>
          </span>
          <ChevronRight className="size-5 shrink-0" aria-hidden />
        </Link>
        <CoachTips limit={1} />
      </div>
    </div>
  );
}

/** A semana navegável e o treino de hoje com o botão de começar. */
function SemanaCard() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const userId = useCurrentUserId();
  const today = todayISO();
  const [offset, setOffset] = useState(0);

  const routine = useQuery({
    queryKey: queryKeys.workouts.activeRoutine(),
    queryFn: fetchActiveRoutine,
  });
  const recentes = useQuery({
    queryKey: [...queryKeys.workouts.all, "completed-recent"],
    queryFn: () => {
      const inicio = startOfWeek(new Date(), { weekStartsOn: 1 });
      return fetchCompletedWorkouts(
        toISODate(addDays(inicio, -7 * 25)),
        toISODate(addDays(inicio, 6)),
      );
    },
  });

  const comecar = useMutation({
    mutationFn: (templateId: string) => openWorkoutForTemplate(userId, templateId),
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: queryKeys.workouts.all });
      void navigate({ to: "/workouts/session/$id", params: { id } });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const dias = useMemo(() => {
    const inicio = addDays(fromISODate(weekStart(today)), offset * 7);
    return Array.from({ length: 7 }, (_, i) => toISODate(addDays(inicio, i)));
  }, [today, offset]);

  if (routine.isPending) return <Skeleton className="h-64 w-full rounded-[1.5rem]" />;
  if (!routine.data) return <NoRoutineCard />;

  const r = routine.data;
  const entrada = scheduleInputOf(r);
  const feitos = recentes.data ?? [];
  const projecao = projectSchedule(dias, today, entrada, feitos);
  const treinados = new Set(feitos.map((w) => w.date));

  const { splitIndex, isPlannedDay, alreadyDone } = todaysWorkout(today, entrada, feitos);
  const template = r.templates[splitIndex];

  // Próximo dia com treino, para o texto do dia de descanso.
  const proximos = projectSchedule(
    Array.from({ length: 7 }, (_, i) => toISODate(addDays(fromISODate(today), i + 1))),
    today,
    entrada,
    feitos,
  );
  const proximo = proximos.find((d) => d.splitIndex !== null);

  const titulo =
    offset === 0
      ? "Esta semana"
      : offset === -1
        ? "Semana passada"
        : offset === 1
          ? "Próxima semana"
          : `${formatDate(dias[0]!, "d MMM")} – ${formatDate(dias[6]!, "d MMM")}`;

  return (
    <section className="rounded-[1.5rem] bg-card p-5" aria-label="Semana de treino">
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOffset((o) => o - 1)}
          aria-label="Semana anterior"
          className="grid size-9 place-items-center rounded-full hover:bg-elevated"
        >
          <ChevronLeft className="size-5" />
        </button>
        <p className="text-lg text-muted-foreground">{titulo}</p>
        <button
          type="button"
          onClick={() => setOffset((o) => o + 1)}
          aria-label="Próxima semana"
          className="grid size-9 place-items-center rounded-full hover:bg-elevated"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      <ol className="grid grid-cols-7 text-center">
        {dias.map((dia, i) => {
          const p = projecao[i]!;
          const eHoje = dia === today;
          const treinou = treinados.has(dia);
          const planejado = !treinou && p.splitIndex !== null && dia >= today;
          return (
            <li key={dia} className="flex flex-col items-center gap-1">
              <span className="text-sm text-muted-foreground">{INICIAIS[weekdayOf(dia)]}</span>
              <span
                className={cn(
                  "grid size-11 place-items-center rounded-full text-xl tabular-nums",
                  eHoje && "bg-primary font-extrabold text-primary-foreground",
                )}
                aria-current={eHoje ? "date" : undefined}
              >
                {Number(dia.slice(8))}
              </span>
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  treinou ? "bg-primary" : planejado ? "bg-warning" : "bg-transparent",
                )}
                aria-label={treinou ? "treinou" : planejado ? "treino previsto" : undefined}
              />
            </li>
          );
        })}
      </ol>

      <div className="mt-4 flex items-center gap-4 rounded-2xl bg-elevated p-4">
        <span
          className={cn(
            "grid size-12 shrink-0 place-items-center rounded-xl",
            isPlannedDay && !alreadyDone
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          {isPlannedDay ? (
            <Dumbbell className="size-6" aria-hidden />
          ) : (
            <Moon className="size-6" aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm uppercase tracking-wide text-muted-foreground">Hoje</p>
          <p className="truncate text-xl">
            {alreadyDone
              ? "Treino concluído"
              : isPlannedDay && template
                ? template.name.replace(/^[A-Z]\s*—\s*/, "")
                : proximo
                  ? `Descanso · ${WEEKDAY_LABELS[proximo.weekday].toLowerCase()} tem treino`
                  : "Descanso"}
          </p>
        </div>
        {template && !alreadyDone && (
          <button
            type="button"
            onClick={() => comecar.mutate(template.id)}
            disabled={comecar.isPending}
            className="shrink-0 rounded-xl bg-primary-soft px-4 py-2 text-lg font-medium text-primary-soft-foreground disabled:opacity-60"
          >
            {isPlannedDay ? "Começar" : "Treinar"}
          </button>
        )}
      </div>
    </section>
  );
}

/** A dieta do dia em uma linha: kcal e proteína contra a meta. */
function DietaCard({
  kcalTarget,
  proteinTarget,
  loadingProfile,
}: {
  kcalTarget: number;
  proteinTarget: number;
  loadingProfile: boolean;
}) {
  const userId = useCurrentUserId();
  const today = todayISO();
  const diario = useQuery({
    queryKey: queryKeys.diet.log(today),
    queryFn: async () => {
      await ensureActiveMealPlan(userId);
      await ensureDayMaterialized(userId, today, today);
      return fetchDayEntries(today);
    },
  });

  const consumidos = (diario.data ?? []).filter((e) => e.consumed);
  const totais = nutritionTotals(
    consumidos.map((e) => ({
      food: {
        servingSizeG: e.food.servingSizeG,
        kcal: e.food.kcal,
        proteinG: e.food.proteinG,
        carbsG: e.food.carbsG,
        fatG: e.food.fatG,
        fiberG: e.food.fiberG,
      },
      grams: e.grams,
      servings: 1,
    })),
  );
  const pendentes = (diario.data ?? []).filter((e) => !e.consumed).length;
  const pct = kcalTarget > 0 ? Math.min(100, (totais.kcal / kcalTarget) * 100) : 0;

  return (
    <Link
      to="/diet"
      className="block rounded-[1.5rem] bg-card p-5 transition-colors hover:bg-elevated"
      aria-label="Abrir a dieta de hoje"
    >
      <div className="flex items-center gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-warning text-warning-foreground">
          <Utensils className="size-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-lg text-muted-foreground">Dieta de hoje</p>
          {diario.isPending || loadingProfile ? (
            <Skeleton className="mt-1 h-7 w-40" />
          ) : (
            <p className="text-2xl font-bold tabular-nums">
              {Math.round(totais.kcal).toLocaleString("pt-BR")}
              <span className="text-base font-normal text-muted-foreground">
                {" "}
                / {Math.round(kcalTarget).toLocaleString("pt-BR")} kcal
              </span>
            </p>
          )}
        </div>
        <ChevronRight className="size-5 shrink-0" aria-hidden />
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-elevated" aria-hidden>
        <div className="h-full rounded-full bg-warning" style={{ width: `${pct}%` }} />
      </div>
      {!diario.isPending && (
        <p className="mt-3 text-muted-foreground">
          Proteína {Math.round(totais.proteinG)}/{Math.round(proteinTarget)} g
          {pendentes > 0 && ` · ${pendentes} ${pendentes === 1 ? "item" : "itens"} a marcar`}
        </p>
      )}
    </Link>
  );
}

/** Peso corporal contra a meta, com o gráfico de 90 dias. */
function PesoCard() {
  const pesos = useQuery({
    queryKey: [...queryKeys.body.all, "weigh-ins", 90],
    queryFn: () => fetchWeighIns(90),
  });
  const meta = useQuery({
    queryKey: [...queryKeys.body.all, "goal-weight"],
    queryFn: fetchGoalWeight,
  });

  const lista = pesos.data ?? [];
  const tendencia = ema(
    lista.map((p) => p.kg),
    0.25,
  );
  const atual = lista.at(-1);
  const anterior = lista.at(-2);
  const delta = atual && anterior ? atual.kg - anterior.kg : null;
  const falta = atual && meta.data ? atual.kg - meta.data : null;
  const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

  return (
    <section className="rounded-[1.5rem] bg-card p-5" aria-label="Peso corporal">
      <div className="flex items-center justify-between">
        <p className="text-lg text-muted-foreground">Peso corporal</p>
        <div className="flex items-center gap-4">
          {meta.data && (
            <span className="flex items-center gap-1 text-lg text-warning">
              <Target className="size-5" aria-hidden />
              {fmt(meta.data)}
            </span>
          )}
          <Link to="/body" className="flex items-center gap-1 text-lg text-primary">
            <Plus className="size-5" aria-hidden />
            Registrar
          </Link>
        </div>
      </div>

      {pesos.isPending ? (
        <Skeleton className="mt-3 h-40 w-full" />
      ) : !atual ? (
        <p className="mt-3 text-muted-foreground">Registre seu peso para acompanhar a tendência.</p>
      ) : (
        <>
          <div className="mt-2 flex items-end justify-between gap-3">
            <p className="flex items-baseline gap-2">
              <span className="text-5xl font-extrabold tabular-nums">{fmt(atual.kg)}</span>
              <span className="text-2xl font-bold text-muted-foreground">kg</span>
              {delta !== null && Math.abs(delta) >= 0.05 && (
                <span className="flex items-center text-lg text-primary tabular-nums">
                  {delta < 0 ? <ArrowDown className="size-4" /> : <ArrowUp className="size-4" />}
                  {fmt(Math.abs(delta))}
                </span>
              )}
            </p>
            <p className="pb-1 text-muted-foreground">{formatDate(atual.date, "EEE d MMM")}</p>
          </div>
          {meta.data && falta !== null && (
            <p className="mt-1 flex items-center gap-1.5 text-lg text-warning">
              <Target className="size-5" aria-hidden />
              Meta {fmt(meta.data)} kg
              {Math.abs(falta) >= 0.1 &&
                ` · ${fmt(Math.abs(falta))} kg para ${falta > 0 ? "perder" : "ganhar"}`}
            </p>
          )}
          {lista.length >= 2 && (
            <div className="mt-4 h-44">
              <LazyWeightChart
                data={lista.map((p, i) => ({
                  date: formatDate(p.date, "d MMM"),
                  peso: p.kg,
                  tendencia: Math.round(tendencia[i]! * 10) / 10,
                }))}
                goal={meta.data}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** Semanas seguidas na meta, a semana atual e o total. */
function SequenciaCard() {
  const today = todayISO();
  const routine = useQuery({
    queryKey: queryKeys.workouts.activeRoutine(),
    queryFn: fetchActiveRoutine,
  });
  const recentes = useQuery({
    queryKey: [...queryKeys.workouts.all, "completed-recent"],
    queryFn: () => {
      const inicio = startOfWeek(new Date(), { weekStartsOn: 1 });
      return fetchCompletedWorkouts(
        toISODate(addDays(inicio, -7 * 25)),
        toISODate(addDays(inicio, 6)),
      );
    },
  });
  const contagem = useQuery({
    queryKey: [...queryKeys.workouts.all, "counts"],
    queryFn: fetchWorkoutCounts,
  });

  const meta = routine.data?.daysPerWeek ?? 3;
  const datas = (recentes.data ?? []).map((w) => w.date);
  const semanas = weeklyStreak(datas, meta, today);
  const nestaSemana = datas.filter((d) => d >= weekStart(today)).length;

  return (
    <Link
      to="/workouts/calendar"
      className="flex items-center gap-4 rounded-[1.5rem] bg-card p-5 transition-colors hover:bg-elevated"
    >
      <Flame className="size-7 shrink-0 text-warning" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-3xl font-extrabold">
          {semanas} {semanas === 1 ? "semana seguida" : "semanas seguidas"}
        </span>
        <span className="block text-lg text-muted-foreground">
          {nestaSemana} / {meta} esta semana
          {contagem.data && ` · ${contagem.data.total} treinos no total`}
        </span>
      </span>
      <CalendarDays className="size-6 shrink-0" aria-label="Ver calendário" />
    </Link>
  );
}
