import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, startOfWeek, subWeeks } from "date-fns";
import { fetchCompletedWorkouts } from "@/data/routines";
import { queryKeys } from "@/data/query-keys";
import { errorMessage } from "@/data/supabase-helpers";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/query-boundary";
import { formatDate, toISODate } from "@/lib/date";
import { cn } from "@/lib/utils";

const WEEKS = 53;

/**
 * Um ano de treinos, um quadrado por dia — a constância vista de longe.
 * Colunas são semanas (segunda no topo), da mais antiga à atual.
 */
export function ActivityHeatmap() {
  const inicio = subWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), WEEKS - 1);
  const de = toISODate(inicio);
  const ate = toISODate(new Date());

  const [dia, setDia] = useState<string | null>(null);
  const treinos = useQuery({
    queryKey: [...queryKeys.workouts.all, "heatmap", de],
    queryFn: () => fetchCompletedWorkouts(de, ate),
  });

  if (treinos.isPending) return <Skeleton className="h-32 w-full rounded-xl" />;
  if (treinos.isError) {
    return <ErrorState message={errorMessage(treinos.error)} onRetry={treinos.refetch} compact />;
  }

  const porDia = new Map<string, number>();
  for (const t of treinos.data) porDia.set(t.date, (porDia.get(t.date) ?? 0) + 1);
  const dias = Array.from({ length: WEEKS * 7 }, (_, i) => toISODate(addDays(inicio, i)));
  const total = treinos.data.length;

  const nDia = dia ? (porDia.get(dia) ?? 0) : 0;
  const semanasAtivas = new Set(
    treinos.data.map((t) => toISODate(startOfWeek(new Date(`${t.date}T12:00:00`), { weekStartsOn: 1 }))),
  ).size;

  return (
    <div className="rounded-[1.5rem] border border-primary/20 bg-card p-4">
      <div className="mb-3 flex items-end justify-between gap-3">
        <p>
          <span className="text-3xl font-extrabold tabular-nums text-primary">{total}</span>{" "}
          <span className="text-sm text-muted-foreground">
            {total === 1 ? "treino" : "treinos"} · {semanasAtivas} semanas ativas
          </span>
        </p>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground" aria-hidden>
          menos
          <span className="size-2.5 rounded-[3px] bg-primary/10" />
          <span className="size-2.5 rounded-[3px] bg-primary/50" />
          <span className="size-2.5 rounded-[3px] bg-primary" />
          mais
        </span>
      </div>
      {/* rtl só no contêiner: a rolagem começa na semana atual (à direita). */}
      <div className="overflow-x-auto pb-1" dir="rtl">
        <div
          dir="ltr"
          className="grid w-max grid-flow-col grid-rows-7 gap-[3px]"
          role="img"
          aria-label={`Mapa de treinos: ${total} treinos nas últimas ${WEEKS} semanas`}
          onClick={(e) => {
            const d = (e.target as HTMLElement).dataset.dia;
            if (d) setDia(d === dia ? null : d);
          }}
        >
          {dias.map((d) => {
            const n = porDia.get(d) ?? 0;
            return (
              <span
                key={d}
                data-dia={d > ate ? undefined : d}
                title={`${formatDate(d, "d 'de' MMM")}: ${n === 0 ? "sem treino" : `${n} treino${n > 1 ? "s" : ""}`}`}
                className={cn(
                  "size-3 cursor-pointer rounded-[3px] transition-transform hover:scale-125",
                  d > ate
                    ? "invisible"
                    : n === 0
                      ? "bg-primary/10"
                      : n === 1
                        ? "bg-primary/55"
                        : "bg-primary shadow-[0_0_6px_var(--primary)]",
                  d === ate && "ring-2 ring-primary/60 ring-offset-1 ring-offset-card",
                  d === dia && "scale-125 ring-2 ring-foreground",
                )}
              />
            );
          })}
        </div>
      </div>
      <p className="mt-3 min-h-5 text-sm" aria-live="polite">
        {dia ? (
          <>
            <span className="font-semibold capitalize">{formatDate(dia, "EEEE, d 'de' MMMM")}</span>
            <span className="text-muted-foreground">
              {" "}
              · {nDia === 0 ? "sem treino" : `${nDia} treino${nDia > 1 ? "s" : ""}`}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">Toque em um dia para ver os detalhes.</span>
        )}
      </p>
    </div>
  );
}
