import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MEAL_LABELS, label } from "@/lib/labels";
import { queryKeys } from "@/data/query-keys";
import { errorMessage } from "@/data/supabase-helpers";
import { setMealConsumed, type DayEntry } from "@/data/diet-day";
import { nutritionTotals, type MealSlot } from "@forja/domain";

/**
 * A próxima refeição pendente.
 *
 * ## Por que só uma
 *
 * Mostrar as oito refeições do dia na tela inicial transforma a Home num
 * segundo diário alimentar — e a pessoa precisa rolar por seis blocos
 * irrelevantes para achar o que interessa. A pergunta que a Home responde é "o
 * que eu faço agora?", e a resposta é uma refeição, não uma lista.
 *
 * A escolha é pela **primeira não consumida na ordem do dia**, não pela mais
 * próxima do relógio: quem pulou o café às 11h da manhã precisa ver o café
 * pendente, não o almoço.
 */
export function NextMealCard({
  date,
  entries,
  isToday,
}: {
  date: string;
  entries: readonly DayEntry[];
  isToday: boolean;
}) {
  const qc = useQueryClient();

  const porSlot = new Map<MealSlot, DayEntry[]>();
  for (const e of entries) {
    const lista = porSlot.get(e.slot) ?? [];
    lista.push(e);
    porSlot.set(e.slot, lista);
  }

  const ordem = Object.keys(MEAL_LABELS) as MealSlot[];
  const proximoSlot = ordem.find((slot) => {
    const itens = porSlot.get(slot);
    return itens && itens.length > 0 && itens.some((i) => !i.consumed);
  });

  const concluir = useMutation({
    mutationFn: (slot: MealSlot) => setMealConsumed(date, slot, true),
    onSuccess: () => {
      toast.success("Refeição concluída");
      void qc.invalidateQueries({ queryKey: queryKeys.diet.log(date) });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  // Nada pendente: o dia foi cumprido, e a Home não deve insistir.
  if (!proximoSlot) {
    const temItens = entries.length > 0;
    return (
      <Card className={cn(temItens && "border-primary/30 bg-primary/5")}>
        <CardContent className="flex items-center gap-3 p-4">
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-xl",
              temItens ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
            )}
          >
            {temItens ? (
              <Check className="size-5" aria-hidden />
            ) : (
              <UtensilsCrossed className="size-5" aria-hidden />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-tight">
              {temItens ? "Todas as refeições concluídas" : "Nenhuma refeição planejada"}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {temItens
                ? "Dia cumprido. Bom trabalho."
                : "Monte seu cardápio ou registre o que comeu."}
            </p>
          </div>
          <Button asChild variant="ghost" size="icon" aria-label="Abrir dieta">
            <Link to="/diet">
              <ChevronRight className="size-5" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const itens = porSlot.get(proximoSlot) ?? [];
  const pendentes = itens.filter((i) => !i.consumed);
  const totals = nutritionTotals(
    itens.map((i) => ({
      food: {
        servingSizeG: i.food.servingSizeG,
        kcal: i.food.kcal,
        proteinG: i.food.proteinG,
        carbsG: i.food.carbsG,
        fatG: i.food.fatG,
        fiberG: i.food.fiberG,
      },
      grams: i.grams,
      servings: 1,
    })),
  );

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {isToday ? "Próxima refeição" : "Pendente"}
            </p>
            <h3 className="mt-0.5 font-bold leading-tight">{label(MEAL_LABELS, proximoSlot)}</h3>
            <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
              {Math.round(totals.kcal)} kcal · P {Math.round(totals.proteinG)} g
            </p>
          </div>
          <Button asChild variant="ghost" size="icon" className="shrink-0" aria-label="Abrir dieta">
            <Link to="/diet">
              <ChevronRight className="size-5" />
            </Link>
          </Button>
        </div>

        <ul className="mt-3 space-y-1.5">
          {pendentes.slice(0, 4).map((i) => (
            <li key={i.id} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{i.name}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {Math.round(i.grams)} g
              </span>
            </li>
          ))}
          {pendentes.length > 4 && (
            <li className="text-sm text-muted-foreground">
              e mais {pendentes.length - 4}
              {pendentes.length - 4 === 1 ? " item" : " itens"}
            </li>
          )}
        </ul>

        <Button
          className="mt-4 h-11 w-full rounded-xl font-semibold"
          onClick={() => concluir.mutate(proximoSlot)}
          disabled={concluir.isPending}
        >
          <Check className="mr-1.5 size-4" aria-hidden />
          Marcar como consumida
        </Button>
      </CardContent>
    </Card>
  );
}
