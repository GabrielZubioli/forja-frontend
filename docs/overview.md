# Arquitetura — Visão geral

## Camadas

```
┌─────────────────────────────────────────────────────────────┐
│  Navegador (React 19 + TanStack Router)                      │
│  - Rotas em src/routes (file-based)                          │
│  - TanStack Query gerencia cache/estado de servidor          │
│  - supabase-js chama o Supabase direto do cliente            │
└───────────────┬─────────────────────────────────────────────┘
                │  HTTP (REST/PostgREST + Auth + Storage)
                ▼
┌─────────────────────────────────────────────────────────────┐
│  Supabase (Postgres gerenciado)                             │
│  - PostgREST expõe as tabelas                                │
│  - RLS (Row Level Security) isola os dados por usuário       │
│  - Auth (email/senha + OAuth Google via Lovable)            │
│  - Storage (bucket "progress-photos", privado)              │
│  - Triggers/funções (updated_at, has_role, handle_new_user) │
└─────────────────────────────────────────────────────────────┘
```

Há também uma camada **SSR** (TanStack Start + Nitro), mas ela é fina: serve o
HTML inicial e trata erros. **A área logada roda em CSR** (`ssr: false` em
[route.tsx](../../src/routes/_authenticated/route.tsx)).

## Fluxo de dados típico (leitura)

Quase toda tela segue o mesmo padrão: componente de rota → `useQuery` →
`supabase.from(...).select(...)`. Exemplo real de [diet.tsx](../../src/routes/_authenticated/diet.tsx):

```ts
const entries = useQuery({
  queryKey: ["food_log", date],
  queryFn: async () => {
    const { data } = await supabase
      .from("food_log_entries")
      .select("*, foods(*)") // join embutido do PostgREST
      .eq("log_date", date)
      .order("created_at");
    return data ?? [];
  },
});
```

O RLS no banco garante que só voltem linhas do usuário logado — **o `.eq("user_id", ...)`
raramente aparece nas leituras** porque a política já filtra por `auth.uid()`.

## Fluxo de dados típico (escrita)

Mutações usam `useMutation` + `supabase.from(...).insert/update/delete`, seguidas
de `queryClient.invalidateQueries` para revalidar. Ex. [workouts.session.$id.tsx](../../src/routes/_authenticated/workouts.session.$id.tsx):

```ts
const updateSet = useMutation({
  mutationFn: async (patch) => {
    const { error } = await supabase.from("workout_sets").update(patch).eq("id", patch.id);
    if (error) throw error;
  },
  onSuccess: () => qc.invalidateQueries({ queryKey: ["session_sets", id] }),
});
```

Erros de mutação normalmente viram `toast.error(e.message)` (biblioteca `sonner`).

## Onde mora a lógica de negócio

Cálculos puros ficam em [src/lib/domain/formulas.ts](../../src/lib/domain/formulas.ts)
— sem React, sem DOM, portável. Ver [dominio/formulas.md](../dominio/formulas.md).
Exemplos: `epley1RM`, `setVolume`, `bmrMifflin`, `tdee`, `goalCalories`,
`macroTargets`, `ema`, `suggestNextWeight`.

Cálculos "de exibição" (ex.: somar macros do dia, converter gramas em fator de
porção) ficam **inline nas rotas** com `Array.reduce`. Não há uma camada de
services/repositories — as rotas falam direto com o Supabase.

## Dois clients Supabase

| Client                         | Arquivo                                                              | Uso                                                                       |
| ------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Browser** (anon/publishable) | [client.ts](../../src/integrations/supabase/client.ts)               | Padrão. Respeita RLS. É o `supabase` importado em todas as rotas.         |
| **Admin** (service role)       | [client.server.ts](../../src/integrations/supabase/client.server.ts) | **Ignora RLS.** Só para código de servidor. Hoje não há uso ativo no app. |

Há ainda um middleware de servidor ([auth-middleware.ts](../../src/integrations/supabase/auth-middleware.ts))
que valida o Bearer token em server functions — ver [autenticacao.md](autenticacao.md).

## SSR e tratamento de erro

- [server.ts](../../src/server.ts) é a entrada SSR (configurada em [vite.config.ts](../../src/../vite.config.ts)).
  Ela envolve o handler do TanStack Start e converte erros catastróficos (inclusive
  os que o h3 "engole" em JSON) numa página HTML de erro ([error-page.ts](../../src/lib/error-page.ts)).
- [start.ts](../../src/start.ts) registra middlewares globais: `attachSupabaseAuth`
  (client) e um `errorMiddleware` (server).
- [__root.tsx](../../src/routes/__root.tsx) define `notFoundComponent` (404) e
  `errorComponent` (erro de renderização), ambos reportando ao Lovable.
