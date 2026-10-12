import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { addDays, startOfWeek } from "date-fns";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Check,
  Play,
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
import { CalorieRing, MACRO_COLORS } from "@/components/home/macro-rings";
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

function saudacao(): string {
  const h = new Date().getHours();
  return h < 5 ? "Boa noite" : h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function Home() {
  const today = todayISO();

  const profile = useQuery({
    queryKey: queryKeys.profile(),
    queryFn: async () =>
      unwrapMaybe("carregar perfil", await supabase.from("profiles").select("*").maybeSingle()),
  });
  const primeiroNome = profile.data?.display_name?.trim().split(/\s+/)[0];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-8 pt-6 md:px-8 md:pt-8">
      <header className="mb-6 flex flex-col items-center text-center">
        <h1>
          <BrandLogo className="h-12 justify-center" />
        </h1>
        <p className="mt-4 text-2xl font-extrabold">
          {saudacao()}
          {primeiroNome ? `, ${primeiroNome}` : ""}
        </p>
        <p className="text-muted-foreground first-letter:uppercase">
          {formatLongDate(today).toLowerCase()}
        </p>
      </header>

      <div className="space-y-3">
        <SemanaCard />
        <SequenciaCard />
        <DietaCard
          kcalTarget={num(profile.data?.daily_kcal_target)}
          proteinTarget={num(profile.data?.protein_g_target)}
          loadingProfile={profile.isPending}
        />
        <WaterCard date={today} targetMl={num(profile.data?.water_ml_target, 2500)} />
        <PesoCard />
        <Link
          to="/coach"
          className="flex items-center gap-3.5 rounded-[1.5rem] border border-border p-4 transition-colors hover:bg-card"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary">
            <CoachIcon className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">Pergunte ao Treinador</span>
            <span className="block text-sm text-muted-foreground">
              Treino de hoje, calorias, recordes e mais
            </span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
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

  const nomeHoje = template?.name.replace(/^[A-Z]\s*—\s*/, "") ?? "";
  const treinoHoje = isPlannedDay && template && !alreadyDone;

  return (
    <section className="overflow-hidden rounded-[1.75rem] bg-card" aria-label="Semana de treino">
      <div className="p-5 pb-4">
        <div className="mb-4 flex items-center justify-between">
          <p className="font-bold">{titulo}</p>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setOffset((o) => o - 1)}
              aria-label="Semana anterior"
              className="grid size-8 place-items-center rounded-full bg-elevated hover:bg-muted"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setOffset((o) => o + 1)}
              aria-label="Próxima semana"
              className="grid size-8 place-items-center rounded-full bg-elevated hover:bg-muted"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>

        <ol className="grid grid-cols-7 gap-1 text-center">
          {dias.map((dia, i) => {
            const p = projecao[i]!;
            const eHoje = dia === today;
            const treinou = treinados.has(dia);
            const planejado = !treinou && p.splitIndex !== null && dia >= today;
            return (
              <li key={dia} className="flex flex-col items-center gap-1.5">
                <span
                  className={cn(
                    "text-[11px] font-bold",
                    eHoje ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {INICIAIS[weekdayOf(dia)]}
                </span>
                <span
                  className={cn(
                    "grid size-10 place-items-center rounded-full text-base font-bold tabular-nums",
                    treinou
                      ? "bg-primary text-primary-foreground"
                      : eHoje
                        ? "border-2 border-primary text-primary"
                        : planejado
                          ? "border-2 border-dashed border-muted-foreground/35"
                          : "text-muted-foreground",
                  )}
                  aria-current={eHoje ? "date" : undefined}
                  aria-label={`${Number(dia.slice(8))}${treinou ? ", treinou" : planejado ? ", treino previsto" : ""}`}
                >
                  {treinou ? <Check className="size-4" strokeWidth={3} /> : Number(dia.slice(8))}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {treinoHoje ? (
        <div className="bg-primary p-5 text-primary-foreground">
          <p className="text-xs font-bold uppercase tracking-[0.14em] opacity-75">Treino de hoje</p>
          <p className="mt-1 truncate text-2xl font-extrabold">{nomeHoje}</p>
          <p className="text-sm font-medium opacity-75">
            {template.exerciseCount} {template.exerciseCount === 1 ? "exercício" : "exercícios"}
          </p>
          <button
            type="button"
            onClick={() => comecar.mutate(template.id)}
            disabled={comecar.isPending}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#020306] font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
          >
            <Play className="size-4 fill-current" aria-hidden />
            Começar treino
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3.5 border-t border-border/60 p-5">
          <span
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-2xl",
              alreadyDone ? "bg-primary text-primary-foreground" : "bg-elevated text-muted-foreground",
            )}
          >
            {alreadyDone ? (
              <Check className="size-5" strokeWidth={3} aria-hidden />
            ) : (
              <Moon className="size-5" aria-hidden />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold">{alreadyDone ? "Treino de hoje feito" : "Dia de descanso"}</p>
            <p className="truncate text-sm text-muted-foreground">
              {alreadyDone
                ? "Bom trabalho — recuperação também conta."
                : proximo
                  ? `Próximo treino: ${WEEKDAY_LABELS[proximo.weekday].toLowerCase()}`
                  : "Aproveite para recuperar."}
            </p>
          </div>
          {template && !alreadyDone && (
            <button
              type="button"
              onClick={() => comecar.mutate(template.id)}
              disabled={comecar.isPending}
              className="shrink-0 rounded-full border border-border px-3.5 py-2 text-sm font-semibold disabled:opacity-60"
            >
              Treinar
            </button>
          )}
        </div>
      )}
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

  const pctProteina = proteinTarget > 0 ? Math.min(100, (totais.proteinG / proteinTarget) * 100) : 0;
  const restante = Math.round(kcalTarget - totais.kcal);

  return (
    <Link
      to="/diet"
      className="flex items-center gap-4 rounded-[1.5rem] bg-card p-4 transition-colors hover:bg-elevated"
      aria-label="Abrir a dieta de hoje"
    >
      {diario.isPending || loadingProfile ? (
        <Skeleton className="size-[88px] shrink-0 rounded-full" />
      ) : (
        <div className="w-[88px] shrink-0">
          <CalorieRing consumed={totais.kcal} target={kcalTarget} size={88} compacto />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
          <Utensils className="size-3.5" aria-hidden />
          Dieta de hoje
        </p>
        <p className="mt-1 text-lg font-extrabold tabular-nums">
          {Math.round(totais.kcal).toLocaleString("pt-BR")}
          <span className="text-sm font-medium text-muted-foreground">
            {" "}
            / {Math.round(kcalTarget).toLocaleString("pt-BR")} kcal
          </span>
        </p>
        <div className="mt-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Proteína</span>
            <span className="tabular-nums">
              {Math.round(totais.proteinG)}/{Math.round(proteinTarget)} g
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div
              className="h-full rounded-full transition-[width] duration-700"
              style={{ width: `${pctProteina}%`, background: MACRO_COLORS.protein }}
            />
          </div>
        </div>
        {!diario.isPending && pendentes > 0 && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {restante > 0 ? `Faltam ${restante.toLocaleString("pt-BR")} kcal · ` : ""}
            {pendentes} {pendentes === 1 ? "item" : "itens"} a marcar
          </p>
        )}
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
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

  const tiles = [
    {
      icone: Flame,
      valor: semanas,
      rotulo: semanas === 1 ? "semana seguida" : "semanas seguidas",
      destaque: true,
    },
    { icone: CalendarDays, valor: `${nestaSemana}/${meta}`, rotulo: "esta semana", destaque: false },
    { icone: Dumbbell, valor: contagem.data?.total ?? "–", rotulo: "treinos no total", destaque: false },
  ];

  return (
    <Link
      to="/workouts/calendar"
      className="grid grid-cols-3 gap-2.5"
      aria-label="Ver calendário de treinos"
    >
      {tiles.map((t) => (
        <span
          key={t.rotulo}
          className={cn(
            "rounded-[1.25rem] p-3.5",
            t.destaque ? "bg-primary text-primary-foreground" : "bg-card",
          )}
        >
          <t.icone className={cn("size-4", t.destaque ? "opacity-80" : "text-primary")} aria-hidden />
          <span className="mt-2 block text-2xl font-extrabold leading-none tabular-nums">
            {t.valor}
          </span>
          <span
            className={cn(
              "mt-1 block text-[11px] font-medium leading-tight",
              t.destaque ? "opacity-75" : "text-muted-foreground",
            )}
          >
            {t.rotulo}
          </span>
        </span>
      ))}
    </Link>
  );
}
