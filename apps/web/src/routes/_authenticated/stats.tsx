import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, startOfWeek } from "date-fns";
import { CalendarDays, Dumbbell, Flame, History, Scale, Trophy } from "lucide-react";
import { weeklyStreak } from "@forja/domain";
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
import { ActivityHeatmap } from "@/components/workouts/activity-heatmap";
import { RecoveryCard } from "@/components/workouts/progress-cards";
import { formatDate, formatDuration, toISODate, todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";

/**
 * Estatísticas: os números, a constância do ano e o corpo — o que foi
 * trabalhado, o que ainda recupera e onde a força subiu.
 */
export const Route = createFileRoute("/_authenticated/stats")({
  head: () => ({
    meta: [
      { title: "Estatísticas — Forja" },
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

  const sequencia = rotina.data
    ? weeklyStreak(
        (recentes.data ?? []).map((w) => w.date),
        rotina.data.daysPerWeek,
        hoje,
      )
    : 0;
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
        <div className="grid grid-cols-2 gap-3">
          <Numero icon={<Dumbbell />} rotulo="Treinos" valor={contagem.data?.total} />
          <Numero icon={<CalendarDays />} rotulo="Este mês" valor={contagem.data?.month} />
          <Numero
            icon={<Flame />}
            rotulo="Semanas seguidas"
            valor={rotina.isPending ? undefined : sequencia}
          />
          <Numero
            icon={<Scale />}
            rotulo="Peso 30 dias"
            valor={
              pesos.isPending
                ? undefined
                : variacao === null
                  ? "—"
                  : `${variacao > 0 ? "+" : ""}${variacao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`
            }
            destaque={variacao !== null && variacao !== 0}
          />
        </div>

        <h2 className="mb-3 mt-6 px-1 text-lg text-muted-foreground">
          Atividade — últimos 12 meses
        </h2>
        <ActivityHeatmap />

        <MusculosCard />

        <Historico />
      </PageBody>
    </>
  );
}

function Numero({
  icon,
  rotulo,
  valor,
  destaque = false,
}: {
  icon: ReactNode;
  rotulo: string;
  valor: number | string | undefined;
  destaque?: boolean;
}) {
  return (
    <div className="rounded-[1.25rem] bg-card p-4">
      <p className="flex items-center gap-2 text-muted-foreground [&_svg]:size-4">
        {icon}
        {rotulo}
      </p>
      {valor === undefined ? (
        <Skeleton className="mt-2 h-9 w-16" />
      ) : (
        <p className={cn("mt-1 text-4xl font-extrabold tabular-nums", destaque && "text-primary")}>
          {valor}
        </p>
      )}
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

  return (
    <section className="mt-6 rounded-[1.5rem] bg-card p-4" aria-label="Músculos">
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
        <div className="mt-4">
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
        <div className="mt-4">
          <RecoveryCard />
        </div>
      )}

      {aba === "forca" && (
        <div className="mt-4">
          {recordes.isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : (recordes.data ?? []).length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">
              Seus recordes aparecem aqui depois do primeiro treino com carga.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {(recordes.data ?? []).map((r) => (
                <li key={r.exerciseId}>
                  <Link
                    to="/exercises/$id"
                    params={{ id: r.exerciseId }}
                    className="flex items-center gap-3 py-3"
                  >
                    <Trophy className="size-5 shrink-0 text-warning" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.exerciseName}</span>
                      <span className="block text-sm text-muted-foreground">
                        {formatDate(r.date, "d 'de' MMM")} · 1RM estimado {Math.round(r.e1rm)} kg
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {r.weightKg.toLocaleString("pt-BR")} kg × {r.reps}
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

/** Últimos treinos. */
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

  return (
    <section className="mt-6" aria-labelledby="historico-titulo">
      <h2 id="historico-titulo" className="mb-3 px-1 text-lg text-muted-foreground">
        Últimos treinos
      </h2>
      {historico.isPending ? (
        <Skeleton className="h-32 w-full rounded-[1.25rem]" />
      ) : (historico.data ?? []).length === 0 ? (
        <p className="px-1 text-muted-foreground">Nenhum treino concluído ainda.</p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-[1.25rem] bg-card">
          {(historico.data ?? []).map((s) => (
            <li key={s.id}>
              <Link
                to="/workouts/session/$id"
                params={{ id: s.id }}
                className="flex items-center justify-between gap-3 px-4 py-3.5"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{s.name}</span>
                  <span className="block text-sm text-muted-foreground">
                    {formatDate(s.started_at, "EEE, d 'de' MMM")} ·{" "}
                    {formatDuration(s.duration_seconds)}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {Math.round(Number(s.total_volume_kg ?? 0)).toLocaleString("pt-BR")} kg
                </span>
              </Link>
            </li>
          ))}
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
            "flex-1 rounded-xl py-2.5 text-[15px] font-medium transition-colors",
            value === o.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
