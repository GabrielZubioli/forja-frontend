import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/data/query-keys";
import { assertOk, errorMessage, num, unwrap, unwrapList } from "@/data/supabase-helpers";
import { useCurrentUserId } from "@/hooks/use-current-user";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmButton } from "@/components/confirm-button";
import { ErrorState } from "@/components/query-boundary";
import { FoodPicker } from "@/components/pickers/food-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Save, UtensilsCrossed } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { MEALS, type MealValue } from "@/lib/labels";
import { todayISO } from "@/lib/date";
import { nutritionTotals, perServing, portionMacros, type Portion } from "@forja/domain";

export const Route = createFileRoute("/_authenticated/recipes_/$id")({
  head: () => ({
    meta: [
      { title: "Editar receita — Habitual Fit" },
      { name: "description", content: "Ajuste ingredientes e porções." },
      { property: "og:title", content: "Editar receita — Habitual Fit" },
      { property: "og:description", content: "Cálculo automático de macros por porção." },
    ],
  }),
  component: RecipeEditor,
});

type RecipeItem = {
  id: string;
  grams: number;
  foods: {
    id: string;
    name: string;
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
    serving_size_g: number;
  } | null;
};

function toPortion(item: RecipeItem): Portion {
  const f = item.foods;
  return {
    food: {
      servingSizeG: f?.serving_size_g ?? 100,
      kcal: f?.kcal ?? 0,
      proteinG: f?.protein_g ?? 0,
      carbsG: f?.carbs_g ?? 0,
      fatG: f?.fat_g ?? 0,
      fiberG: f?.fiber_g ?? 0,
    },
    grams: item.grams,
  };
}

function RecipeEditor() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const userId = useCurrentUserId();

  const [name, setName] = useState("");
  const [servings, setServings] = useState(1);
  const [notes, setNotes] = useState("");

  const recipe = useQuery({
    queryKey: queryKeys.recipes.detail(id),
    queryFn: async () =>
      unwrap("carregar receita", await supabase.from("recipes").select("*").eq("id", id).single()),
  });

  const items = useQuery({
    queryKey: queryKeys.recipes.items(id),
    queryFn: async () =>
      unwrapList(
        "carregar ingredientes",
        await supabase
          .from("recipe_items")
          .select(
            "id, grams, foods(id, name, kcal, protein_g, carbs_g, fat_g, fiber_g, serving_size_g)",
          )
          .eq("recipe_id", id)
          .order("created_at"),
      ) as RecipeItem[],
  });

  useEffect(() => {
    if (!recipe.data) return;
    setName(recipe.data.name);
    setServings(Math.max(1, recipe.data.servings));
    setNotes(recipe.data.notes ?? "");
  }, [recipe.data]);

  const invalidateItems = () => qc.invalidateQueries({ queryKey: queryKeys.recipes.items(id) });

  const save = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Dê um nome à receita.");
      assertOk(
        "salvar receita",
        await supabase
          .from("recipes")
          .update({
            name: trimmed,
            servings: Math.max(1, servings || 1),
            notes: notes.trim() || null,
          })
          .eq("id", id),
      );
    },
    onSuccess: () => {
      toast.success("Receita salva");
      void qc.invalidateQueries({ queryKey: queryKeys.recipes.all });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const addItem = useMutation({
    mutationFn: async ({ foodId, grams }: { foodId: string; grams: number }) => {
      assertOk(
        "adicionar ingrediente",
        await supabase.from("recipe_items").insert({ recipe_id: id, food_id: foodId, grams }),
      );
    },
    onSuccess: () => void invalidateItems(),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const updateItem = useMutation({
    mutationFn: async ({ itemId, grams }: { itemId: string; grams: number }) => {
      assertOk(
        "atualizar ingrediente",
        await supabase.from("recipe_items").update({ grams }).eq("id", itemId),
      );
    },
    onSuccess: () => void invalidateItems(),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const removeItem = useMutation({
    mutationFn: async (itemId: string) => {
      assertOk(
        "remover ingrediente",
        await supabase.from("recipe_items").delete().eq("id", itemId),
      );
    },
    onSuccess: () => void invalidateItems(),
    onError: (e) => toast.error(errorMessage(e)),
  });

  // `items.data ?? []` criaria um array novo a cada render, invalidando o memo.
  const list = useMemo(() => items.data ?? [], [items.data]);
  const totals = useMemo(() => nutritionTotals(list.map(toPortion)), [list]);
  const porPorcao = perServing(totals, servings);

  const logToDiary = useMutation({
    mutationFn: async ({ meal, portions }: { meal: MealValue; portions: number }) => {
      if (list.length === 0) throw new Error("Adicione ingredientes antes de lançar no diário.");
      if (!Number.isFinite(portions) || portions <= 0)
        throw new Error("Informe um número de porções válido.");

      const today = todayISO();
      const inserts = list
        .filter((it) => it.foods)
        .map((it) => ({
          user_id: userId,
          food_id: it.foods!.id,
          log_date: today,
          meal_slot: meal,
          grams: (num(it.grams) / Math.max(1, servings)) * portions,
          servings: 1,
          notes: `Da receita: ${name}`,
        }));

      assertOk("lançar receita no diário", await supabase.from("food_log_entries").insert(inserts));
      return today;
    },
    onSuccess: (today) => {
      toast.success("Adicionado ao diário de hoje");
      // Antes o cache do diário não era invalidado: ao navegar para /diet o
      // usuário via os dados antigos até o refetch.
      void qc.invalidateQueries({ queryKey: queryKeys.diet.log(today) });
      void qc.invalidateQueries({ queryKey: queryKeys.diet.all });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (recipe.isError) {
    return (
      <>
        <PageHeader title="Receita" description="" />
        <PageBody>
          <ErrorState message={errorMessage(recipe.error)} onRetry={recipe.refetch} />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={recipe.isPending ? "Carregando…" : name || "Receita"}
        description={`${list.length === 1 ? "1 ingrediente" : `${list.length} ingredientes`} · ${servings === 1 ? "1 porção" : `${servings} porções`}`}
        action={
          <>
            <Button variant="outline" asChild>
              <Link to="/recipes">Voltar</Link>
            </Button>
            <LogToDiary
              disabled={list.length === 0 || logToDiary.isPending}
              onLog={(meal, portions) => logToDiary.mutate({ meal, portions })}
            />
            <Button onClick={() => save.mutate()} disabled={save.isPending || recipe.isPending}>
              <Save className="mr-1 size-4" />
              Salvar
            </Button>
          </>
        }
      />
      <PageBody>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="space-y-1.5">
                <Label htmlFor="recipe-name">Nome</Label>
                <Input
                  id="recipe-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Panqueca de banana"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="recipe-servings">Porções</Label>
                <Input
                  id="recipe-servings"
                  type="number"
                  min={1}
                  max={100}
                  value={servings}
                  onChange={(e) => setServings(Math.max(1, Number(e.target.value) || 1))}
                />
                <p className="text-xs text-muted-foreground">
                  Em quantas porções esta receita rende. Os macros abaixo são por porção.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="recipe-notes">Notas</Label>
                <Textarea
                  id="recipe-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Modo de preparo, observações…"
                />
              </div>

              <div className="rounded-lg border border-border p-3 text-sm">
                <p className="mb-2 font-semibold">Por porção</p>
                {items.isPending ? (
                  <div className="space-y-2">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <Skeleton key={i} className="h-3 w-full" />
                    ))}
                  </div>
                ) : (
                  <dl className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                    <dt>Calorias</dt>
                    <dd className="text-right font-medium text-foreground">
                      {Math.round(porPorcao.kcal)} kcal
                    </dd>
                    <dt>Proteína</dt>
                    <dd className="text-right font-medium text-foreground">
                      {porPorcao.proteinG.toFixed(1)} g
                    </dd>
                    <dt>Carboidrato</dt>
                    <dd className="text-right font-medium text-foreground">
                      {porPorcao.carbsG.toFixed(1)} g
                    </dd>
                    <dt>Gordura</dt>
                    <dd className="text-right font-medium text-foreground">
                      {porPorcao.fatG.toFixed(1)} g
                    </dd>
                    <dt>Fibra</dt>
                    <dd className="text-right font-medium text-foreground">
                      {porPorcao.fiberG.toFixed(1)} g
                    </dd>
                  </dl>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">Ingredientes</h2>
                <FoodPicker
                  title="Adicionar ingrediente"
                  isPending={addItem.isPending}
                  onPick={(food, grams) => addItem.mutateAsync({ foodId: food.id, grams })}
                  trigger={
                    <Button size="sm">
                      <Plus className="mr-1 size-4" />
                      Ingrediente
                    </Button>
                  }
                />
              </div>

              {items.isPending ? (
                <div className="space-y-3 py-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="size-4 rounded" />
                      <Skeleton className="h-4 flex-1" />
                      <Skeleton className="h-9 w-20" />
                    </div>
                  ))}
                </div>
              ) : items.isError ? (
                <ErrorState message={errorMessage(items.error)} onRetry={items.refetch} compact />
              ) : list.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Adicione ingredientes para calcular os macros automaticamente.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {list.map((it) => {
                    const macros = portionMacros(toPortion(it));
                    return (
                      <li key={it.id} className="flex items-center gap-3 py-3">
                        <UtensilsCrossed
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">
                            {it.foods?.name ?? "Alimento removido"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {Math.round(macros.kcal)} kcal · P {macros.proteinG.toFixed(1)} · C{" "}
                            {macros.carbsG.toFixed(1)} · G {macros.fatG.toFixed(1)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={0}
                            max={10000}
                            defaultValue={num(it.grams)}
                            className="w-20"
                            aria-label={`Gramas de ${it.foods?.name ?? "ingrediente"}`}
                            onBlur={(e) => {
                              const grams = Number(e.target.value);
                              if (!Number.isFinite(grams) || grams < 0 || grams > 10_000) {
                                toast.error("Informe um valor entre 0 e 10.000 g.");
                                e.target.value = String(num(it.grams));
                                return;
                              }
                              if (grams !== num(it.grams))
                                updateItem.mutate({ itemId: it.id, grams });
                            }}
                          />
                          <span className="text-xs text-muted-foreground">g</span>
                        </div>
                        <ConfirmButton
                          aria-label={`Remover ${it.foods?.name ?? "ingrediente"} da receita`}
                          title="Remover ingrediente?"
                          description="Os macros da receita serão recalculados."
                          confirmLabel="Remover"
                          onConfirm={() => removeItem.mutate(it.id)}
                        >
                          <Trash2 className="size-4" />
                        </ConfirmButton>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </PageBody>
    </>
  );
}

function LogToDiary({
  onLog,
  disabled,
}: {
  onLog: (meal: MealValue, portions: number) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [meal, setMeal] = useState<MealValue>("lunch");
  const [portions, setPortions] = useState("1");

  const value = Number(portions);
  const invalid = !Number.isFinite(value) || value <= 0 || value > 50;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          <Plus className="mr-1 size-4" />
          Diário
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Adicionar ao diário de hoje</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="log-meal">Refeição</Label>
            <Select value={meal} onValueChange={(v) => setMeal(v as MealValue)}>
              <SelectTrigger id="log-meal">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEALS.map((m) => (
                  <SelectItem key={m.key} value={m.key}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="log-portions">Porções</Label>
            <Input
              id="log-portions"
              type="number"
              min={0.25}
              max={50}
              step={0.25}
              value={portions}
              onChange={(e) => setPortions(e.target.value)}
              aria-invalid={invalid}
              aria-describedby={invalid ? "log-portions-error" : undefined}
            />
            {invalid && (
              <p id="log-portions-error" className="text-xs text-destructive">
                Informe um valor entre 0,25 e 50.
              </p>
            )}
          </div>
          <Button
            className="w-full"
            disabled={invalid}
            onClick={() => {
              onLog(meal, value);
              setOpen(false);
            }}
          >
            Adicionar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
