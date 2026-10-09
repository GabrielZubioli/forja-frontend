import { useQuery } from "@tanstack/react-query";
import { addDays, startOfWeek, subWeeks } from "date-fns";
import { fetchCompletedWorkouts } from "@/data/routines";
import { queryKeys } from "@/data/query-keys";
import { errorMessage } from "@/data/supabase-helpers";
import { Card, CardContent } from "@/components/ui/card";
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

  return (
    <Card>
      <CardContent className="p-4">
        <p className="mb-3 text-xs text-muted-foreground">
          {total} {total === 1 ? "treino" : "treinos"} nas últimas {WEEKS} semanas
        </p>
        {/* rtl só no contêiner: a rolagem começa na semana atual (à direita). */}
        <div className="overflow-x-auto" dir="rtl">
          <div
            dir="ltr"
            className="grid w-max grid-flow-col grid-rows-7 gap-[3px]"
            role="img"
            aria-label={`Mapa de treinos: ${total} treinos nas últimas ${WEEKS} semanas`}
          >
            {dias.map((dia) => {
              const n = porDia.get(dia) ?? 0;
              return (
                <span
                  key={dia}
                  title={`${formatDate(dia, "d 'de' MMM")}: ${n === 0 ? "sem treino" : `${n} treino${n > 1 ? "s" : ""}`}`}
                  className={cn(
                    "size-2.5 rounded-[2px]",
                    dia > ate
                      ? "invisible"
                      : n === 0
                        ? "bg-muted"
                        : n === 1
                          ? "bg-primary/60"
                          : "bg-primary",
                  )}
                />
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
