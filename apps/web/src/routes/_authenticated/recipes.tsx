import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/data/query-keys";
import { assertOk, errorMessage, unwrap, unwrapList } from "@/data/supabase-helpers";
import { useCurrentUserId } from "@/hooks/use-current-user";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/confirm-button";
import { CardGridSkeleton, EmptyState, QueryBoundary } from "@/components/query-boundary";
import { Plus, Trash2, BookOpen } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/recipes")({
  head: () => ({
    meta: [
      { title: "Receitas — Habitual Fit" },
      { name: "description", content: "Suas receitas com macros calculados automaticamente." },
      { property: "og:title", content: "Receitas — Habitual Fit" },
      {
        property: "og:description",
        content: "Monte receitas reutilizáveis para o diário alimentar.",
      },
    ],
  }),
  component: RecipesPage,
});

function RecipesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const userId = useCurrentUserId();

  const recipes = useQuery({
    queryKey: queryKeys.recipes.list(),
    queryFn: async () =>
      unwrapList(
        "carregar receitas",
        await supabase
          .from("recipes")
          .select("id, name, servings, notes, recipe_items(count)")
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
      ),
  });

  const create = useMutation({
    mutationFn: async () => {
      const created = unwrap(
        "criar receita",
        await supabase
          .from("recipes")
          .insert({ user_id: userId, name: "Nova receita", servings: 1 })
          .select("id")
          .single(),
      );
      return created.id;
    },
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: queryKeys.recipes.all });
      void navigate({ to: "/recipes/$id", params: { id } });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = useMutation({
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
      void qc.invalidateQueries({ queryKey: queryKeys.recipes.all });
      // Soft delete: dá para restaurar enquanto o toast estiver visível.
      toast.success("Receita excluída", {
        action: { label: "Desfazer", onClick: () => restore.mutate(id) },
      });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const restore = useMutation({
    mutationFn: async (id: string) => {
      assertOk(
        "restaurar receita",
        await supabase.from("recipes").update({ deleted_at: null }).eq("id", id),
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.recipes.all });
      toast.success("Receita restaurada");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <PageHeader
        wide
        title="Receitas"
        description="Combine alimentos e reaproveite no diário."
        action={
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            <Plus className="mr-1 size-4" />
            Nova receita
          </Button>
        }
      />
      <PageBody wide>
        <QueryBoundary
          query={recipes}
          skeleton={<CardGridSkeleton />}
          empty={
            <EmptyState
              icon={<BookOpen className="size-6" />}
              title="Nenhuma receita ainda"
              description="Monte uma combinação de alimentos uma vez e lance no diário quantas vezes quiser, com os macros já calculados por porção."
              action={
                <Button onClick={() => create.mutate()} disabled={create.isPending}>
                  <Plus className="mr-1 size-4" />
                  Criar minha primeira receita
                </Button>
              }
            />
          }
        >
          {(list) => (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {list.map((r) => {
                const count = r.recipe_items?.[0]?.count ?? 0;
                return (
                  <Card key={r.id} className="transition-shadow hover:shadow-md">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <Link to="/recipes/$id" params={{ id: r.id }} className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{r.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {count === 1 ? "1 ingrediente" : `${count} ingredientes`} ·{" "}
                            {r.servings === 1 ? "1 porção" : `${r.servings} porções`}
                          </p>
                        </Link>
                        <BookOpen className="size-5 shrink-0 text-muted-foreground" />
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" variant="outline" asChild className="flex-1">
                          <Link to="/recipes/$id" params={{ id: r.id }}>
                            Editar
                          </Link>
                        </Button>
                        <ConfirmButton
                          aria-label={`Excluir receita ${r.name}`}
                          title="Excluir esta receita?"
                          description={`“${r.name}” sai da lista. Lançamentos já feitos no diário não são afetados.`}
                          onConfirm={() => remove.mutate(r.id)}
                        >
                          <Trash2 className="size-4" />
                        </ConfirmButton>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </QueryBoundary>
      </PageBody>
    </>
  );
}
