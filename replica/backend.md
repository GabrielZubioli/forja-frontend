# Backend — paridade Befit (forja-backend)

Auth, banco e RLS já existiam no Forja. O delta:

| peça | onde | estado |
| --- | --- | --- |
| `subscriptions` + `is_premium()` + `apply_subscription_event()` | `supabase/migrations/20261009120000_subscriptions.sql` | testado em Postgres descartável; **não aplicado no projeto remoto** |
| Edge Function `billing-webhook` (RevenueCat) | `supabase/functions/billing-webhook/` | `deno check` ok, 4 testes do mapeamento ok; **não implantada** |
| `verify_jwt = false` para o webhook | `supabase/config.toml` | — |
| `REVENUECAT_WEBHOOK_AUTH` | `.env.example` | sem valor |

## O que você precisa fazer (contas e chaves são suas)

1. Criar o projeto no RevenueCat, ligar App Store / Play / Stripe, criar a entitlement e os produtos.
2. No app: `Purchases.logIn(<user.id do Supabase>)` antes de comprar — o webhook ignora ids anônimos.
3. `npx supabase secrets set REVENUECAT_WEBHOOK_AUTH=...` e o mesmo valor no painel do RevenueCat.
4. `npm run db:push` e `npx supabase functions deploy billing-webhook` — **só depois de revisar**.
5. Regerar o contrato (`npm run db:types`) e publicar `@gabrielzubioli/db` para o front enxergar `subscriptions`.

## Testes feitos (Postgres 16 descartável com stubs de `auth`)

- migration roda duas vezes sem erro (idempotente)
- evento antigo depois de um novo: ignorado; reenvio idêntico: 1 linha
- usuário A vê a própria assinatura e `is_premium() = true`; usuário B vê 0 linhas e `false`
- `authenticated` não consegue `INSERT` em `subscriptions` nem chamar `apply_subscription_event`

## Checklist de segurança

- [x] secrets só em env (`REVENUECAT_WEBHOOK_AUTH`, service role); `.env*` no `.gitignore`
- [x] entrada validada no servidor (tipo do evento, loja, UUID do usuário)
- [x] autorização em toda leitura/escrita, testada com um segundo usuário
- [ ] rate limit — auth já é do Supabase; o webhook depende do segredo, sem limite próprio
- [x] webhook autentica (header comparado em tempo constante; RevenueCat não assina o corpo)
- [x] uploads — sem mudança neste delta
- [x] sem dado pessoal em log (só id do evento e código do erro)
- [ ] `npm audit` — não rodado (install do front bloqueado por token, ver build-log)
- [ ] política de privacidade: adicionar RevenueCat (e Stripe, se usar web) como processadores
