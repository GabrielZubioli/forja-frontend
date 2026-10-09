# Architecture: paridade Befit no Forja

Lê: `recon.md`, `features.csv`. Planeja **só o delta** sobre o Forja existente.

## Stack (mantida — já é a do Forja)

| camada | escolha | por quê |
| --- | --- | --- |
| web | TanStack Start + Tailwind + shadcn (`forja-frontend/apps/web`) | já existe, CSR na área logada |
| mobile | Expo (`forja-frontend/apps/mobile`) | já existe; Watch/widgets ficam fora |
| regras | `@forja/domain` (puro, testado) | streak, meta semanal, PRs, resumo e programas entram aqui |
| banco | Postgres no Supabase + RLS (`forja-backend`) | RLS é a fronteira de segurança; sem servidor de app |
| auth | Supabase Auth (e-mail + Google) | já existe |
| pagamento | RevenueCat (IAP Apple/Google + Stripe web) → webhook | uma fonte de entitlement para 3 lojas; Stripe sozinho não vende dentro do app iOS |
| servidor | Edge Functions (`coach` existente + `billing-webhook` novo) | só onde há segredo |
| offline | PowerSync (streams já em `packages/db/sync/streams.yaml`) | Befit roda o treino offline |

Front e back continuam separados como hoje: **tudo de banco/RLS/Edge Function em `forja-backend`**, **tudo de tela/domínio em `forja-frontend`**, contrato via `@gabrielzubioli/db`.

## Schema (delta)

O que já existe e é reaproveitado sem mudança:

| Befit (recon) | Forja |
| --- | --- |
| Plan | `workout_routines` (level, goal, equipment, days_per_week, current_index, 1 ativa por usuário) |
| PlanDay (Dia 1, 2…) | `workout_templates` com `routine_id` + `routine_order` |
| PlanExercise | `workout_template_exercises` |
| Session | `workout_sessions` (`template_id`, `duration_seconds`, `total_volume_kg`) |
| SetLog | `workout_sets` (`is_pr`, `rest_seconds`, `set_type`) |
| Exercise | `exercises` |
| Profile (quiz) | `profiles` (experience_level, focus_area, training_place, equipment_available, days_per_week…) |

Derivados, **sem tabela** (funções puras no `@forja/domain`, a partir de sessões/séries):
- Ofensiva diária (1 por dia local) e meta semanal (conta >1/dia).
- Painel de PRs e ranking de exercícios (agregação de `workout_sets`).
- Resumo pós-treino (volume, duração, PRs, delta vs. última vez).
- Programas prontos: catálogo estático de presets do `generatePlan` (objetivo, nível, equipamento, dias, foco) + nome/descrição. Iniciar um programa = gerar rotina com aqueles inputs. Sem tabela até alguém precisar editar programas sem deploy.

Novo no banco: `supabase/migrations/20261009120000_subscriptions.sql` em `forja-backend`:
- `profiles.weekly_workout_goal`, `profiles.default_rest_seconds`, `profiles.rest_sound_enabled`.
- `subscriptions` (1 por usuário, escrita só pelo `service_role` via webhook) + `public.is_premium()`.

Acesso: RLS (padrão do repo). `subscriptions` é leitura do dono e nenhuma escrita para `authenticated` — o cliente não se dá premium.

## API

PostgREST direto (padrão do repo) + 1 Edge Function nova.

| método rota | o que faz | quem | entrada | saída | fluxo |
| --- | --- | --- | --- | --- | --- |
| PATCH /rest/v1/profiles | meta semanal, descanso padrão, som | dono | campos | perfil | S18 |
| GET /rest/v1/workout_sessions?started_at=gte… | sessões p/ ofensiva e meta | dono | intervalo | sessões | F02, S05 |
| GET /rest/v1/workout_sets?is_pr=eq.true&select=*,exercises(name) | painel de PRs | dono | — | séries | F06, S15 |
| GET /rest/v1/workout_sets?session_id=eq.X | resumo pós-treino | dono | sessão | séries | F02, S10 |
| POST (cliente) generatePlan(preset) → insert routine/templates | iniciar programa | dono (premium p/ programas premium) | preset id | rotina | S13 |
| GET /rest/v1/subscriptions | estado premium | dono | — | status | S04, locks |
| POST /functions/v1/billing-webhook | atualiza `subscriptions` | RevenueCat (header de auth compartilhado) | evento RC | 200 | F07 |

Jobs: nenhum agora. Lembretes push (could) ficam para depois.

## Partes que mordem

- **Fuso:** ofensiva e meta semanal usam o dia **local** do usuário (a auditoria já achou o bug de UTC). Funções do domínio recebem datas locais `YYYY-MM-DD`.
- **Idempotência:** RevenueCat reenvia eventos; webhook faz upsert por `user_id` e ignora evento mais antigo que `updated_at`.
- **Segurança:** premium nunca é decidido no cliente para dados — `is_premium()` no banco quando um limite for de verdade aplicado em RLS.
- **Offline:** treino carregado precisa terminar sem rede (PowerSync). Ainda não ligado no front.
- **LGPD:** `subscriptions` em cascade com `auth.users`.

## Ordem de build

1. **Fatia vertical** (S05 → S07 → S10): treino do dia → sessão → **resumo pós-treino** (o must que falta). Domínio: `summarizeSession`.
2. **Must restantes:** ofensiva + meta semanal na home (S05), painel de PRs (S15), tela de recuperação (S16), descanso padrão/som (S18).
3. **Should:** programas prontos (S13), treino rápido por músculo (S11), paywall + webhook (S04).
4. **Could:** lembretes, cardio com IA, identificar equipamento.
5. Fixes do `/replica-entrepreneur`.
