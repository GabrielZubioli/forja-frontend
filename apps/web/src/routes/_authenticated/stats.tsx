import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, startOfWeek } from "date-fns";
import { CalendarDays, Dumbbell, Flame, History, Scale, Trophy } from "lucide-react";
import { queryKeys } from "@/data/query-keys";
import { errorMessage, unwrapList } from "@/data/supabase-helpers";
import { supabase } from "@/integrations/supabase/client";
import { fetchActiveRoutine, fetchCompletedWorkouts } from "@/data/routines";
import { fetchMuscleSetEntries, fetchPersonalRecords } from "@/data/workouts";
import { fetchWeighIns, fetchWorkoutCounts } from "@/data/body";
import { PageBody, PageHeader, headerIconClass } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/query-boundary";
import { BodyMap } from "@/components/body-map/body-map";
import { LazyWeeklyChart } from "@/components/charts/lazy-chart";
import { ActivityHeatmap } from "@/components/workouts/activity-heatmap";
import { RecoveryCard } from "@/components/workouts/progress-cards";
import { formatDate, formatDuration, toISODate, todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";
import { diasSeguidos } from "@/lib/streak";

/**
 * Estatísticas: os números, a constância do ano e o corpo — o que foi
 * trabalhado, o que ainda recupera e onde a força subiu.
 */
export const Route = createFileRoute("/_authenticated/stats")({
  head: () => ({
    meta: [
      { title: "Estatísticas — Habitual Fit" },
      { name: "description", content: "Progresso e histórico de treino." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StatsPage,
});

function StatsPage() {
  const hoje = todayISO();

  const contagem = useQuery({
    queryKey: [...queryKeys.workouts.all, "counts"],
    queryFn: fetchWorkoutCounts,
  });
  const rotina = useQuery({
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
  const pesos = useQuery({
    queryKey: [...queryKeys.body.all, "weigh-ins", 30],
    queryFn: () => fetchWeighIns(30),
  });

  const r = rotina.data;
  const diasDoPlano = new Set(
    r
      ? r.scheduleMode === "fixed"
        ? r.templates.flatMap((t) => t.weekdays)
        : r.trainingWeekdays
      : [],
  );
  const sequencia = diasSeguidos(
    new Set((recentes.data ?? []).map((w) => w.date)),
    (wd) => diasDoPlano.has(wd),
    hoje,
  );

  // Últimas 12 semanas (segunda a domingo), da mais antiga à atual.
  const semanas = useMemo(() => {
    const atual = startOfWeek(new Date(), { weekStartsOn: 1 });
    return Array.from({ length: 12 }, (_, i) => {
      const ini = toISODate(addDays(atual, -7 * (11 - i)));
      const fim = toISODate(addDays(atual, -7 * (11 - i) + 6));
      return {
        semana: formatDate(ini, "d/MM"),
        treinos: (recentes.data ?? []).filter((w) => w.date >= ini && w.date <= fim).length,
      };
    });
  }, [recentes.data]);
  const estaSemana = semanas[semanas.length - 1]!.treinos;
  const meta = rotina.data?.daysPerWeek ?? null;

  const variacao =
    pesos.data && pesos.data.length >= 2
      ? pesos.data[pesos.data.length - 1]!.kg - pesos.data[0]!.kg
      : null;

  return (
    <>
      <PageHeader
        title="Estatísticas"
        description="Progresso e histórico"
        action={
          <Link
            to="/workouts/calendar"
            className={headerIconClass}
            aria-label="Calendário de treinos"
          >
            <History />
          </Link>
        }
      />
      <PageBody>
        {/* Herói: a semana atual contra a meta e as últimas 12 semanas. */}
        <section
          className="animate-in fade-in duration-500"
          aria-label="Constância"
          data-tour="stats-semana"
        >
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                Esta semana
              </p>
              {recentes.isPending ? (
                <Skeleton className="mt-2 h-12 w-24" />
              ) : (
                <p className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-6xl font-extrabold leading-none tabular-nums">
                    {estaSemana}
                  </span>
                  {meta ? (
                    <span className="text-xl font-bold text-muted-foreground">/ {meta}</span>
                  ) : null}
                  <span className="ml-1 text-sm text-muted-foreground">treinos</span>
                </p>
              )}
            </div>
            <span
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-extrabold",
                sequencia > 0 ? "bg-[#FF7A1F]/15 text-[#FF7A1F]" : "bg-muted text-muted-foreground",
              )}
            >
              <Flame className={cn("size-4", sequencia > 0 && "fill-[#FFB01F]")} aria-hidden />
              {rotina.isPending ? "…" : sequencia} {sequencia === 1 ? "dia" : "dias"}
            </span>
          </div>
          {meta && !recentes.isPending ? (
            <div
              className="relative mt-4 h-2 overflow-hidden rounded-full bg-primary/15"
              role="progressbar"
              aria-valuenow={estaSemana}
              aria-valuemax={meta}
              aria-label="Meta da semana"
            >
              <div
                className="hf-cresce h-full rounded-full bg-primary"
                style={{ width: `${Math.min(100, (estaSemana / meta) * 100)}%` }}
              />
            </div>
          ) : null}
          <div className="relative mt-4 h-40">
            {recentes.isPending ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <LazyWeeklyChart data={semanas} goal={meta} />
            )}
          </div>
          <p className="relative mt-1 text-center text-xs text-muted-foreground">
            Treinos por semana · toque nas barras
          </p>
        </section>

        <div className="mt-6 grid grid-cols-3 divide-x divide-border border-y border-border py-4">
          <Numero
            icon={<Dumbbell />}
            rotulo="Treinos"
            valor={contagem.data?.total}
            solido
            indice={0}
          />
          <Numero
            icon={<CalendarDays />}
            rotulo="Este mês"
            valor={contagem.data?.month}
            indice={1}
          />
          <Numero
            icon={<Scale />}
            rotulo="Peso 30d"
            valor={
              pesos.isPending
                ? undefined
                : variacao === null
                  ? "—"
                  : `${variacao > 0 ? "+" : ""}${variacao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}`
            }
            unidade={variacao === null ? undefined : "kg"}
            indice={2}
          />
        </div>

        <Titulo>Atividade — últimos 12 meses</Titulo>
        <ActivityHeatmap />

        <MusculosCard />

        <Historico />
      </PageBody>
    </>
  );
}

function Titulo({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="mb-3 mt-7 flex items-center gap-2 px-1 text-lg font-bold">
      <span className="h-5 w-1.5 rounded-full bg-primary" aria-hidden />
      {children}
    </h2>
  );
}

function Numero({
  icon,
  rotulo,
  valor,
  unidade,
  solido = false,
  indice,
}: {
  icon: ReactNode;
  rotulo: string;
  valor: number | string | undefined;
  unidade?: string;
  /** O número principal da faixa: em verde. */
  solido?: boolean;
  indice: number;
}) {
  return (
    <div
      className="px-2 text-center animate-in fade-in fill-mode-backwards duration-500"
      style={{ animationDelay: `${120 + indice * 80}ms` }}
    >
      {valor === undefined ? (
        <Skeleton className="mx-auto h-8 w-12" />
      ) : (
        <p
          className={cn(
            "text-3xl font-extrabold leading-none tabular-nums",
            solido && "text-primary",
          )}
        >
          {valor}
          {unidade ? (
            <span className="ml-0.5 text-sm font-bold text-muted-foreground">{unidade}</span>
          ) : null}
        </p>
      )}
      <p className="mt-1.5 flex items-center justify-center gap-1 text-xs font-medium text-muted-foreground [&_svg]:size-3.5">
        {icon}
        {rotulo}
      </p>
    </div>
  );
}

const PERIODOS = [
  { value: 1, label: "Semana" },
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
] as const;

/** Equilíbrio muscular (séries por músculo), fadiga e força, numa aba só. */
function MusculosCard() {
  const [aba, setAba] = useState<"equilibrio" | "fadiga" | "forca">("equilibrio");
  const [periodo, setPeriodo] = useState<number>(30);

  const series = useQuery({
    queryKey: queryKeys.workouts.muscleSets(),
    queryFn: () => fetchMuscleSetEntries(13),
  });
  const recordes = useQuery({
    queryKey: queryKeys.workouts.personalRecords(),
    queryFn: () => fetchPersonalRecords(20),
  });

  const porMusculo = useMemo(() => {
    const corte =
      periodo === 1
        ? toISODate(startOfWeek(new Date(), { weekStartsOn: 1 }))
        : toISODate(addDays(new Date(), -periodo));
    const soma = new Map<string, number>();
    for (const e of series.data ?? []) {
      if (e.day >= corte) soma.set(e.muscle, (soma.get(e.muscle) ?? 0) + e.sets);
    }
    const max = Math.max(1, ...soma.values());
    return [...soma].map(([muscle, sets]) => ({ muscle, intensity: sets / max, sets }));
  }, [series.data, periodo]);

  const maxRecorde = Math.max(1, ...(recordes.data ?? []).map((r) => r.e1rm));

  return (
    <section aria-label="Músculos">
      <Titulo>Músculos</Titulo>
      <Abas
        value={aba}
        onChange={setAba}
        options={[
          { value: "equilibrio", label: "Equilíbrio" },
          { value: "fadiga", label: "Fadiga" },
          { value: "forca", label: "Força" },
        ]}
      />

      {aba === "equilibrio" && (
        <div className="mt-4 animate-in fade-in duration-300">
          <p className="mb-3 text-muted-foreground">Equilíbrio muscular · por séries feitas</p>
          <Abas
            value={periodo}
            onChange={setPeriodo}
            options={PERIODOS.map((p) => ({ value: p.value, label: p.label }))}
          />
          {series.isPending ? (
            <Skeleton className="mt-4 h-64 w-full" />
          ) : series.isError ? (
            <ErrorState message={errorMessage(series.error)} onRetry={series.refetch} compact />
          ) : porMusculo.length === 0 ? (
            <p className="mt-6 text-center text-muted-foreground">Nenhuma série neste período.</p>
          ) : (
            <div className="mt-4 flex justify-center">
              <BodyMap muscles={porMusculo} size="lg" showLegend={false} />
            </div>
          )}
        </div>
      )}

      {aba === "fadiga" && (
        <div className="mt-4 animate-in fade-in duration-300">
          <RecoveryCard />
        </div>
      )}

      {aba === "forca" && (
        <div className="mt-4 animate-in fade-in duration-300">
          {recordes.isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : (recordes.data ?? []).length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">
              Seus recordes aparecem aqui depois do primeiro treino com carga.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {(recordes.data ?? []).map((r, i) => (
                <li
                  key={r.exerciseId}
                  className="animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards duration-300"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <Link
                    to="/exercises/$id"
                    params={{ id: r.exerciseId }}
                    className="block py-3 transition-colors hover:bg-primary/5"
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className={cn(
                          "grid size-9 shrink-0 place-items-center rounded-xl",
                          i === 0 ? "bg-[#01D798] text-[#020306]" : "bg-primary/15 text-primary",
                        )}
                      >
                        <Trophy className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{r.exerciseName}</span>
                        <span className="block text-xs text-muted-foreground">
                          {formatDate(r.date, "d 'de' MMM")} · {r.weightKg.toLocaleString("pt-BR")}{" "}
                          kg × {r.reps}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-lg font-extrabold leading-none tabular-nums text-primary">
                          {Math.round(r.e1rm)}
                        </span>
                        <span className="text-[10px] font-medium uppercase text-muted-foreground">
                          1RM kg
                        </span>
                      </span>
                    </span>
                    <span className="mt-2.5 block h-1.5 overflow-hidden rounded-full bg-primary/10">
                      <span
                        className="hf-cresce block h-full rounded-full bg-primary"
                        style={{
                          width: `${(r.e1rm / maxRecorde) * 100}%`,
                          animationDelay: `${150 + i * 40}ms`,
                        }}
                      />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/** Últimos treinos, com o volume de cada um comparado ao maior da lista. */
function Historico() {
  const historico = useQuery({
    queryKey: queryKeys.workouts.history(),
    queryFn: async () =>
      unwrapList(
        "carregar histórico",
        await supabase
          .from("workout_sessions")
          .select("id, name, started_at, duration_seconds, total_volume_kg")
          .is("deleted_at", null)
          .not("ended_at", "is", null)
          .order("started_at", { ascending: false })
          .limit(10),
      ),
  });
  const lista = historico.data ?? [];
  const maxVolume = Math.max(1, ...lista.map((s) => Number(s.total_volume_kg ?? 0)));

  return (
    <section aria-labelledby="historico-titulo" data-tour="stats-treinos">
      <Titulo id="historico-titulo">Últimos treinos</Titulo>
      {historico.isPending ? (
        <Skeleton className="h-32 w-full rounded-[1.25rem]" />
      ) : lista.length === 0 ? (
        <p className="px-1 text-muted-foreground">Nenhum treino concluído ainda.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {lista.map((s, i) => {
            const volume = Number(s.total_volume_kg ?? 0);
            return (
              <li
                key={s.id}
                className="animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards duration-300"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <Link
                  to="/workouts/session/$id"
                  params={{ id: s.id }}
                  className="flex items-center gap-3 py-3.5 transition-colors hover:bg-primary/5"
                >
                  <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/15 leading-none text-primary">
                    <span className="text-base font-extrabold">
                      {formatDate(s.started_at, "d")}
                    </span>
                    <span className="text-[10px] font-bold uppercase">
                      {formatDate(s.started_at, "MMM")}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-semibold">{s.name}</span>
                      <span className="shrink-0 text-sm font-bold tabular-nums">
                        {Math.round(volume).toLocaleString("pt-BR")} kg
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs capitalize text-muted-foreground">
                      {formatDate(s.started_at, "EEEE")} · {formatDuration(s.duration_seconds)}
                    </span>
                    <span className="mt-2 block h-1 overflow-hidden rounded-full bg-primary/10">
                      <span
                        className="hf-cresce block h-full rounded-full bg-primary"
                        style={{
                          width: `${(volume / maxVolume) * 100}%`,
                          animationDelay: `${150 + i * 40}ms`,
                        }}
                      />
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Abas<T extends string | number>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div role="tablist" className="flex rounded-2xl bg-elevated p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 rounded-xl py-2.5 text-[15px] font-medium transition-all duration-300",
            value === o.value
              ? "bg-primary font-bold text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
