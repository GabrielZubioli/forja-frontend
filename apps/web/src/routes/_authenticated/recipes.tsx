import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Clock, Copy, Loader2, Pencil, Plus, Search, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/data/query-keys";
import { assertOk, errorMessage, unwrap } from "@/data/supabase-helpers";
import {
  RECIPE_CATEGORIES,
  fetchRecipes,
  recipeCategoryOf,
  type RecipeSummary,
} from "@/data/recipes";
import { useCurrentUserId } from "@/hooks/use-current-user";
import { PageBody, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmButton } from "@/components/confirm-button";
import { ErrorState } from "@/components/query-boundary";
import { cn } from "@/lib/utils";

/**
 * Receitas: as prontas do app, por categoria, e as da pessoa.
 *
 * As prontas não se editam (são de todos); abrem num detalhe com macros,
 * ingredientes e preparo, e podem ser copiadas para as da pessoa — que aí
 * edita à vontade. Na Dieta, as duas aparecem na aba Receitas do Adicionar.
 */
export const Route = createFileRoute("/_authenticated/recipes")({
  head: () => ({
    meta: [
      { title: "Receitas — Habitual Fit" },
      { name: "description", content: "Receitas prontas e suas, com macros por porção." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RecipesPage,
});

const kcal = (n: number) => Math.round(n).toLocaleString("pt-BR");

function RecipesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const userId = useCurrentUserId();
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState<string | null>(null);
  const [aberta, setAberta] = useState<RecipeSummary | null>(null);

  const receitas = useQuery({
    queryKey: [...queryKeys.recipes.all, "com-prontas"],
    queryFn: fetchRecipes,
  });

  const invalidar = () => qc.invalidateQueries({ queryKey: queryKeys.recipes.all });

  const criar = useMutation({
    mutationFn: async () =>
      unwrap(
        "criar receita",
        await supabase
          .from("recipes")
          .insert({ user_id: userId, name: "Nova receita", servings: 1 })
          .select("id")
          .single(),
      ).id,
    onSuccess: (id) => {
      void invalidar();
      void navigate({ to: "/recipes/$id", params: { id } });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const copiar = useMutation({
    mutationFn: async (r: RecipeSummary) => {
      const nova = unwrap(
        "copiar receita",
        await supabase
          .from("recipes")
          .insert({
            user_id: userId,
            name: r.name,
            servings: r.servings,
            category: r.category,
            prep_minutes: r.prepMinutes,
            instructions: r.instructions,
          })
          .select("id")
          .single(),
      );
      assertOk(
        "copiar ingredientes",
        await supabase
          .from("recipe_items")
          .insert(r.items.map((i) => ({ recipe_id: nova.id, food_id: i.foodId, grams: i.grams }))),
      );
      return nova.id;
    },
    onSuccess: (id) => {
      toast.success("Copiada para suas receitas");
      void invalidar();
      void navigate({ to: "/recipes/$id", params: { id } });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      assertOk(
        "excluir receita",
        await supabase
          .from("recipes")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", id),
      );
      return id;
    },
    onSuccess: (id) => {
      void invalidar();
      toast.success("Receita excluída", {
        action: {
          label: "Desfazer",
          onClick: () =>
            void supabase
              .from("recipes")
              .update({ deleted_at: null })
              .eq("id", id)
              .then(() => invalidar()),
        },
      });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (receitas.data ?? []).filter(
      (r) =>
        (!t || r.name.toLowerCase().includes(t)) &&
        (!categoria || (categoria === "minhas" ? !r.isSystem : r.category === categoria)),
    );
  }, [receitas.data, busca, categoria]);

  const minhas = filtradas.filter((r) => !r.isSystem);
  const prontas = filtradas.filter((r) => r.isSystem);

  return (
    <>
      <PageHeader
        title="Receitas"
        description={
          receitas.data
            ? `${receitas.data.filter((r) => r.isSystem).length} receitas prontas`
            : undefined
        }
        action={
          <Button
            onClick={() => criar.mutate()}
            disabled={criar.isPending}
            className="rounded-full"
          >
            <Plus className="mr-1 size-4" />
            Nova
          </Button>
        }
      />
      <PageBody>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar receita…"
            className="h-12 rounded-2xl border-transparent bg-card pl-12"
            aria-label="Buscar receita"
          />
        </div>
        <div
          className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
          role="radiogroup"
          aria-label="Categoria"
        >
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
                "shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors",
                categoria === c.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        {receitas.isPending ? (
          <div className="mt-6 space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 rounded-[1.25rem]" />
            ))}
          </div>
        ) : receitas.isError ? (
          <ErrorState message={errorMessage(receitas.error)} onRetry={receitas.refetch} />
        ) : (
          <>
            {minhas.length > 0 && (
              <section className="mt-6" aria-label="Suas receitas">
                <h2 className="mb-3 px-1 text-lg font-semibold">Suas receitas</h2>
                <ul className="space-y-2">
                  {minhas.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center gap-2 rounded-[1.25rem] bg-card p-2 pr-3"
                    >
                      <Link
                        to="/recipes/$id"
                        params={{ id: r.id }}
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1"
                      >
                        <Emoji categoria={r.category} />
                        <Linha r={r} />
                      </Link>
                      <Link
                        to="/recipes/$id"
                        params={{ id: r.id }}
                        aria-label={`Editar ${r.name}`}
                        className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-elevated hover:text-foreground"
                      >
                        <Pencil className="size-4" />
                      </Link>
                      <ConfirmButton
                        aria-label={`Excluir receita ${r.name}`}
                        title="Excluir esta receita?"
                        description={`“${r.name}” sai da lista. Lançamentos já feitos no diário não são afetados.`}
                        onConfirm={() => excluir.mutate(r.id)}
                      >
                        <Trash2 className="size-4" />
                      </ConfirmButton>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Sem filtro: um destaque e cada categoria numa fileira que rola de lado. */}
            {!busca.trim() && !categoria && prontas.length > 0 && (
              <section className="mt-6" aria-label="Mais proteína">
                <Titulo icone={<Zap className="size-4" />} texto="Mais proteína por caloria" />
                <Fileira>
                  {[...prontas]
                    .sort(
                      (x, y) =>
                        y.perServing.proteinG / Math.max(1, y.perServing.kcal) -
                        x.perServing.proteinG / Math.max(1, x.perServing.kcal),
                    )
                    .slice(0, 8)
                    .map((r) => (
                      <CartaoReceita key={r.id} r={r} onOpen={() => setAberta(r)} grande />
                    ))}
                </Fileira>
              </section>
            )}

            {RECIPE_CATEGORIES.map((c) => {
              const daCategoria = prontas.filter((r) => r.category === c.key);
              if (daCategoria.length === 0) return null;
              const emGrade = Boolean(busca.trim() || categoria);
              return (
                <section key={c.key} className="mt-7" aria-label={c.label}>
                  <Titulo
                    icone={<span aria-hidden>{c.emoji}</span>}
                    texto={c.label}
                    contador={daCategoria.length}
                  />
                  {emGrade ? (
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                      {daCategoria.map((r) => (
                        <CartaoReceita key={r.id} r={r} onOpen={() => setAberta(r)} />
                      ))}
                    </div>
                  ) : (
                    <Fileira>
                      {daCategoria.map((r) => (
                        <CartaoReceita key={r.id} r={r} onOpen={() => setAberta(r)} />
                      ))}
                    </Fileira>
                  )}
                </section>
              );
            })}

            {filtradas.length === 0 && (
              <div className="mt-10 text-center text-muted-foreground">
                <BookOpen className="mx-auto size-8" aria-hidden />
                <p className="mt-2">Nenhuma receita encontrada.</p>
              </div>
            )}
          </>
        )}
      </PageBody>

      <Dialog open={aberta !== null} onOpenChange={(o) => !o && setAberta(null)}>
        <DialogContent className="flex max-h-[min(88dvh,44rem)] flex-col gap-0 overflow-hidden rounded-[1.5rem] p-0 sm:p-0">
          {aberta && (
            <>
              <DialogHeader className="space-y-1 px-5 pb-3 pt-5 text-left">
                <DialogTitle className="pr-8 text-xl leading-tight">
                  {recipeCategoryOf(aberta.category)?.emoji} {aberta.name}
                </DialogTitle>
                <DialogDescription className="flex items-center gap-1">
                  Rende {aberta.servings} {aberta.servings === 1 ? "porção" : "porções"}
                  {aberta.prepMinutes && (
                    <>
                      {" "}
                      · <Clock className="size-3.5" aria-hidden /> {aberta.prepMinutes} min
                    </>
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-5 pb-5">
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    ["kcal", aberta.perServing.kcal],
                    ["Prot.", aberta.perServing.proteinG],
                    ["Carbo", aberta.perServing.carbsG],
                    ["Gord.", aberta.perServing.fatG],
                  ].map(([rotulo, valor]) => (
                    <div key={rotulo as string} className="rounded-2xl bg-card px-1 py-2.5">
                      <p className="font-bold tabular-nums">{Math.round(valor as number)}</p>
                      <p className="text-[11px] text-muted-foreground">{rotulo} / porção</p>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold">Ingredientes (receita inteira)</p>
                  <ul className="divide-y divide-border/50 rounded-2xl bg-card">
                    {aberta.items.map((i) => (
                      <li
                        key={i.foodId + i.grams}
                        className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm"
                      >
                        <span className="min-w-0 break-words">{i.name}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {i.grams} g
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                {aberta.instructions && (
                  <div>
                    <p className="mb-1 text-sm font-semibold">Modo de preparo</p>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {aberta.instructions}
                    </p>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  Para comer, use <b>Dieta → Adicionar → Receitas</b> na refeição.
                </p>
                <Button
                  variant="outline"
                  className="h-12 w-full"
                  onClick={() => copiar.mutate(aberta)}
                  disabled={copiar.isPending}
                >
                  {copiar.isPending ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Copy className="mr-2 size-4" />
                  )}
                  Copiar para minhas receitas
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Emoji({ categoria }: { categoria: string | null }) {
  return (
    <span
      className="grid size-12 shrink-0 place-items-center rounded-xl bg-elevated text-2xl"
      aria-hidden
    >
      {recipeCategoryOf(categoria)?.emoji ?? "🍽️"}
    </span>
  );
}

function Linha({ r }: { r: RecipeSummary }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="line-clamp-2 break-words font-semibold leading-snug">{r.name}</span>
      <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">
        {kcal(r.perServing.kcal)} kcal · P {Math.round(r.perServing.proteinG)} g por porção
        {r.prepMinutes ? ` · ${r.prepMinutes} min` : ""}
      </span>
    </span>
  );
}

/** Tom de fundo de cada categoria: identifica a fileira sem depender de foto. */
const TOM: Record<string, string> = {
  vitaminas: "var(--chart-5)",
  "cafe-da-manha": "var(--chart-4)",
  sanduiches: "var(--chart-2)",
  pratos: "var(--chart-1)",
  saladas: "var(--chart-1)",
  lanches: "var(--chart-4)",
  "bolos-e-doces": "var(--chart-5)",
};

function Titulo({
  icone,
  texto,
  contador,
}: {
  icone: React.ReactNode;
  texto: string;
  contador?: number;
}) {
  return (
    <h2 className="mb-3 flex items-center gap-2 px-1 text-lg font-bold">
      <span className="text-primary">{icone}</span>
      {texto}
      {contador ? (
        <span className="ml-auto text-sm font-medium text-muted-foreground">{contador}</span>
      ) : null}
    </h2>
  );
}

function Fileira({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto scroll-px-4 px-4 pb-1 [scrollbar-width:none]">
      {children}
    </div>
  );
}

function CartaoReceita({
  r,
  onOpen,
  grande = false,
}: {
  r: RecipeSummary;
  onOpen: () => void;
  grande?: boolean;
}) {
  const tom = TOM[r.category ?? ""] ?? "var(--chart-1)";
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex shrink-0 snap-start flex-col overflow-hidden rounded-[1.25rem] bg-card text-left transition-transform active:scale-[0.98]",
        grande ? "w-48" : "w-40 min-w-0 [.grid_&]:w-auto",
      )}
    >
      <span
        className={cn("grid w-full place-items-center", grande ? "h-28 text-6xl" : "h-24 text-5xl")}
        style={{ background: `color-mix(in oklch, ${tom} 18%, transparent)` }}
        aria-hidden
      >
        {recipeCategoryOf(r.category)?.emoji ?? "🍽️"}
      </span>
      <span className="flex flex-1 flex-col p-3">
        <span className="line-clamp-2 min-h-[2.5rem] break-words text-sm font-bold leading-tight">
          {r.name}
        </span>
        <span className="mt-2 flex flex-wrap gap-1 text-[11px] font-semibold tabular-nums">
          <span className="rounded-full bg-elevated px-2 py-0.5">{kcal(r.perServing.kcal)} kcal</span>
          <span className="rounded-full bg-primary/12 px-2 py-0.5 text-primary">
            {Math.round(r.perServing.proteinG)} g P
          </span>
          {r.prepMinutes ? (
            <span className="rounded-full bg-elevated px-2 py-0.5 text-muted-foreground">
              {r.prepMinutes} min
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}
