/**
 * Seletor de alimento com quantidade — usado no diário e no editor de receitas.
 *
 * Antes existiam dois `AddFoodDialog` distintos (um em `diet.tsx`, outro em
 * `recipes.$id.tsx`) com fluxos diferentes: um exigia escolher o alimento antes
 * de digitar as gramas, o outro mostrava tudo junto; um tinha `autoFocus`, o
 * outro não; nenhum tinha debounce. Consolidar remove a inconsistência visível
 * e a manutenção dobrada.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Loader2, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/data/query-keys";
import { num, unwrapList } from "@/data/supabase-helpers";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ErrorState } from "@/components/query-boundary";

export type PickedFood = {
  id: string;
  name: string;
  brand: string | null;
  servingSizeG: number;
  kcal: number;
};

/** Quantidades comuns — evitam digitação no celular durante a refeição. */
const QUICK_GRAMS = [50, 100, 150, 200, 300];

export function FoodPicker({
  trigger,
  title = "Adicionar alimento",
  confirmLabel = "Adicionar",
  defaultGrams = 100,
  onPick,
  isPending,
}: {
  trigger: ReactNode;
  title?: string;
  confirmLabel?: string;
  defaultGrams?: number;
  /** Recebe o alimento e a quantidade em gramas. Deve fechar via retorno da promise. */
  onPick: (food: PickedFood, grams: number) => void | Promise<void>;
  isPending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<PickedFood | null>(null);
  const [grams, setGrams] = useState(String(defaultGrams));

  const debouncedTerm = useDebouncedValue(term.trim(), 300);

  // Estado local zerado ao fechar: reabrir o diálogo deve começar limpo.
  useEffect(() => {
    if (open) return;
    const reset = setTimeout(() => {
      setTerm("");
      setSelected(null);
      setGrams(String(defaultGrams));
    }, 150);
    return () => clearTimeout(reset);
  }, [open, defaultGrams]);

  const foods = useQuery({
    queryKey: queryKeys.foods.search(debouncedTerm),
    enabled: open && !selected,
    queryFn: async () => {
      let query = supabase
        .from("foods")
        .select("id, name, brand, serving_size_g, kcal, protein_g")
        .is("deleted_at", null)
        .order("name")
        .limit(50);
      if (debouncedTerm) query = query.ilike("name", `%${debouncedTerm}%`);
      return unwrapList("buscar alimentos", await query);
    },
  });

  const gramsValue = Number(grams);
  const gramsInvalid = !Number.isFinite(gramsValue) || gramsValue <= 0 || gramsValue > 10_000;

  const confirm = async () => {
    if (!selected || gramsInvalid) return;
    await onPick(selected, gramsValue);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{selected ? selected.name : title}</DialogTitle>
        </DialogHeader>

        {!selected ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar alimento…"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                className="pl-9"
                autoFocus
                aria-label="Buscar alimento"
              />
              {foods.isFetching && (
                <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>

            <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
              {foods.isPending ? (
                <div className="space-y-3 p-4">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center justify-between gap-4">
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  ))}
                </div>
              ) : foods.isError ? (
                <div className="p-3">
                  <ErrorState
                    message="Falha ao buscar alimentos."
                    onRetry={foods.refetch}
                    compact
                  />
                </div>
              ) : foods.data.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  Nenhum alimento encontrado para “{debouncedTerm}”.
                </p>
              ) : (
                <ul>
                  {foods.data.map((f) => (
                    <li key={f.id}>
                      <button
                        type="button"
                        onClick={() =>
                          setSelected({
                            id: f.id,
                            name: f.name,
                            brand: f.brand,
                            servingSizeG: num(f.serving_size_g, 100),
                            kcal: num(f.kcal),
                          })
                        }
                        className="flex w-full items-center justify-between gap-3 border-b border-border/50 px-4 py-2.5 text-left transition-colors last:border-b-0 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{f.name}</span>
                          {f.brand && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {f.brand}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {Math.round(num(f.kcal))} kcal / {num(f.serving_size_g, 100)}g
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {Math.round(selected.kcal)} kcal por {selected.servingSizeG} g
              {selected.brand ? ` · ${selected.brand}` : ""}
            </p>

            <div className="space-y-2">
              <Label htmlFor="food-grams">Quantidade (g)</Label>
              <Input
                id="food-grams"
                type="number"
                inputMode="decimal"
                min={1}
                max={10000}
                value={grams}
                onChange={(e) => setGrams(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void confirm();
                }}
                aria-invalid={gramsInvalid}
                aria-describedby={gramsInvalid ? "food-grams-error" : undefined}
                autoFocus
              />
              {gramsInvalid && (
                <p id="food-grams-error" className="text-xs text-destructive">
                  Informe um valor entre 1 e 10.000 g.
                </p>
              )}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {QUICK_GRAMS.map((g) => (
                  <Button
                    key={g}
                    type="button"
                    size="sm"
                    variant={Number(grams) === g ? "default" : "outline"}
                    className="h-7 px-2.5 text-xs"
                    onClick={() => setGrams(String(g))}
                  >
                    {g} g
                  </Button>
                ))}
              </div>
            </div>

            {!gramsInvalid && (
              <p className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
                ≈ {Math.round((selected.kcal * gramsValue) / (selected.servingSizeG || 100))} kcal
              </p>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSelected(null)}>
                <ArrowLeft className="mr-1 size-4" />
                Voltar
              </Button>
              <Button
                className="flex-1"
                onClick={() => void confirm()}
                disabled={gramsInvalid || isPending}
              >
                {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                {confirmLabel}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
