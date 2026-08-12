import { useRouteContext } from "@tanstack/react-router";

/**
 * Usuário autenticado, lido do contexto da rota `_authenticated`.
 *
 * O `beforeLoad` da área logada já valida a sessão e devolve o usuário. Antes,
 * cada mutação chamava `supabase.auth.getUser()` de novo — uma requisição HTTP
 * extra antes de **cada** escrita (adicionar série, registrar peso, lançar
 * alimento), no caminho crítico da interação.
 *
 * Nota de segurança: o `user_id` enviado pelo client é apenas conveniência; a
 * autoridade continua sendo o `WITH CHECK (user_id = auth.uid())` das policies
 * de RLS, que rejeitam qualquer tentativa de gravar em nome de outro usuário.
 */
export function useCurrentUser() {
  const { user } = useRouteContext({ from: "/_authenticated" });
  return user;
}

export function useCurrentUserId(): string {
  return useCurrentUser().id;
}
