import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { fetchCuratedFoods, fetchDietaryRestrictions } from "@/data/meal-plans";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import {
  ResultList,
  ResultRow,
  ResultsEmpty,
  ResultsLoading,
  SearchDialogContent,
} from "@/components/pickers/search-dialog";
import { queryKeys } from "@/data/query-keys";
import {
  describeSubstitution,
  findSubstitutions,
  safePool,
  type FoodCandidate,
} from "@forja/domain";

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

  /**
   * Alternativas: só o catálogo curado, já sem o que as alergias, a dieta e o
   * "não gosto" da pessoa excluem. Antes a busca era por categoria no banco
   * inteiro, sem filtro nenhum — quem tem alergia a amendoim podia receber
   * pasta de amendoim como "equivalente".
   */
  const pool = useQuery({
    queryKey: queryKeys.diet.substitutions(food.id),
    enabled: open,
    queryFn: async () => {
      const [catalogo, restricoes] = await Promise.all([
        fetchCuratedFoods(),
        fetchDietaryRestrictions(),
      ]);
      return { seguros: safePool(catalogo, restricoes), catalogo };
    },
  });

  // Com perfil curado, o original troca só dentro do mesmo papel culinário
  // (arroz por batata, não por pão) e o substituto respeita a porção dele.
  const original = pool.data?.catalogo.find((f) => f.id === food.id) ?? food;
  const opcoes = pool.data
    ? findSubstitutions(original, grams, pool.data.seguros, { preferredIds })
    : [];

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
      <SearchDialogContent
        title="Substituir alimento"
        description={
          <>
            Trocando <b className="font-semibold text-foreground">{food.name}</b> (
            {Math.round(grams)} g). As quantidades já vêm ajustadas para manter o valor nutricional
            da refeição.
          </>
        }
      >
        {pool.isPending ? (
          <ResultsLoading />
        ) : opcoes.length === 0 ? (
          <ResultsEmpty>Não encontramos alternativas equivalentes para este alimento.</ResultsEmpty>
        ) : (
          <ResultList>
            {opcoes.map((sub) => (
              <li key={sub.food.id}>
                <ResultRow
                  title={sub.food.name}
                  detail={describeSubstitution(sub)}
                  highlight={sub.distance < 0.25}
                  disabled={applying !== null}
                  onClick={() => void aplicar(sub.food, sub.grams)}
                  aside={
                    <span className="flex items-center gap-1 text-base font-bold tabular-nums">
                      {applying === sub.food.id && <Loader2 className="size-4 animate-spin" />}
                      {sub.grams} g
                    </span>
                  }
                >
                  {/* O custo da troca, em números. Um "equivalente" que some
                      15 g de gordura precisa dizer isso. */}
                  <span className="mt-1.5 flex flex-wrap gap-1">
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
                        <span
                          key={nome}
                          className="rounded-full bg-elevated px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground"
                        >
                          {nome} {valor > 0 ? "+" : ""}
                          {valor}
                          {unidade}
                        </span>
                      ))}
                  </span>
                </ResultRow>
              </li>
            ))}
          </ResultList>
        )}
      </SearchDialogContent>
    </Dialog>
  );
}
