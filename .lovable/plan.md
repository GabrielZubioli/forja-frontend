## Escopo solicitado

Lista massiva de features. Proponho dividir em ondas, priorizando o que gera mais valor com menor risco. Cada onda é entregável de forma independente.

## Onda 1 — Templates + Receitas + Medidas/Fotos (UI CRUD)

Puramente frontend + queries no Cloud existente. Sem dependências externas.

- **Templates**: nova rota `_authenticated/workouts.templates.$id.tsx` (novo/editar). Lista de exercícios com ordem, séries alvo, reps alvo, RPE alvo, notas. Reordenação com `@dnd-kit`. Botão "Criar template" em `workouts.tsx`.
- **Receitas**: nova rota `_authenticated/recipes.tsx` (lista) e `recipes.$id.tsx` (editor). Adicionar itens da tabela `foods`, calcular macros/porção automaticamente. Ação "Adicionar ao diário" em `diet.tsx`.
- **Medidas corporais**: expandir `body.tsx` com aba "Medidas" (peito, cintura, quadril, braço, coxa, panturrilha) gravando em `body_measurements`, com mini-gráficos.
- **Fotos de progresso**: aba "Fotos" em `body.tsx`, upload para bucket `progress-photos`, grid com data e comparador lado a lado.

## Onda 2 — Gráficos por exercício + Superset drag-and-drop

- **Gráficos por exercício**: rota `_authenticated/exercises.$id.tsx` com séries históricas de e1RM, volume e melhor set. Recharts, seletor de período.
- **Superset DnD**: na sessão ao vivo (`workouts.session.$id.tsx`), permitir agrupar exercícios em superset via drag-and-drop (`@dnd-kit`). Marca visual + rotação automática entre exercícios do grupo.

## Onda 3 — Código de barras + Open Food Facts

- Botão de scanner em `diet.tsx` usando `@zxing/browser` (câmera). Consulta Open Food Facts (`https://world.openfoodfacts.org/api/v2/product/{ean}.json`). Se não existir em `foods`, insere com dados do OFF (kcal, macros, marca) e loga no diário. Fallback: busca por nome via OFF search.

## Onda 4 — Metas adaptativas semanais

- Server function `recalcWeeklyGoals` (com `requireSupabaseAuth`) que roda por `pg_cron` semanal chamando `/api/public/hooks/recalc-goals` (loop sobre usuários com service role). Ajusta `daily_kcal_target` no `profiles` baseado em:
  - Delta de peso via EMA vs meta (perda/ganho/manutenção).
  - Aderência às metas (média de kcal/proteína dos últimos 7 dias).
  - Regra: se progresso < 60% da meta semanal de peso, ajusta ±5% kcal; se > 140%, ajusta na direção oposta.
- Tabela nova `weekly_goal_adjustments` (histórico) e card no dashboard mostrando último ajuste.

## Onda 5 — PWA + Notificações locais + Offline sync

Última porque é a mais arriscada e depende do resto estar estável.

- **PWA (manifest-only primeiro)**: manifest, ícones, theme-color. Instalável no celular.
- **Notificações locais**: `Notification` API + `setTimeout` para timer de descanso na sessão de treino (som + vibração + notificação quando app em background). Sem push server.
- **Offline sync**: fila de mutações em IndexedDB (`idb-keyval`) para `workout_sets`, `body_weights` e `food_log_entries`. Ao voltar online, replay. Requer service worker (`vite-plugin-pwa` `NetworkFirst` para navegações, cache dos dados via TanStack Query persist).

## Detalhes técnicos

- Dependências novas: `@dnd-kit/core`, `@dnd-kit/sortable`, `@zxing/browser`, `idb-keyval`, `vite-plugin-pwa`, `@tanstack/query-async-storage-persister`, `@tanstack/react-query-persist-client`.
- Cron chama server route público protegido por assinatura `apikey` do Supabase (padrão do playbook).
- Fotos: signed URLs (bucket privado), 6mo retention indicada mas não forçada.
- Offline: primeiro escrita local + optimistic update, depois flush; conflitos resolvidos "last write wins" por `updated_at`.

## Como quer prosseguir?

Confirme se posso executar as **5 ondas em sequência automaticamente**, ou escolha um subconjunto/ordem diferente. Também posso começar apenas pela **Onda 1** e voltar para aprovação antes das seguintes — recomendo isso dado o volume.
