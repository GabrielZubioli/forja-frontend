# Test plan — delta de paridade Befit

Ambiente: Supabase local (Docker, todas as 24 migrations), app web em dev apontando para ele, Playwright (Chromium) a 390px e 1440px. Dois usuários de teste (`teste.a`, `teste.b`). Produção não foi tocada.

| ID | caso | como | resultado |
| --- | --- | --- | --- |
| F01-H1 | Programa pronto → assistente abre no passo "Quais dias" com N dias sugeridos | `/workouts/routines/new?programa=hipertrofia-4x` | ok: passo 5, 4 dias marcados |
| F01-H2 | Prévia do programa gera 4 divisões A–D | idem, Continuar | ok |
| F01-H3 | "Usar este plano" grava rotina com o nome do programa e volta para Treinos | idem | ok |
| F01-E1 | slug desconhecido cai no assistente normal | teste unitário `findProgram` | ok |
| F02-H1 | Home mostra "2 semanas seguidas na meta" com 2 semanas completas e a atual em aberto | seed 8 sessões, `/dashboard` | ok |
| F02-E1 | ofensiva: semana atual aberta não zera; abaixo da meta interrompe; 2 treinos no mesmo dia contam 2 | `streak.test.ts` | ok (5 casos) |
| F02-H2 | "Descansar Ns" usa o descanso do exercício e conta | sessão, clique | ok (2:00 → 1:53 → 1:50) |
| F02-H3 | concluir série dispara o descanso | marcar 1ª série | ok |
| F02-E2 | −15s até zero fecha o timer sozinho | 9× −15s | ok |
| F02-E3 | mudo persiste no aparelho | `localStorage forja:rest-sound=off` | ok |
| F02-E4 | timer some quando o treino termina | marcar tudo | ok |
| F02-H4 | finalizar com carga nova marca recorde e mostra no overlay | 60 kg × 8 no supino | ok |
| F06-H1 | Recordes lista o PR com 1RM estimado | `/workouts` | ok: 60 kg × 8, 1RM 76 kg |
| F06-N1 | outro usuário não vê os recordes | PostgREST com token de B | ok: `[]` |
| F07-H1 | webhook: compra ativa premium | evento INITIAL_PURCHASE | ok: 200, `is_premium()` = true |
| F07-E1 | reenvio do mesmo evento | idem 2× | ok: 1 linha |
| F07-E2 | evento antigo depois de um novo é ignorado | EXPIRATION com timestamp anterior | ok: continua active |
| F07-E3 | TEST e usuário anônimo são ignorados com 200 | — | ok |
| F07-N1 | sem header / header errado | — | ok: 401 |
| F07-N2 | JSON inválido | — | ok: 400 |
| F07-N3 | usuário inexistente | — | 500 (RevenueCat re-tenta; esgota nas retries) |
| F07-N4 | cliente tenta se dar premium (INSERT e RPC) | token de B | ok: permission denied |
| X-1 | sem scroll horizontal em 390 e 1440 | evaluate | ok |
| X-2 | console sem erros nas telas tocadas | console | ok depois do fix BUG-01 |

Automatizado e mantido no repo: `streak.test.ts`, `programs.test.ts`, `exercise-demo-images.test.ts` (web), `billing-webhook/mapping.test.ts` (Deno).

Não automatizado: specs Playwright e2e no repo — exigiriam Supabase local no CI e um seed; o clique acima foi feito com Playwright a partir do agente. Adicionar quando o CI tiver um job com `supabase start`.

## Rodada 2 (gaps de must)

| ID | caso | resultado |
| --- | --- | --- |
| F02-H5 | resumo mostra gasto estimado com o último peso (80 kg, 26 s → ~2 kcal) | ok |
| F02-E5 | sem peso registrado, o card de gasto não aparece | não testado ao vivo (lógica: `kcal: null` esconde o card) |
| F02-E6 | descanso sobrevive a recarregar a página (1:59 → reload → 1:53) | ok |
| F02-E7 | finalizar o treino encerra o descanso e limpa o storage | ok |
| F06-H2 | "Por parte do corpo" soma séries da semana (só superiores no dia → pernas/core 0) | ok |
| F06-H3 | "Recuperação muscular" lista os músculos treinados hoje como fatigados com tempo restante | ok |
| X-3 | console sem erros após as mudanças | ok |
