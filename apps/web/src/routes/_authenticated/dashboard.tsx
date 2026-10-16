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
import { fetchGoalWeight, fetchWeighIns } from "@/data/body";
import { useCurrentUserId } from "@/hooks/use-current-user";
import { Skeleton } from "@/components/ui/skeleton";
import { CoachIcon } from "@/components/coach/coach-icon";
import { NoRoutineCard } from "@/components/home/today-workout-card";
import { WaterCard } from "@/components/home/water-card";
import { CoachTips } from "@/components/coach/coach-tips";
import { ReadinessCard } from "@/components/home/readiness-card";
import { CalorieRing, MACRO_COLORS } from "@/components/home/macro-rings";
import { LazyWeightChart } from "@/components/charts/lazy-chart";
import { formatDate, formatLongDate, fromISODate, toISODate, todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand-logo";
import { diasSeguidos } from "@/lib/streak";

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
      <header className="mb-6 flex flex-col items-center text-center">
        <h1>
          <BrandLogo className="h-12 justify-center" />
        </h1>
        <p className="mt-2 text-lg text-muted-foreground first-letter:uppercase">
          {formatLongDate(today).toLowerCase()}
        </p>
      </header>

      <div className="space-y-4">
        <SequenciaCard />
        {/* `data-tour`: âncoras do tutorial de boas-vindas. */}
        <div data-tour="home-semana">
          <SemanaCard />
        </div>
        <div data-tour="home-prontidao">
          <ReadinessCard />
        </div>
        <div data-tour="home-peso">
          <PesoCard />
        </div>
        <div data-tour="home-dieta">
          <DietaCard
            kcalTarget={num(profile.data?.daily_kcal_target)}
            proteinTarget={num(profile.data?.protein_g_target)}
            loadingProfile={profile.isPending}
          />
        </div>
        <WaterCard date={today} targetMl={num(profile.data?.water_ml_target, 2500)} />
        <Link
          to="/coach"
          className="flex items-center gap-4 rounded-[1.5rem] border border-primary/40 bg-primary/10 p-4 transition-colors hover:bg-primary/15"
        >
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <CoachIcon className="size-7" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xl font-bold">Treinador</span>
            <span className="block text-sm text-muted-foreground">
              Pergunte sobre seu treino, dieta e progresso
            </span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-primary" aria-hidden />
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
  // Dia escolhido na faixa da semana; o painel de baixo mostra os treinos dele.
  const [selecionado, setSelecionado] = useState(today);

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
  // Sem rotina ou com o plano em branco: convite a montar, não "Descanso".
  if (!routine.data || routine.data.templates.length === 0) return <NoRoutineCard />;

  const r = routine.data;
  const entrada = scheduleInputOf(r);
  const feitos = recentes.data ?? [];

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
          const eHoje = dia === today;
          return (
            <li key={dia}>
              <button
                type="button"
                onClick={() => setSelecionado(dia)}
                aria-pressed={dia === selecionado}
                className="flex w-full flex-col items-center gap-1"
              >
                <span className="text-sm text-muted-foreground">{INICIAIS[weekdayOf(dia)]}</span>
                <span
                  className={cn(
                    "grid size-11 place-items-center rounded-full text-xl tabular-nums transition-colors",
                    eHoje && "bg-primary font-extrabold text-primary-foreground",
                    !eHoje && dia === selecionado && "bg-elevated font-bold ring-2 ring-primary",
                  )}
                  aria-current={eHoje ? "date" : undefined}
                >
                  {Number(dia.slice(8))}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {selecionado !== today ? (
        <DiaEscolhido
          dia={selecionado}
          hoje={today}
          feitos={feitos.filter((w) => w.date === selecionado)}
          previsto={(() => {
            const i = projectSchedule([selecionado], today, entrada, feitos)[0]?.splitIndex;
            return i != null ? (r.templates[i]?.name.replace(/^[A-Z]\s*—\s*/, "") ?? null) : null;
          })()}
        />
      ) : (
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
      )}
    </section>
  );
}

/** O que houve (ou está previsto) num dia que não é hoje. */
function DiaEscolhido({
  dia,
  hoje,
  feitos,
  previsto,
}: {
  dia: string;
  hoje: string;
  feitos: { sessionId: string; name: string }[];
  previsto: string | null;
}) {
  const passado = dia < hoje;
  return (
    <div className="mt-4 rounded-2xl bg-elevated p-4 animate-in fade-in duration-200">
      <p className="text-sm uppercase tracking-wide text-muted-foreground first-letter:uppercase">
        {formatDate(dia, "EEEE, d 'de' MMM")}
      </p>
      {feitos.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {feitos.map((w) => (
            <li key={w.sessionId}>
              <Link
                to="/workouts/session/$id"
                params={{ id: w.sessionId }}
                className="flex items-center gap-3"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
                  <Check className="size-5" strokeWidth={3} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-lg">
                    {w.name.replace(/^[A-Z]\s*—\s*/, "")}
                  </span>
                  <span className="block text-sm text-muted-foreground">Treino concluído</span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-2 flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
            {previsto && !passado ? (
              <Dumbbell className="size-5" aria-hidden />
            ) : (
              <Moon className="size-5" aria-hidden />
            )}
          </span>
          <p className="min-w-0 flex-1 truncate text-lg">
            {passado
              ? previsto
                ? `Não treinou · era ${previsto}`
                : "Descanso"
              : previsto
                ? `Previsto: ${previsto}`
                : "Descanso"}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * A dieta do dia em uma linha: kcal e proteína — contra a meta, se a pessoa
 * definiu uma; sem meta, só o consumido. Dia vazio convida a montar a dieta.
 */
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

  const pctProteina =
    proteinTarget > 0 ? Math.min(100, (totais.proteinG / proteinTarget) * 100) : 0;
  const restante = Math.round(kcalTarget - totais.kcal);
  const semMeta = kcalTarget <= 0;
  const vazio = !diario.isPending && (diario.data ?? []).length === 0;

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
            {semMeta ? " kcal hoje" : ` / ${Math.round(kcalTarget).toLocaleString("pt-BR")} kcal`}
          </span>
        </p>
        {vazio ? (
          <p className="mt-1.5 text-pretty text-sm text-muted-foreground">
            Nada registrado ainda. Monte suas refeições e adicione o que comer.
          </p>
        ) : semMeta ? (
          <p className="mt-1.5 text-sm text-muted-foreground tabular-nums">
            Proteína: {Math.round(totais.proteinG)} g
          </p>
        ) : (
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
        )}
        {!diario.isPending && pendentes > 0 && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {!semMeta && restante > 0 ? `Faltam ${restante.toLocaleString("pt-BR")} kcal · ` : ""}
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
  const r = routine.data;
  const treinou = new Set((recentes.data ?? []).map((w) => w.date));
  // Dias de treino do plano: na semana fixa, os dias das rotinas; na rotação,
  // os dias escolhidos.
  const diasDoPlano = new Set(
    r
      ? r.scheduleMode === "fixed"
        ? r.templates.flatMap((t) => t.weekdays)
        : r.trainingWeekdays
      : [],
  );
  const dias = diasSeguidos(treinou, (wd) => diasDoPlano.has(wd), today);
  const aceso = dias > 0;
  const semana = Array.from({ length: 7 }, (_, i) =>
    toISODate(addDays(fromISODate(weekStart(today)), i)),
  );

  return (
    <Link
      to="/workouts/calendar"
      className="relative block rounded-[1.5rem] border border-border bg-card p-5 transition-colors hover:bg-elevated"
      aria-label={`${dias} ${dias === 1 ? "dia seguido" : "dias seguidos"} de treino. Ver calendário`}
    >
      <CalendarDays className="absolute right-4 top-4 size-5 text-muted-foreground" aria-hidden />
      {/* Fogo e, ao lado, número e legenda — alinhados à esquerda do card. */}
      <div className="flex items-center">
        <Flame
          className={cn(
            "size-20 shrink-0 transition-colors duration-500",
            aceso ? "fill-[#FFB01F] text-[#FF5A1F]" : "fill-muted text-muted-foreground/40",
          )}
          strokeWidth={1.5}
          aria-hidden
        />
        <div className="min-w-0 text-left">
          <p className="text-6xl font-extrabold leading-none tabular-nums">{dias}</p>
          <p className="text-lg font-semibold">{dias === 1 ? "dia seguido" : "dias seguidos"}</p>
        </div>
      </div>

      {/* A semana: laranja nos dias treinados, anel no dia de hoje. */}
      <div className="mt-4 grid grid-cols-7 gap-1.5" aria-hidden>
        {semana.map((d) => (
          <span key={d} className="flex flex-col items-center gap-1">
            <span
              className={cn(
                "h-1.5 w-full rounded-full",
                treinou.has(d) ? "bg-[#FF7A1F]" : "bg-muted",
                d === today && !treinou.has(d) && "ring-1 ring-[#FF7A1F]/60",
              )}
            />
            <span
              className={cn(
                "text-[10px] font-bold",
                d === today ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {INICIAIS[weekdayOf(d)].charAt(0)}
            </span>
          </span>
        ))}
      </div>
    </Link>
  );
}
