import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Dumbbell } from "lucide-react";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/query-boundary";
import { cn } from "@/lib/utils";
import { RoutineIcon, routineIconOf } from "@/components/workouts/routine-icon";
import { errorMessage } from "@/data/supabase-helpers";
import { fetchActiveRoutine, fetchCompletedWorkouts } from "@/data/routines";
import { queryKeys } from "@/data/query-keys";
import { formatDate, formatDuration, toISODate, todayISO } from "@/lib/date";
import { WEEKDAY_INITIALS, type Weekday } from "@forja/domain";

export const Route = createFileRoute("/_authenticated/workouts_/calendar")({
  head: () => ({
    meta: [
      { title: "Calendário de treinos — Forja" },
      { name: "description", content: "Veja seus treinos por mês e acompanhe a constância." },
    ],
  }),
  component: WorkoutCalendar,
});

/**
 * Calendário mensal de treinos.
 *
 * Serve a uma pergunta que a faixa da semana não responde: *estou sendo
 * constante?* Um mês inteiro à vista mostra padrões — a semana que furou, o
 * intervalo grande entre treinos — que nenhuma lista cronológica revela.
 *
 * Mostra apenas o que **aconteceu**, não o que estava planejado no passado.
 * Preencher os dias vazios com o que "deveria" ter sido feito transformaria o
 * calendário num painel de cobrança.
 */
function WorkoutCalendar() {
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const inicio = startOfMonth(monthCursor);
  const fim = endOfMonth(monthCursor);

  // A grade inclui os dias vizinhos que completam as semanas.
  const gradeInicio = startOfWeek(inicio, { weekStartsOn: 1 });
  const gradeFim = endOfWeek(fim, { weekStartsOn: 1 });

  const routine = useQuery({
    queryKey: queryKeys.workouts.activeRoutine(),
    queryFn: fetchActiveRoutine,
  });

  const workouts = useQuery({
    queryKey: ["workout-calendar", toISODate(gradeInicio), toISODate(gradeFim)],
    queryFn: () => fetchCompletedWorkouts(toISODate(gradeInicio), toISODate(gradeFim)),
  });

  const porDia = useMemo(() => {
    const mapa = new Map<string, NonNullable<typeof workouts.data>>();
    for (const treino of workouts.data ?? []) {
      const lista = mapa.get(treino.date) ?? [];
      lista.push(treino);
      mapa.set(treino.date, lista);
    }
    return mapa;
  }, [workouts.data]);

  const dias = eachDayOfInterval({ start: gradeInicio, end: gradeFim });
  const hoje = todayISO();
  const templates = routine.data?.templates ?? [];

  const doMes = (workouts.data ?? []).filter((w) =>
    isSameMonth(new Date(`${w.date}T12:00:00`), monthCursor),
  );
  const volumeMes = doMes.reduce((soma, w) => soma + w.volumeKg, 0);

  const selecionados = selectedDate ? (porDia.get(selectedDate) ?? []) : [];

  return (
    <>
      <PageHeader
        title="Calendário"
        description="Seus treinos por mês."
        action={
          <Button variant="outline" asChild>
            <Link to="/plan">
              <ArrowLeft className="mr-1 size-4" />
              Treinos
            </Link>
          </Button>
        }
      />
      <PageBody>
        <Card className="mx-auto max-w-2xl">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base capitalize">
              {formatDate(monthCursor, "MMMM 'de' yyyy")}
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setMonthCursor((m) => subMonths(m, 1))}
                aria-label="Mês anterior"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setMonthCursor(startOfMonth(new Date()))}
              >
                Hoje
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setMonthCursor((m) => addMonths(m, 1))}
                aria-label="Próximo mês"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </CardHeader>

          <CardContent>
            {workouts.isError ? (
              <ErrorState message={errorMessage(workouts.error)} onRetry={workouts.refetch} />
            ) : (
              <>
                <div className="mb-2 grid grid-cols-7 gap-1">
                  {([1, 2, 3, 4, 5, 6, 0] as Weekday[]).map((d, i) => (
                    <span
                      key={i}
                      className="py-1 text-center text-[10px] font-medium uppercase text-muted-foreground"
                    >
                      {WEEKDAY_INITIALS[d]}
                    </span>
                  ))}
                </div>

                {workouts.isPending ? (
                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: 35 }).map((_, i) => (
                      <Skeleton key={i} className="aspect-square rounded-lg" />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-7 gap-1">
                    {dias.map((dia) => {
                      const iso = toISODate(dia);
                      const treinos = porDia.get(iso) ?? [];
                      const temTreino = treinos.length > 0;
                      const ehHoje = iso === hoje;
                      const foraDoMes = !isSameMonth(dia, monthCursor);
                      const rotina =
                        treinos[0]?.splitIndex !== undefined
                          ? templates[treinos[0].splitIndex]
                          : undefined;
                      const Icone = rotina ? routineIconOf(rotina.icon, rotina.name) : Dumbbell;

                      return (
                        <button
                          key={iso}
                          type="button"
                          onClick={() => setSelectedDate(temTreino ? iso : null)}
                          disabled={!temTreino}
                          aria-label={`${formatDate(iso, "dd 'de' MMMM")}: ${
                            temTreino
                              ? `${treinos.length} treino${treinos.length > 1 ? "s" : ""}`
                              : "sem treino"
                          }`}
                          aria-pressed={selectedDate === iso}
                          className={cn(
                            "relative flex aspect-square flex-col items-center justify-center rounded-lg border text-sm transition-colors",
                            foraDoMes && "opacity-35",
                            temTreino
                              ? "border-transparent bg-primary text-primary-foreground hover:opacity-90"
                              : "border-border text-muted-foreground",
                            ehHoje && !temTreino && "border-primary text-primary",
                            selectedDate === iso && "ring-2 ring-primary ring-offset-1",
                            !temTreino && "cursor-default",
                          )}
                        >
                          <span className={cn("font-medium", ehHoje && "font-bold")}>
                            {dia.getDate()}
                          </span>
                          {temTreino && <Icone className="size-3 opacity-90" aria-hidden />}
                          {treinos.length > 1 && (
                            <span className="absolute right-1 top-1 size-1.5 rounded-full bg-primary-foreground" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm">
                  <span className="text-muted-foreground">
                    {doMes.length === 0
                      ? "Nenhum treino neste mês"
                      : `${doMes.length} ${doMes.length === 1 ? "treino" : "treinos"} neste mês`}
                  </span>
                  {volumeMes > 0 && (
                    <span className="text-muted-foreground">
                      {Math.round(volumeMes).toLocaleString("pt-BR")} kg de volume
                    </span>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {selectedDate && selecionados.length > 0 && (
          <Card className="mx-auto mt-4 max-w-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {formatDate(selectedDate, "EEEE, dd 'de' MMMM")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {selecionados.map((treino) => (
                  <li key={treino.sessionId}>
                    <Link
                      to="/workouts/session/$id"
                      params={{ id: treino.sessionId }}
                      className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent/50"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{treino.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDuration(treino.durationSeconds)}
                          {treino.volumeKg > 0 &&
                            ` · ${Math.round(treino.volumeKg).toLocaleString("pt-BR")} kg`}
                        </p>
                      </div>
                      {treino.splitIndex !== undefined && templates[treino.splitIndex] && (
                        <RoutineIcon
                          icon={templates[treino.splitIndex]!.icon}
                          name={templates[treino.splitIndex]!.name}
                          className="size-9 rounded-lg [&>svg]:size-5"
                          muted
                        />
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {!workouts.isPending && !workouts.isError && (workouts.data?.length ?? 0) === 0 && (
          <div className="mx-auto mt-4 max-w-2xl">
            <EmptyState
              icon={<CalendarDays className="size-6" />}
              title="Nenhum treino neste período"
              description="Assim que você finalizar um treino, ele aparece aqui."
              action={
                <Button asChild>
                  <Link to="/plan">Ir para treinos</Link>
                </Button>
              }
            />
          </div>
        )}
      </PageBody>
    </>
  );
}
