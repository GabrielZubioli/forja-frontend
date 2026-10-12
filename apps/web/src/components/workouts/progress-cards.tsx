import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/data/query-keys";
import { errorMessage } from "@/data/supabase-helpers";
import {
  RECOVERY_STATUS_LABELS,
  describeRemaining,
  fetchMuscleRecovery,
  recoveryColor,
} from "@/data/recovery";
import { fetchMuscleSetEntries } from "@/data/workouts";
import { useCurrentUserId } from "@/hooks/use-current-user";
import { BodyMap } from "@/components/body-map/body-map";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/query-boundary";
import { MUSCLE_LABELS, label } from "@/lib/labels";
import { todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";
import { weeklySetsByBodyPart, type BodyPart } from "@forja/domain";

/**
 * Recuperação por músculo: o mapa mostra a fadiga, a lista diz quanto falta.
 *
 * Só músculos treinados nos últimos dias aparecem — "não treinado" não é o
 * mesmo que "100% recuperado" (ver `computeMuscleRecovery`).
 */
export function RecoveryCard() {
  const userId = useCurrentUserId();
  const recovery = useQuery({
    queryKey: queryKeys.workouts.recovery(),
    queryFn: () => fetchMuscleRecovery(userId),
  });

  if (recovery.isPending) return <Skeleton className="h-48 w-full rounded-xl" />;
  if (recovery.isError) {
    return <ErrorState message={errorMessage(recovery.error)} onRetry={recovery.refetch} compact />;
  }

  const musculos = [...recovery.data].sort((a, b) => a.percent - b.percent);
  if (musculos.length === 0) {
    return (
      <p className="px-1 text-sm text-muted-foreground">
        Nenhum músculo treinado nos últimos dias — tudo descansado.
      </p>
    );
  }

  return (
    <Card>
      <CardContent className="grid gap-4 p-4 sm:grid-cols-[auto_1fr]">
        <div>
          <BodyMap
            muscles={musculos.map((m) => ({
              muscle: m.muscle,
              // Fadigado aparece forte; pronto, suave — cada um na sua cor.
              intensity: m.status === "recovered" ? 0.35 : 1 - m.ratio,
              color: recoveryColor(m.status),
            }))}
            size="sm"
            showToggle={false}
            showLegend={false}
            className="mx-auto"
          />
          <p className="mt-1 text-center text-xs text-muted-foreground">
            Laranja: fadigado · verde: pronto
          </p>
        </div>
        <ul className="space-y-2.5">
          {musculos.slice(0, 8).map((m) => (
            <li key={m.muscle}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{label(MUSCLE_LABELS, m.muscle)}</span>
                <span className="text-xs text-muted-foreground">
                  {RECOVERY_STATUS_LABELS[m.status]} · {describeRemaining(m)}
                </span>
              </div>
              <div
                className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={m.percent}
                aria-label={`${label(MUSCLE_LABELS, m.muscle)}: ${m.percent}% recuperado`}
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: `${m.percent}%`, background: recoveryColor(m.status) }}
                />
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

const PART_LABELS: Record<BodyPart, string> = {
  peito: "Peito",
  costas: "Costas",
  ombros: "Ombros",
  bracos: "Braços",
  pernas: "Pernas",
  core: "Core",
};

const WEEKS = 8;

/** Séries por parte do corpo nas últimas 8 semanas, uma linha de barras por parte. */
export function BodyPartProgressCard() {
  const entries = useQuery({
    queryKey: queryKeys.workouts.muscleSets(),
    queryFn: () => fetchMuscleSetEntries(WEEKS),
  });

  if (entries.isPending) return <Skeleton className="h-48 w-full rounded-xl" />;
  if (entries.isError) {
    return <ErrorState message={errorMessage(entries.error)} onRetry={entries.refetch} compact />;
  }

  const partes = weeklySetsByBodyPart(entries.data, todayISO(), WEEKS);
  const maximo = Math.max(1, ...partes.flatMap((p) => p.weekly));

  return (
    <Card>
      <CardContent className="p-4">
        <p className="mb-3 text-xs text-muted-foreground">
          Séries por semana, das últimas {WEEKS} até a atual
        </p>
        <ul className="space-y-3">
          {partes.map(({ part, weekly }) => {
            const atual = weekly[weekly.length - 1] ?? 0;
            return (
              <li key={part} className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-sm font-medium">{PART_LABELS[part]}</span>
                <div
                  className="flex h-8 flex-1 items-end gap-1"
                  role="img"
                  aria-label={`${PART_LABELS[part]}: ${weekly.map((v) => Math.round(v)).join(", ")} séries por semana`}
                >
                  {weekly.map((v, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex-1 rounded-sm",
                        i === weekly.length - 1 ? "bg-primary" : "bg-primary/35",
                        v === 0 && "bg-muted",
                      )}
                      style={{ height: `${Math.max(8, (v / maximo) * 100)}%` }}
                    />
                  ))}
                </div>
                <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums">
                  {Math.round(atual)}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
