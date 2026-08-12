import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { num, unwrapList } from "@/data/supabase-helpers";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/data/query-keys";
import { describeSubstitution, findSubstitutions, type FoodCandidate } from "@forja/domain";

/**
 * Substituição de alimento.
 *
 * ## O problema real
 *
 * O plano manda comer tilápia; a pessoa não tem tilápia. Sem uma saída, ela
 * come outra coisa e o plano deixa de descrever a realidade — ou não come nada
 * e abandona a dieta na primeira semana. É a causa mais banal de fracasso de
 * plano alimentar.
 *
 * ## O que a tela mostra
 *
 * Não uma lista de "alimentos parecidos", mas **a quantidade ajustada e o custo
 * da troca**. Substituir 150 g de frango por 150 g de feijão não é substituir:
 * é trocar 45 g de proteína por 7. A quantidade vem calculada para preservar o
 * macro dominante, e a diferença que sobra aparece explicitamente — porque
 * existe, e esconder isso seria mentir sobre o que a troca custa.
 */
/**
 * Categorias que competem pelo mesmo lugar no prato.
 *
 * Grupos, não sinônimos: dentro de cada um, o domínio ainda exige papel
 * nutricional compatível e proximidade de macros. Isto só define o universo em
 * que vale a pena procurar.
 */
const GRUPOS: readonly (readonly FoodCandidate["category"][])[] = [
  ["protein_meat", "protein_egg", "dairy", "supplement", "legume"],
  ["grain", "tuber", "legume", "prepared", "sweet"],
  ["fat", "condiment"],
  ["vegetable", "fruit"],
];

function vizinhas(category: FoodCandidate["category"]): FoodCandidate["category"][] {
  const grupo = GRUPOS.find((g) => g.includes(category));
  return grupo ? [...grupo] : [category];
}

export function SubstituteFoodDialog({
  trigger,
  food,
  grams,
  preferredIds = [],
  onSubstitute,
}: {
  trigger: ReactNode;
  food: FoodCandidate;
  grams: number;
  preferredIds?: readonly string[];
  onSubstitute: (substitute: FoodCandidate, grams: number) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);

  const pool = useQuery({
    queryKey: queryKeys.diet.substitutions(food.id),
    enabled: open,
    queryFn: async () => {
      const rows = unwrapList(
        "carregar alternativas",
        await supabase
          .from("foods")
          .select("id, name, category, kcal, protein_g, carbs_g, fat_g, fiber_g, popularity")
          .is("deleted_at", null)
          // Categorias vizinhas, não a mesma categoria.
          //
          // Restringir a `category` idêntica dava um resultado tecnicamente
          // correto e praticamente inútil: frango (`protein_meat`) nunca
          // sugeria ovo (`protein_egg`) nem whey (`supplement`), que são as
          // trocas que as pessoas de fato fazem. O que impede "substituir arroz
          // por azeite" é o papel nutricional, e disso o domínio já cuida em
          // `findSubstitutions` — a consulta só precisa não esconder os
          // candidatos.
          .in("category", vizinhas(food.category) as never[])
          .order("popularity", { ascending: false })
          .limit(200),
      );

      return rows.map((r): FoodCandidate => ({
        id: r.id,
        name: r.name,
        category: (r.category ?? "other") as FoodCandidate["category"],
        kcal: num(r.kcal),
        proteinG: num(r.protein_g),
        carbsG: num(r.carbs_g),
        fatG: num(r.fat_g),
        fiberG: num(r.fiber_g),
        popularity: num(r.popularity, 50),
      }));
    },
  });

  const opcoes = pool.data ? findSubstitutions(food, grams, pool.data, { preferredIds }) : [];

  const aplicar = async (substituto: FoodCandidate, novasGramas: number) => {
    setApplying(substituto.id);
    try {
      await onSubstitute(substituto, novasGramas);
      setOpen(false);
    } finally {
      setApplying(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Substituir {food.name}</DialogTitle>
          <DialogDescription>
            As quantidades já vêm ajustadas para manter o valor nutricional da refeição.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          {pool.isPending ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : opcoes.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Não encontramos alternativas equivalentes para este alimento.
            </p>
          ) : (
            <ul className="space-y-2">
              {opcoes.map((sub) => {
                const proximo = sub.distance < 0.25;
                return (
                  <li key={sub.food.id}>
                    <button
                      type="button"
                      onClick={() => void aplicar(sub.food, sub.grams)}
                      disabled={applying !== null}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition-colors",
                        "hover:border-primary/40 hover:bg-accent/50 disabled:opacity-60",
                        proximo ? "border-primary/25" : "border-border",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{sub.food.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {describeSubstitution(sub)}
                        </p>

                        {/* O custo da troca, em números. Um "equivalente" que
                            some 15 g de gordura precisa dizer isso. */}
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {(
                            [
                              ["kcal", sub.delta.kcal, ""],
                              ["P", sub.delta.proteinG, "g"],
                              ["C", sub.delta.carbsG, "g"],
                              ["G", sub.delta.fatG, "g"],
                            ] as const
                          )
                            .filter(([, v]) => Math.abs(v) >= 1)
                            .map(([nome, valor, unidade]) => (
                              <Badge
                                key={nome}
                                variant="outline"
                                className="px-1.5 py-0 text-[10px] font-normal tabular-nums"
                              >
                                {nome} {valor > 0 ? "+" : ""}
                                {valor}
                                {unidade}
                              </Badge>
                            ))}
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="flex items-center gap-1 text-sm font-semibold tabular-nums">
                          {applying === sub.food.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
                          )}
                          {sub.grams} g
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          era {Math.round(grams)} g
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
