import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { assertOk, unwrapList } from "@/data/supabase-helpers";
import { useCurrentUserId } from "@/hooks/use-current-user";

const CHAVE = ["exercises", "favorites"] as const;

async function fetchFavoriteIds(): Promise<string[]> {
  return unwrapList(
    "carregar favoritos",
    await supabase.from("exercise_favorites").select("exercise_id").order("created_at", { ascending: false }),
  ).map((r) => r.exercise_id);
}

/**
 * Exercícios favoritos da pessoa (salvos no banco, valem em qualquer aparelho).
 * O coração muda na hora (otimista) e volta atrás se a gravação falhar.
 */
export function useFavoritos() {
  const userId = useCurrentUserId();
  const qc = useQueryClient();
  const lista = useQuery({ queryKey: CHAVE, queryFn: fetchFavoriteIds });
  const ids = new Set(lista.data ?? []);

  const alternar = useMutation({
    mutationFn: async ({ id, favorito }: { id: string; favorito: boolean }) => {
      if (favorito) {
        assertOk(
          "favoritar exercício",
          await supabase
            .from("exercise_favorites")
            .upsert({ user_id: userId, exercise_id: id }, { onConflict: "user_id,exercise_id" }),
        );
      } else {
        assertOk(
          "desfavoritar exercício",
          await supabase.from("exercise_favorites").delete().eq("exercise_id", id),
        );
      }
    },
    onMutate: async ({ id, favorito }) => {
      await qc.cancelQueries({ queryKey: CHAVE });
      const antes = qc.getQueryData<string[]>(CHAVE) ?? [];
      qc.setQueryData<string[]>(CHAVE, favorito ? [id, ...antes] : antes.filter((x) => x !== id));
      return { antes };
    },
    onError: (_e, _v, ctx) => ctx && qc.setQueryData(CHAVE, ctx.antes),
    onSettled: () => void qc.invalidateQueries({ queryKey: CHAVE }),
  });

  return {
    ids,
    ordem: lista.data ?? [],
    carregando: lista.isPending,
    alternar: (id: string) => alternar.mutate({ id, favorito: !ids.has(id) }),
  };
}
