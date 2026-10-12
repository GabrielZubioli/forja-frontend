import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { WEEKDAY_LABELS, portionMacros, weekdayOf, type Weekday } from "@forja/domain";
import { ensureActiveMealPlan, type ActiveMealPlan } from "@/data/meal-plans";
import { addPlanItem, copyDay, itensDoDia, refreshFutureDays, removePlanItem } from "@/data/diet-week";
import { queryKeys } from "@/data/query-keys";
import { errorMessage } from "@/data/supabase-helpers";
import { useCurrentUserId } from "@/hooks/use-current-user";
import { FoodPicker } from "@/components/pickers/food-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/query-boundary";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CATEGORY_EMOJI } from "@/lib/food-emoji";
import { MEAL_LABELS, label } from "@/lib/labels";
import { todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";

/** Segunda primeiro, como no Plano. */
const ORDEM: Weekday[] = [1, 2, 3, 4, 5, 6, 0];
const SIGLA: Record<Weekday, string> = { 0: "DOM", 1: "SEG", 2: "TER", 3: "QUA", 4: "QUI", 5: "SEX", 6: "SÁB" };

type Meal = ActiveMealPlan["meals"][number];
type Item = Meal["items"][number];

const macrosDe = (i: Item) =>
  portionMacros({ food: i.food, grams: i.grams, servings: 1 });

function totais(plan: ActiveMealPlan, dia: number) {
  const t = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const m of plan.meals)
    for (const i of itensDoDia(m.items, dia)) {
      const x = macrosDe(i);
      t.kcal += x.kcal;
      t.proteinG += x.proteinG;
      t.carbsG += x.carbsG;
      t.fatG += x.fatG;
    }
  return t;
}

const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(".", ",")}k` : String(Math.round(n)));

/**
 * O cardápio da semana: um dia de cada vez, como a agenda do Plano.
 *
 * O que vale para todo dia aparece em todos, marcado "toda a semana"; o resto
 * é só daquele dia. Mudanças valem dos próximos dias em diante.
 */
export function WeeklyMenu() {
  const userId = useCurrentUserId();
  const qc = useQueryClient();
  const hoje = weekdayOf(todayISO());
  const [dia, setDia] = useState<Weekday>(hoje);
  const [remover, setRemover] = useState<{ item: Item; meal: Meal } | null>(null);

  const plan = useQuery({
    queryKey: queryKeys.diet.activePlan(),
    queryFn: () => ensureActiveMealPlan(userId),
  });

  const salvar = useMutation({
    mutationFn: async ({ acao, afeta }: { acao: () => Promise<void>; afeta: number | null }) => {
      await acao();
      await refreshFutureDays(userId, afeta);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.diet.activePlan() });
      void qc.invalidateQueries({ queryKey: queryKeys.diet.all });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (plan.isPending) return <Skeleton className="h-96 w-full rounded-[1.5rem]" />;
  if (plan.isError) return <ErrorState message={errorMessage(plan.error)} onRetry={plan.refetch} />;
  const p = plan.data;
  if (!p) return null;

  const t = totais(p, dia);
  const metaKcal = p.kcalTarget;
  const nomeDia = WEEKDAY_LABELS[dia];

  return (
    <div>
      {/* Os sete dias, cada um com o total de calorias do cardápio. */}
      <div role="tablist" aria-label="Dia da semana" className="grid grid-cols-7 gap-1">
        {ORDEM.map((d) => {
          const kcal = totais(p, d).kcal;
          const ativo = d === dia;
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={ativo}
              onClick={() => setDia(d)}
              className={cn(
                "relative flex min-w-0 flex-col items-center rounded-2xl py-2.5 transition-colors",
                ativo ? "bg-primary text-primary-foreground" : "bg-card hover:bg-elevated",
              )}
            >
              <span className={cn("text-[11px] font-bold", !ativo && "text-muted-foreground")}>
                {SIGLA[d]}
              </span>
              <span className="mt-0.5 text-xs font-extrabold tabular-nums">{k(kcal)}</span>
              {d === hoje && (
                <span
                  className={cn(
                    "absolute bottom-1 size-1 rounded-full",
                    ativo ? "bg-primary-foreground" : "bg-primary",
                  )}
                  aria-label="hoje"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Resumo do dia escolhido. */}
      <section className="mt-3 rounded-[1.5rem] bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {dia === hoje ? "Hoje · " : ""}
              {nomeDia}
            </p>
            <p className="mt-1 flex items-baseline gap-1.5">
              <span className="text-4xl font-extrabold leading-none tabular-nums">
                {Math.round(t.kcal).toLocaleString("pt-BR")}
              </span>
              <span className="text-sm text-muted-foreground tabular-nums">
                / {Math.round(metaKcal).toLocaleString("pt-BR")} kcal
              </span>
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-2 text-sm font-semibold hover:bg-elevated"
              >
                <Copy className="size-4" aria-hidden />
                Copiar
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Copiar {nomeDia.toLowerCase()} para…</DropdownMenuLabel>
              {ORDEM.filter((d) => d !== dia).map((d) => (
                <DropdownMenuItem
                  key={d}
                  onSelect={() =>
                    salvar.mutate({ acao: () => copyDay(p, dia, d), afeta: d })
                  }
                >
                  {WEEKDAY_LABELS[d]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            ["Proteína", t.proteinG, p.proteinTarget],
            ["Carbo", t.carbsG, p.carbsTarget],
            ["Gordura", t.fatG, p.fatTarget],
          ].map(([nome, v, meta]) => (
            <div key={nome as string} className="rounded-xl bg-elevated px-2 py-2">
              <p className="text-[11px] font-semibold text-muted-foreground">{nome}</p>
              <p className="text-sm font-extrabold tabular-nums">
                {Math.round(v as number)}
                <span className="font-medium text-muted-foreground"> / {Math.round(meta as number)} g</span>
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Refeições do dia. */}
      <div className="mt-3 space-y-3">
        {p.meals.map((m) => {
          const itens = itensDoDia(m.items, dia);
          const kcalRefeicao = itens.reduce((n, i) => n + macrosDe(i).kcal, 0);
          const nome = m.label?.trim() || label(MEAL_LABELS, m.slot);
          return (
            <section key={m.id} className="rounded-[1.5rem] bg-card p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-bold">{nome}</h3>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {m.targetTime ? `${m.targetTime.slice(0, 5)} · ` : ""}
                    {Math.round(kcalRefeicao)} kcal
                  </p>
                </div>
                <FoodPicker
                  title={`${nome} · ${nomeDia.toLowerCase()}`}
                  onPick={(food, grams) =>
                    salvar.mutateAsync({
                      acao: () => addPlanItem(m.id, food.id, grams, dia, m.items.length),
                      afeta: dia,
                    })
                  }
                  trigger={
                    <button
                      type="button"
                      className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/12 text-primary hover:bg-primary/20"
                      aria-label={`Adicionar em ${nome} de ${nomeDia.toLowerCase()}`}
                    >
                      <Plus className="size-5" />
                    </button>
                  }
                />
              </div>

              {itens.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
                  Nada em {nome.toLowerCase()} na {nomeDia.toLowerCase()}.
                </p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {itens.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 py-2.5">
                      <span
                        className="grid size-10 shrink-0 place-items-center rounded-xl bg-elevated text-lg"
                        aria-hidden
                      >
                        {CATEGORY_EMOJI[i.food.category ?? "other"] ?? CATEGORY_EMOJI.other}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{i.name}</span>
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          {Math.round(i.grams)} g · {Math.round(macrosDe(i).kcal)} kcal
                          {i.weekday !== null && (
                            <span className="ml-1.5 rounded-full bg-primary/12 px-1.5 py-px text-[10px] font-bold text-primary">
                              só {SIGLA[i.weekday as Weekday].toLowerCase()}
                            </span>
                          )}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          i.weekday === null
                            ? setRemover({ item: i, meal: m })
                            : salvar.mutate({
                                acao: () => removePlanItem(i, m.id, dia, false),
                                afeta: dia,
                              })
                        }
                        aria-label={`Tirar ${i.name}`}
                        className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-elevated hover:text-foreground"
                      >
                        <X className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <p className="mt-4 px-1 text-center text-xs text-muted-foreground">
        Itens marcados com “só” valem apenas naquele dia; os demais, a semana toda. As mudanças
        valem a partir de hoje — o que já foi marcado como comido não muda.
      </p>

      {/* Item de toda a semana: tirar só deste dia ou de todos. */}
      <AlertDialog open={remover !== null} onOpenChange={(o) => !o && setRemover(null)}>
        <AlertDialogContent className="rounded-[1.5rem]">
          <AlertDialogHeader>
            <AlertDialogTitle>Tirar {remover?.item.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Este alimento está no cardápio de toda a semana.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <button
              type="button"
              className="h-12 rounded-2xl bg-primary font-bold text-primary-foreground"
              onClick={() => {
                if (remover)
                  salvar.mutate({
                    acao: () => removePlanItem(remover.item, remover.meal.id, dia, false),
                    afeta: dia,
                  });
                setRemover(null);
              }}
            >
              Só de {nomeDia.toLowerCase()}
            </button>
            <button
              type="button"
              className="h-12 rounded-2xl border border-border font-semibold"
              onClick={() => {
                if (remover)
                  salvar.mutate({
                    acao: () => removePlanItem(remover.item, remover.meal.id, dia, true),
                    afeta: null,
                  });
                setRemover(null);
              }}
            >
              Da semana toda
            </button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-2xl">Cancelar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
