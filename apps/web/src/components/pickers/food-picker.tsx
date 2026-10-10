/**
 * Seletor de alimento com quantidade — usado no diário e no editor de receitas.
 * No diário também oferece as **receitas** (prontas e da pessoa), que entram
 * na refeição como os ingredientes delas.
 *
 * O diálogo é uma coluna flexível com rolagem só vertical: nomes longos da
 * TACO ("Carne, bovina, capa de contra-filé, sem gordura, grelhada") quebram
 * em duas linhas em vez de alargar o diálogo e criar rolagem horizontal.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Clock, Loader2, Minus, Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/data/query-keys";
import { num, unwrapList } from "@/data/supabase-helpers";
import {
  RECIPE_CATEGORIES,
  fetchRecipes,
  recipeCategoryOf,
  type RecipeSummary,
} from "@/data/recipes";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ErrorState } from "@/components/query-boundary";
import { cn } from "@/lib/utils";

export type PickedFood = {
  id: string;
  name: string;
  brand: string | null;
  servingSizeG: number;
  kcal: number;
};

/** Quantidades comuns — evitam digitação no celular durante a refeição. */
const QUICK_GRAMS = [50, 100, 150, 200, 300];
const PORCOES = [0.5, 1, 1.5, 2, 3];

const kcalFmt = (n: number) => Math.round(n).toLocaleString("pt-BR");
const porcaoFmt = (n: number) => (n === 0.5 ? "½" : n.toLocaleString("pt-BR"));

export function FoodPicker({
  trigger,
  title = "Adicionar alimento",
  confirmLabel = "Adicionar",
  defaultGrams = 100,
  onPick,
  onPickRecipe,
  isPending,
}: {
  trigger: ReactNode;
  title?: string;
  confirmLabel?: string;
  defaultGrams?: number;
  /** Recebe o alimento e a quantidade em gramas. Deve fechar via retorno da promise. */
  onPick: (food: PickedFood, grams: number) => void | Promise<void>;
  /** Com esta função, o seletor ganha a aba Receitas. */
  onPickRecipe?: (recipe: RecipeSummary, portions: number) => void | Promise<void>;
  isPending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [aba, setAba] = useState<"alimentos" | "receitas">("alimentos");
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<PickedFood | null>(null);
  const [grams, setGrams] = useState(String(defaultGrams));
  const [receita, setReceita] = useState<RecipeSummary | null>(null);
  const [porcoes, setPorcoes] = useState(1);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const debouncedTerm = useDebouncedValue(term.trim(), 300);

  // Estado local zerado ao fechar: reabrir o diálogo deve começar limpo.
  useEffect(() => {
    if (open) return;
    const reset = setTimeout(() => {
      setTerm("");
      setSelected(null);
      setGrams(String(defaultGrams));
      setReceita(null);
      setPorcoes(1);
      setCategoria(null);
      setAba("alimentos");
    }, 150);
    return () => clearTimeout(reset);
  }, [open, defaultGrams]);

  const foods = useQuery({
    queryKey: queryKeys.foods.search(debouncedTerm),
    enabled: open && aba === "alimentos" && !selected,
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

  const receitas = useQuery({
    queryKey: [...queryKeys.recipes.all, "com-prontas"],
    enabled: open && Boolean(onPickRecipe) && aba === "receitas",
    queryFn: fetchRecipes,
  });

  const receitasFiltradas = useMemo(() => {
    const t = debouncedTerm.toLowerCase();
    return (receitas.data ?? []).filter(
      (r) =>
        (!categoria || (categoria === "minhas" ? !r.isSystem : r.category === categoria)) &&
        (!t || r.name.toLowerCase().includes(t)),
    );
  }, [receitas.data, categoria, debouncedTerm]);

  const gramsValue = Number(grams);
  const gramsInvalid = !Number.isFinite(gramsValue) || gramsValue <= 0 || gramsValue > 10_000;

  const confirm = async () => {
    if (!selected || gramsInvalid) return;
    await onPick(selected, gramsValue);
    setOpen(false);
  };

  const confirmarReceita = async () => {
    if (!receita || !onPickRecipe) return;
    setSalvando(true);
    try {
      await onPickRecipe(receita, porcoes);
      setOpen(false);
    } finally {
      setSalvando(false);
    }
  };

  const titulo = selected?.name ?? receita?.name ?? title;
  const lista = !selected && !receita;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="flex max-h-[min(88dvh,44rem)] flex-col gap-0 overflow-hidden rounded-[1.5rem] p-0 sm:p-0">
        <DialogHeader className="space-y-1 px-5 pb-3 pt-5 text-left">
          <DialogTitle className="line-clamp-2 break-words pr-8 text-xl leading-tight">
            {titulo}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Busque um alimento ou uma receita e escolha a quantidade.
          </DialogDescription>
        </DialogHeader>

        {lista && (
          <div className="space-y-3 px-5 pb-3">
            {onPickRecipe && (
              <div role="tablist" className="grid grid-cols-2 rounded-2xl bg-card p-1">
                {(["alimentos", "receitas"] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    role="tab"
                    aria-selected={aba === a}
                    onClick={() => setAba(a)}
                    className={cn(
                      "rounded-xl py-2.5 text-sm font-semibold transition-colors",
                      aba === a ? "bg-elevated text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {a === "alimentos" ? "Alimentos" : "Receitas"}
                  </button>
                ))}
              </div>
            )}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={aba === "alimentos" ? "Buscar alimento…" : "Buscar receita…"}
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                className="h-12 rounded-2xl pl-10"
                autoFocus
                aria-label={aba === "alimentos" ? "Buscar alimento" : "Buscar receita"}
              />
              {(foods.isFetching || receitas.isFetching) && (
                <Loader2 className="absolute right-3.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>
            {aba === "receitas" && (
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Categoria">
                {[
                  { key: null, label: "Todas" },
                  ...RECIPE_CATEGORIES.map((c) => ({ key: c.key, label: `${c.emoji} ${c.label}` })),
                  { key: "minhas", label: "Minhas" },
                ].map((c) => (
                  <button
                    key={c.key ?? "todas"}
                    type="button"
                    role="radio"
                    aria-checked={categoria === c.key}
                    onClick={() => setCategoria(c.key)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                      categoria === c.key
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-5 pb-5">
          {selected ? (
            <EscolherGramas
              food={selected}
              grams={grams}
              setGrams={setGrams}
              invalid={gramsInvalid}
              onBack={() => setSelected(null)}
              onConfirm={() => void confirm()}
              confirmLabel={confirmLabel}
              isPending={isPending}
            />
          ) : receita ? (
            <EscolherPorcoes
              receita={receita}
              porcoes={porcoes}
              setPorcoes={setPorcoes}
              onBack={() => setReceita(null)}
              onConfirm={() => void confirmarReceita()}
              isPending={salvando}
            />
          ) : aba === "alimentos" ? (
            foods.isPending ? (
              <ListaCarregando />
            ) : foods.isError ? (
              <ErrorState message="Falha ao buscar alimentos." onRetry={foods.refetch} compact />
            ) : foods.data.length === 0 ? (
              <Vazio>Nenhum alimento encontrado para “{debouncedTerm}”.</Vazio>
            ) : (
              <ul className="divide-y divide-border/50 overflow-hidden rounded-2xl bg-card">
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
                      className="block w-full px-4 py-3 text-left transition-colors hover:bg-elevated focus-visible:bg-elevated focus-visible:outline-none"
                    >
                      <span className="line-clamp-2 break-words font-medium leading-snug">
                        {f.name}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">
                        {kcalFmt(num(f.kcal))} kcal · P {Math.round(num(f.protein_g))} g ·{" "}
                        {num(f.serving_size_g, 100)} g{f.brand ? ` · ${f.brand}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : receitas.isPending ? (
            <ListaCarregando />
          ) : receitas.isError ? (
            <ErrorState message="Falha ao carregar receitas." onRetry={receitas.refetch} compact />
          ) : receitasFiltradas.length === 0 ? (
            <Vazio>Nenhuma receita encontrada.</Vazio>
          ) : (
            <ul className="space-y-2">
              {receitasFiltradas.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setReceita(r)}
                    className="flex w-full items-center gap-3 rounded-2xl bg-card p-3 text-left transition-colors hover:bg-elevated"
                  >
                    <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-elevated text-2xl">
                      {recipeCategoryOf(r.category)?.emoji ?? "🍽️"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 break-words font-semibold leading-snug">
                        {r.name}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">
                        {kcalFmt(r.perServing.kcal)} kcal · P {Math.round(r.perServing.proteinG)} g
                        {r.prepMinutes ? ` · ${r.prepMinutes} min` : ""}
                        {!r.isSystem ? " · sua" : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EscolherGramas({
  food,
  grams,
  setGrams,
  invalid,
  onBack,
  onConfirm,
  confirmLabel,
  isPending,
}: {
  food: PickedFood;
  grams: string;
  setGrams: (g: string) => void;
  invalid: boolean;
  onBack: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  isPending?: boolean;
}) {
  const valor = Number(grams);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {Math.round(food.kcal)} kcal por {food.servingSizeG} g{food.brand ? ` · ${food.brand}` : ""}
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
            if (e.key === "Enter") onConfirm();
          }}
          aria-invalid={invalid}
          aria-describedby={invalid ? "food-grams-error" : undefined}
          className="h-14 rounded-2xl text-2xl font-bold tabular-nums"
          autoFocus
        />
        {invalid && (
          <p id="food-grams-error" className="text-xs text-destructive">
            Informe um valor entre 1 e 10.000 g.
          </p>
        )}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {QUICK_GRAMS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGrams(String(g))}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium tabular-nums transition-colors",
                valor === g
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {g} g
            </button>
          ))}
        </div>
      </div>

      {!invalid && (
        <p className="rounded-2xl bg-primary/10 px-4 py-3 text-center font-semibold text-primary tabular-nums">
          ≈ {kcalFmt((food.kcal * valor) / (food.servingSizeG || 100))} kcal
        </p>
      )}

      <div className="flex gap-2">
        <Button variant="outline" className="h-12" onClick={onBack}>
          <ArrowLeft className="mr-1 size-4" />
          Voltar
        </Button>
        <Button className="h-12 flex-1" onClick={onConfirm} disabled={invalid || isPending}>
          {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}

function EscolherPorcoes({
  receita,
  porcoes,
  setPorcoes,
  onBack,
  onConfirm,
  isPending,
}: {
  receita: RecipeSummary;
  porcoes: number;
  setPorcoes: (p: number) => void;
  onBack: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  const fator = porcoes / receita.servings;
  const m = receita.perServing;
  const idx = PORCOES.indexOf(porcoes);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {recipeCategoryOf(receita.category)?.label ?? "Sua receita"} · rende {receita.servings}{" "}
        {receita.servings === 1 ? "porção" : "porções"}
        {receita.prepMinutes ? (
          <span className="inline-flex items-center gap-1">
            {" "}
            · <Clock className="size-3.5" aria-hidden /> {receita.prepMinutes} min
          </span>
        ) : null}
      </p>

      {/* Porções */}
      <div className="flex items-center justify-between rounded-2xl bg-card p-2">
        <button
          type="button"
          onClick={() => setPorcoes(PORCOES[Math.max(0, idx - 1)]!)}
          disabled={idx <= 0}
          aria-label="Menos"
          className="grid size-11 place-items-center rounded-xl bg-elevated disabled:opacity-40"
        >
          <Minus className="size-5" />
        </button>
        <p className="text-center">
          <span className="block text-2xl font-extrabold tabular-nums">{porcaoFmt(porcoes)}</span>
          <span className="text-xs text-muted-foreground">
            {porcoes <= 1 ? "porção" : "porções"}
          </span>
        </p>
        <button
          type="button"
          onClick={() => setPorcoes(PORCOES[Math.min(PORCOES.length - 1, idx + 1)]!)}
          disabled={idx >= PORCOES.length - 1}
          aria-label="Mais"
          className="grid size-11 place-items-center rounded-xl bg-elevated disabled:opacity-40"
        >
          <Plus className="size-5" />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          ["kcal", m.kcal * porcoes],
          ["Prot.", m.proteinG * porcoes],
          ["Carbo", m.carbsG * porcoes],
          ["Gord.", m.fatG * porcoes],
        ].map(([rotulo, valor]) => (
          <div key={rotulo as string} className="rounded-2xl bg-card px-1 py-2.5">
            <p className="font-bold tabular-nums">{Math.round(valor as number)}</p>
            <p className="text-[11px] text-muted-foreground">{rotulo}</p>
          </div>
        ))}
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">Ingredientes</p>
        <ul className="divide-y divide-border/50 rounded-2xl bg-card">
          {receita.items.map((i) => (
            <li
              key={i.foodId + i.grams}
              className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm"
            >
              <span className="min-w-0 break-words">{i.name}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {Math.round(i.grams * fator)} g
              </span>
            </li>
          ))}
        </ul>
      </div>

      {receita.instructions && (
        <div>
          <p className="mb-1 text-sm font-semibold">Modo de preparo</p>
          <p className="text-sm leading-relaxed text-muted-foreground">{receita.instructions}</p>
        </div>
      )}

      <div className="sticky bottom-0 -mx-5 flex gap-2 bg-background px-5 pt-2">
        <Button variant="outline" className="h-12" onClick={onBack}>
          <ArrowLeft className="mr-1 size-4" />
          Voltar
        </Button>
        <Button className="h-12 flex-1" onClick={onConfirm} disabled={isPending}>
          {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Adicionar receita
        </Button>
      </div>
    </div>
  );
}

function ListaCarregando() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-16 w-full rounded-2xl" />
      ))}
    </div>
  );
}

function Vazio({ children }: { children: ReactNode }) {
  return <p className="p-6 text-center text-sm text-muted-foreground">{children}</p>;
}
