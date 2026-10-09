# Deploy — preflight (09/10/2026)

## Resultado: **não publicar ainda.** Há 5 bloqueios; nenhum é de código.

| checagem | resultado |
| --- | --- |
| Testes | ✅ domínio 252, web 146 (em UTC, BRT e Tóquio); webhook Deno 4; e2e manual com Playwright contra Supabase local (`test-plan.md`) |
| Build de produção | ✅ `npm run build` (cópia com o contrato compilado do backend local) |
| Typecheck / lint | ✅ 0 erros (13 avisos pré-existentes) |
| Paridade | ✅ 84%, 16/16 must (`parity.md`) |
| Bugs S1/S2 abertos | ✅ nenhum (BUG-01 a 04 corrigidos, `bugs.md`) |
| Varredura de marca | ✅ nada do Befit/openGym em código ou textos do app (`brand.md`) |
| Listing das lojas | ✅ limites e nomes proibidos (`launch/listing.json`) — **sem a seção Pro** até existir paywall |
| Exclusão de conta | ✅ ponta a ponta, local |
| **Nome / marca** | ❌ apps homônimos "Forja"/"FORJA" na mesma categoria — decidir antes das lojas |
| **Política de privacidade e termos** | ❌ não existem páginas; exigidas pela LGPD e pelas lojas (listar Supabase, RevenueCat, Stripe, provedor de IA) |
| **CI** | ❌ falha desde 12/08: falta o secret `PACKAGES_READ_TOKEN` (PAT com `read:packages`) |
| **Produção (Supabase `nursxzqagxmeiucsaqzm`)** | ❌ projeto **pausado** (INACTIVE) |
| **Credenciais de deploy** | ❌ sem `SUPABASE_DB_PASSWORD` (não há `forja-backend/.env`); `db push` não roda sem ela |

## O que foi feito agora

- Código commitado em **branches próprias** (não no `main`, que sincroniza com o Lovable) e PRs abertas nos dois repositórios — nada foi publicado.
- Nada foi aplicado no Supabase de produção.

## Ordem de deploy quando os bloqueios caírem

1. Restaurar o projeto no painel do Supabase (Settings → General → Restore) ou `POST /v1/projects/nursxzqagxmeiucsaqzm/restore`.
2. Backend primeiro (o front novo depende dele):
   ```bash
   cd forja-backend
   npx supabase link --project-ref nursxzqagxmeiucsaqzm     # pede a senha do banco
   npx supabase migration list                               # conferir o que está pendente
   npx supabase db push                                      # aplica 20261009120000_subscriptions e 20261009130000_account_deletion
   npx supabase functions deploy delete-account
   npx supabase functions deploy billing-webhook
   npx supabase secrets set REVENUECAT_WEBHOOK_AUTH=<valor longo e aleatório>   # quando houver RevenueCat
   npm run db:types && npm run db:publish                    # contrato novo para o front
   ```
3. Merge da PR do backend, depois da PR do front no `main` (o Lovable sincroniza) e publicar no Lovable.
4. Fazer o fluxo central no site publicado: questionário → treino → descanso → resumo → importar CSV → corrigir treino → excluir uma conta de teste.

## Primeira semana

- Erros: ligar `lib/error-capture.ts` a um serviço (Sentry ou similar).
- Supabase: logs das funções `delete-account` e `billing-webhook`; nenhuma linha órfã no Storage depois de exclusões.
- Funil do `launch-plan.md`.
- Mobile (Expo): `eas build` → TestFlight / Play interno, só depois do nome decidido.
