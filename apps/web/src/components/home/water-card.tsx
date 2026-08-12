import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Droplets, Minus } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/data/query-keys";
import { errorMessage } from "@/data/supabase-helpers";
import { addWater, fetchWaterMl, undoLastWater } from "@/data/diet-day";
import { useCurrentUserId } from "@/hooks/use-current-user";
import { WATER_QUICK_ADD_ML } from "@forja/domain";

/**
 * Registro de água.
 *
 * ## Um toque, sem diálogo
 *
 * Registrar água é a ação mais frequente e menos importante do app: acontece
 * seis vezes ao dia e não merece uma tela. Os botões gravam direto, com
 * atualização otimista — a barra sobe antes da resposta do servidor, porque
 * esperar 300 ms por um copo d'água é atrito que faz a pessoa parar de
 * registrar.
 *
 * O botão de desfazer existe porque tocar em "500" quando se queria "300" é o
 * erro mais comum aqui — e o motivo de o banco guardar um registro por gole em
 * vez de um total por dia.
 */
export function WaterCard({ date, targetMl }: { date: string; targetMl: number }) {
  const qc = useQueryClient();
  const userId = useCurrentUserId();

  const water = useQuery({
    queryKey: queryKeys.water.day(date),
    queryFn: () => fetchWaterMl(date),
  });

  const consumido = water.data ?? 0;
  const meta = targetMl || 2500;
  const pct = Math.min(100, (consumido / meta) * 100);
  const atingiu = consumido >= meta;

  const add = useMutation({
    mutationFn: (ml: number) => addWater(userId, date, ml),
    onMutate: async (ml) => {
      await qc.cancelQueries({ queryKey: queryKeys.water.day(date) });
      const anterior = qc.getQueryData<number>(queryKeys.water.day(date)) ?? 0;
      qc.setQueryData(queryKeys.water.day(date), anterior + ml);
      return { anterior };
    },
    onError: (e, _ml, ctx) => {
      // Reverter é essencial: uma barra que subiu e não gravou faria o usuário
      // acreditar que bateu a meta.
      if (ctx) qc.setQueryData(queryKeys.water.day(date), ctx.anterior);
      toast.error(errorMessage(e));
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: queryKeys.water.day(date) }),
  });

  const undo = useMutation({
    mutationFn: () => undoLastWater(date),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.water.day(date) }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-chart-2/15 text-chart-2">
              <Droplets className="size-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold leading-tight">Água</p>
              {water.isPending ? (
                <Skeleton className="mt-1 h-3 w-20" />
              ) : (
                <p className="text-xs tabular-nums text-muted-foreground">
                  {(consumido / 1000).toFixed(1)} L de {(meta / 1000).toFixed(1)} L
                </p>
              )}
            </div>
          </div>

          {consumido > 0 && (
            <Button
              size="icon"
              variant="ghost"
              className="size-8 shrink-0 rounded-full"
              onClick={() => undo.mutate()}
              disabled={undo.isPending}
              aria-label="Desfazer último registro de água"
            >
              <Minus className="size-4" />
            </Button>
          )}
        </div>

        <div
          className="mb-3 h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={`Água: ${consumido} de ${meta} mililitros`}
          aria-valuenow={consumido}
          aria-valuemin={0}
          aria-valuemax={meta}
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500 ease-out",
              atingiu ? "bg-primary" : "bg-chart-2",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="grid grid-cols-4 gap-2">
          {WATER_QUICK_ADD_ML.map((ml) => (
            <Button
              key={ml}
              variant="outline"
              size="sm"
              className="h-10 rounded-xl text-xs font-semibold tabular-nums"
              onClick={() => add.mutate(ml)}
              disabled={add.isPending}
            >
              +{ml}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
