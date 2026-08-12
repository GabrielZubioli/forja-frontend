import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowLeft, Flag, TrendingUp } from "lucide-react";
import { ExerciseDemoButton } from "@/components/exercise-demo";
import { ExerciseHowTo } from "@/components/workouts/exercise-how-to";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage, num, unwrap, unwrapList } from "@/data/supabase-helpers";
import { useCurrentUserId } from "@/hooks/use-current-user";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartSkeleton, EmptyState, ErrorState } from "@/components/query-boundary";
import { CATEGORY_LABELS, EQUIPMENT_LABELS, MUSCLE_LABELS, label } from "@/lib/labels";
import { formatDayMonth, formatShortDate, toISODate } from "@/lib/date";
import { countsTowardVolume, epley1RM, setVolume } from "@forja/domain";
import { subDays } from "date-fns";

export const Route = createFileRoute("/_authenticated/exercises_/$id")({
  head: () => ({
    meta: [
      { title: "Histórico do exercício — Forja" },
      { name: "description", content: "Progressão de carga, volume e recordes por exercício." },
    ],
  }),
  component: ExerciseDetail,
});

const PERIODS = [
  { value: "90", label: "3 meses" },
  { value: "180", label: "6 meses" },
  { value: "365", label: "1 ano" },
  { value: "all", label: "Tudo" },
] as const;

type Period = (typeof PERIODS)[number]["value"];

type SessionSummary = {
  sessionId: string;
  date: string;
  /** Melhor 1RM estimado da sessão. */
  bestE1rm: number;
  /** Tonelagem do exercício naquela sessão. */
  volume: number;
  /** Melhor série (a de maior e1RM), para exibir "80 kg × 8". */
  bestSet: { weight: number; reps: number } | null;
  workingSets: number;
  hasPr: boolean;
};

function ExerciseDetail() {
  const { id } = Route.useParams();
  const userId = useCurrentUserId();
  const [period, setPeriod] = useState<Period>("180");

  const exercise = useQuery({
    queryKey: ["exercise", id],
    queryFn: async () =>
      unwrap(
        "carregar exercício",
        await supabase
          .from("exercises")
          .select(
            "id, name, primary_muscle, secondary_muscles, equipment, category, level, mechanic, execution, instructions, execution_en, cues, common_mistakes, contraindications, image_urls, external_id, media_id, media_ref, media_source, video_url",
          )
          .eq("id", id)
          .single(),
      ),
  });

  const history = useQuery({
    queryKey: ["exercise-history", id, period],
    queryFn: async () => {
      let query = supabase
        .from("workout_sets")
        .select(
          "id, weight_kg, reps, set_type, completed, is_pr, session_id, workout_sessions!inner(id, user_id, started_at, deleted_at)",
        )
        .eq("exercise_id", id)
        .eq("workout_sessions.user_id", userId)
        .is("workout_sessions.deleted_at", null)
        .order("created_at");

      if (period !== "all") {
        const from = toISODate(subDays(new Date(), Number(period)));
        query = query.gte("workout_sessions.started_at", `${from}T00:00:00`);
      }

      return unwrapList("carregar histórico do exercício", await query);
    },
  });

  /**
   * Agrega as séries por sessão. Só séries válidas (concluídas, não-aquecimento)
   * entram nas métricas — a mesma regra usada na sessão ao vivo e no dashboard.
   */
  const sessions = useMemo<SessionSummary[]>(() => {
    const bySession = new Map<string, SessionSummary>();

    for (const set of history.data ?? []) {
      const parent = set.workout_sessions;
      if (!parent) continue;
      if (
        !countsTowardVolume({
          weightKg: set.weight_kg,
          reps: set.reps,
          setType: set.set_type,
          completed: set.completed,
        })
      ) {
        continue;
      }

      const weight = num(set.weight_kg);
      const reps = num(set.reps);
      if (weight <= 0 || reps <= 0) continue;

      const current = bySession.get(parent.id) ?? {
        sessionId: parent.id,
        date: parent.started_at,
        bestE1rm: 0,
        volume: 0,
        bestSet: null,
        workingSets: 0,
        hasPr: false,
      };

      const e1rm = epley1RM(weight, reps);
      current.volume += setVolume(weight, reps);
      current.workingSets += 1;
      current.hasPr = current.hasPr || Boolean(set.is_pr);
      if (e1rm > current.bestE1rm) {
        current.bestE1rm = e1rm;
        current.bestSet = { weight, reps };
      }

      bySession.set(parent.id, current);
    }

    return Array.from(bySession.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
  }, [history.data]);

  const chartData = sessions.map((s) => ({
    date: formatDayMonth(s.date),
    e1rm: Number(s.bestE1rm.toFixed(1)),
    volume: Math.round(s.volume),
  }));

  const recorde = sessions.reduce<SessionSummary | null>(
    (best, s) => (!best || s.bestE1rm > best.bestE1rm ? s : best),
    null,
  );
  const primeiro = sessions[0];
  const ultimo = sessions.at(-1);
  const ganho =
    primeiro && ultimo && primeiro.bestE1rm > 0
      ? ((ultimo.bestE1rm - primeiro.bestE1rm) / primeiro.bestE1rm) * 100
      : null;

  if (exercise.isError) {
    return (
      <>
        <PageHeader title="Exercício" description="" />
        <PageBody>
          <ErrorState message={errorMessage(exercise.error)} onRetry={exercise.refetch} />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={exercise.isPending ? "Carregando…" : exercise.data.name}
        description="Progressão de carga, volume e recordes."
        action={
          <>
            {!exercise.isPending && <ExerciseDemoButton exerciseName={exercise.data.name} />}
            <Button variant="outline" asChild>
              <Link to="/exercises">
                <ArrowLeft className="mr-1 size-4" />
                Biblioteca
              </Link>
            </Button>
          </>
        }
      />
      <PageBody>
        {/*
          A execução vem antes do histórico.
          Quem abre a ficha de um exercício que não conhece precisa saber como
          se faz; quem já treina há meses rola até a progressão. A ordem
          inversa atendia só o segundo grupo — e mal, porque o primeiro não
          tinha o que fazer na tela.
        */}
        {exercise.isPending ? (
          <Skeleton className="mb-4 h-64 w-full rounded-xl" />
        ) : (
          <div className="mb-4">
            <ExerciseHowTo exercise={exercise.data} />
          </div>
        )}

        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Seu histórico
        </h2>

        <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)} className="mb-4">
          <TabsList>
            {PERIODS.map((p) => (
              <TabsTrigger key={p.value} value={p.value}>
                {p.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {history.isPending ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-24 w-full rounded-lg" />
              ))}
            </div>
            <ChartSkeleton className="h-64" />
          </div>
        ) : history.isError ? (
          <ErrorState message={errorMessage(history.error)} onRetry={history.refetch} />
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={<TrendingUp className="size-6" />}
            title="Sem registros neste período"
            description="Assim que você registrar séries válidas deste exercício, a progressão de carga aparece aqui."
            action={
              <Button asChild>
                <Link to="/workouts">Iniciar treino</Link>
              </Button>
            }
          />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Stat
                label="Recorde (1RM estimado)"
                value={recorde ? `${recorde.bestE1rm.toFixed(1)} kg` : "—"}
                sub={
                  recorde?.bestSet
                    ? `${recorde.bestSet.weight} kg × ${recorde.bestSet.reps} · ${formatShortDate(recorde.date)}`
                    : ""
                }
              />
              <Stat
                label="Sessões no período"
                value={String(sessions.length)}
                sub={`${sessions.reduce((n, s) => n + s.workingSets, 0)} séries válidas`}
              />
              <Stat
                label="Evolução"
                value={ganho === null ? "—" : `${ganho >= 0 ? "+" : ""}${ganho.toFixed(1)}%`}
                sub="1RM estimado, início vs. fim"
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Progressão de carga (1RM estimado)</CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="e1rmFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" fontSize={11} stroke="var(--muted-foreground)" />
                    <YAxis
                      fontSize={11}
                      stroke="var(--muted-foreground)"
                      domain={["auto", "auto"]}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        color: "var(--card-foreground)",
                      }}
                      formatter={(value: number) => [`${value} kg`, "1RM estimado"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="e1rm"
                      stroke="var(--primary)"
                      strokeWidth={2.5}
                      fill="url(#e1rmFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Volume por sessão</CardTitle>
              </CardHeader>
              <CardContent className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <XAxis dataKey="date" fontSize={11} stroke="var(--muted-foreground)" />
                    <YAxis fontSize={11} stroke="var(--muted-foreground)" />
                    <Tooltip
                      cursor={{ fill: "var(--muted)" }}
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        color: "var(--card-foreground)",
                      }}
                      formatter={(value: number) => [
                        `${value.toLocaleString("pt-BR")} kg`,
                        "Volume",
                      ]}
                    />
                    <Bar dataKey="volume" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sessões</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y divide-border">
                  {[...sessions].reverse().map((s) => (
                    <li key={s.sessionId}>
                      <Link
                        to="/workouts/session/$id"
                        params={{ id: s.sessionId }}
                        className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent/50"
                      >
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 font-medium">
                            {formatShortDate(s.date)}
                            {s.hasPr && (
                              <Badge variant="secondary">
                                <Flag className="mr-1 size-3" />
                                Recorde
                              </Badge>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {s.bestSet ? `melhor: ${s.bestSet.weight} kg × ${s.bestSet.reps}` : "—"}{" "}
                            · {s.workingSets} {s.workingSets === 1 ? "série" : "séries"}
                          </p>
                        </div>
                        <div className="shrink-0 text-right text-sm">
                          <p className="font-medium">{s.bestE1rm.toFixed(1)} kg</p>
                          <p className="text-xs text-muted-foreground">
                            {Math.round(s.volume).toLocaleString("pt-BR")} kg vol.
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        )}
      </PageBody>
    </>
  );
}

function Stat({ label: statLabel, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{statLabel}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
