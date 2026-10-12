import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BatteryCharging, ChevronRight } from "lucide-react";
import { fetchMuscleRecovery, recoveryColor } from "@/data/recovery";
import { queryKeys } from "@/data/query-keys";
import { useCurrentUserId } from "@/hooks/use-current-user";
import { Skeleton } from "@/components/ui/skeleton";
import { MUSCLE_LABELS, label } from "@/lib/labels";
import { cn } from "@/lib/utils";

const SEGMENTOS = 10;

/**
 * Prontidão do corpo: quanto dos músculos treinados nos últimos dias já se
 * recuperou, como uma bateria. Responde "o que dá para treinar hoje?" — os que
 * ainda recuperam aparecem com o tempo que falta; o resto está pronto.
 */
export function ReadinessCard() {
  const userId = useCurrentUserId();
  const recovery = useQuery({
    queryKey: queryKeys.workouts.recovery(),
    queryFn: () => fetchMuscleRecovery(userId),
  });

  if (recovery.isPending) return <Skeleton className="h-36 w-full rounded-[1.5rem]" />;
  if (recovery.isError) return null;

  const musculos = recovery.data;
  const media = musculos.length
    ? Math.round(musculos.reduce((n, m) => n + m.percent, 0) / musculos.length)
    : 100;
  const recuperando = musculos
    .filter((m) => m.hoursRemaining > 0)
    .sort((a, b) => b.hoursRemaining - a.hoursRemaining)
    .slice(0, 3);
  const prontos = musculos.filter((m) => m.hoursRemaining <= 0);
  const cheios = Math.round((media / 100) * SEGMENTOS);
  const cor = media >= 60 ? "bg-primary" : "bg-(--treino)";

  return (
    <Link
      to="/stats"
      className="block rounded-[1.5rem] bg-card p-5 transition-colors hover:bg-elevated"
      aria-label={`Prontidão do corpo: ${media}%`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-lg text-muted-foreground">
          <BatteryCharging className="size-5 text-primary" aria-hidden />
          Prontidão do corpo
        </p>
        <ChevronRight className="size-5 shrink-0" aria-hidden />
      </div>

      <div className="mt-3 flex items-end gap-4">
        <p className="text-5xl font-extrabold leading-none tabular-nums">
          {media}
          <span className="text-2xl font-bold text-muted-foreground">%</span>
        </p>
        <div className="mb-1.5 flex flex-1 gap-1" aria-hidden>
          {Array.from({ length: SEGMENTOS }, (_, i) => (
            <span
              key={i}
              className={cn("h-6 flex-1 rounded-[4px]", i < cheios ? cor : "bg-muted")}
            />
          ))}
        </div>
      </div>

      {recuperando.length === 0 ? (
        <p className="mt-3 text-muted-foreground">
          Tudo recuperado — dia perfeito para um treino pesado.
        </p>
      ) : (
        <ul className="mt-4 space-y-1.5">
          {recuperando.map((m) => (
            <li key={m.muscle} className="flex items-center gap-2 text-sm">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: recoveryColor(m.status) }}
                aria-hidden
              />
              <span className="flex-1 font-medium">{label(MUSCLE_LABELS, m.muscle)}</span>
              <span className="tabular-nums text-muted-foreground">
                {m.hoursRemaining < 24
                  ? `${m.hoursRemaining}h`
                  : `${Math.round(m.hoursRemaining / 24)}d`}{" "}
                para recuperar
              </span>
            </li>
          ))}
          {prontos.length > 0 && (
            <li className="pt-1 text-sm text-muted-foreground">
              Prontos:{" "}
              <span className="font-medium text-foreground">
                {prontos
                  .slice(0, 4)
                  .map((m) => label(MUSCLE_LABELS, m.muscle))
                  .join(", ")}
                {prontos.length > 4 ? ` e mais ${prontos.length - 4}` : ""}
              </span>
            </li>
          )}
        </ul>
      )}
    </Link>
  );
}
