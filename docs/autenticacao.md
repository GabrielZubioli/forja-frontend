# Autenticação e sessão

## Provedores

Supabase Auth, com dois caminhos de login (tela [auth.tsx](../../src/routes/auth.tsx)):

1. **Email + senha** — `supabase.auth.signInWithPassword` / `signUp`. Validação com
   Zod: email válido (máx 255), senha 6–72 chars.
2. **Google OAuth** — via wrapper Lovable ([integrations/lovable/index.ts](../../src/integrations/lovable/index.ts)):
   `lovable.auth.signInWithOAuth("google", { redirect_uri })`. Ele obtém os tokens
   e chama `supabase.auth.setSession(...)`.

No cadastro, `options.data.name` vira o `display_name` inicial do perfil (ver trigger abaixo).

## Criação automática de perfil (trigger no banco)

Ao inserir em `auth.users`, a função `handle_new_user()` (SECURITY DEFINER) cria
automaticamente:

- 1 linha em `public.profiles` (id = user id; display_name derivado de
  `raw_user_meta_data.name/full_name` ou do email);
- 1 linha em `public.user_roles` com `role = 'user'`.

Definido na migration [20260723143527_...sql](../../supabase/migrations/20260723143527_a57c0280-e41b-489c-9714-8ca03a8a4aeb.sql).
Ou seja: **todo usuário novo já nasce com profile + role 'user'**.

## Guarda da área logada

[src/routes/_authenticated/route.tsx](../../src/routes/_authenticated/route.tsx):

```ts
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthLayout,
});
```

- `ssr: false` → a área logada é client-side (a sessão vive no `localStorage`).
- Sem sessão → redireciona para `/auth`.
- `AuthLayout` escuta `onAuthStateChange`; em `SIGNED_OUT` limpa o cache do React
  Query (`qc.clear()`) e navega para `/auth`. O botão "Sair" faz o mesmo.

A tela `/auth` faz o inverso: se já há sessão, manda para `/dashboard`.

## Sessão no client

[client.ts](../../src/integrations/supabase/client.ts):

- `storage: localStorage` (no browser), `persistSession: true`, `autoRefreshToken: true`.
- Suporta **novas chaves Supabase** (`sb_publishable_*` / `sb_secret_*`), que são
  opacas — o fetch customizado remove o header `Authorization: Bearer <apikey>`
  indevido e envia sempre `apikey`.

## Auth em server functions (RPC)

Fluxo para quando houver server functions do TanStack Start (hoje pouco usado no app):

1. **Client middleware** `attachSupabaseAuth` ([auth-attacher.ts](../../src/integrations/supabase/auth-attacher.ts)),
   registrado globalmente em [start.ts](../../src/start.ts) como `functionMiddleware`.
   Ele pega `session.access_token` e adiciona `Authorization: Bearer <token>` na RPC.
2. **Server middleware** `requireSupabaseAuth` ([auth-middleware.ts](../../src/integrations/supabase/auth-middleware.ts)):
   valida o Bearer, chama `supabase.auth.getClaims(token)` e injeta no contexto
   `{ supabase, userId, claims }`. Um client Supabase criado com o token do usuário
   → respeita RLS.

## Papéis (roles) — `admin` / `user`

- Enum `app_role` e tabela `user_roles`; função `has_role(user_id, role)` (SECURITY
  DEFINER, STABLE) para checar papel dentro de policies sem recursão de RLS.
- ⚠️ **Hoje o app não usa `admin` para gatear telas nem lógica no frontend.** A
  infra existe (roles + `has_role`) mas está latente. Não há tela de administração.

## Segurança dos dados

O isolamento por usuário **não** está no código da aplicação — está no banco, via
RLS. Ver [banco-de-dados/rls.md](../banco-de-dados/rls.md). Por isso as queries do
frontend quase nunca filtram por `user_id` na leitura: a policy já limita a
`auth.uid()`.
