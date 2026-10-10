# Bugs

## BUG-01 — botão dentro de botão no card de exercício (S3, pré-existente) — corrigido

- **Onde:** `/workouts` (lista da divisão) e `/workouts/session/:id`.
- **Passos:** abrir qualquer uma das telas com exercícios.
- **Esperado:** HTML válido, um alvo de foco por thumbnail.
- **Atual:** `<button>` "Ver execução" contém o `<button>` "Reproduzir demonstração" de `ExerciseDemo`. Console: "In HTML, <button> cannot be a descendant of <button>. This will cause a hydration error." Leitor de tela anuncia dois controles aninhados.
- **Fix:** `ExerciseDemo` ganhou `interactive={false}`, que renderiza `<span>`; usado nos dois thumbnails. Teste: `exercise-demo-images.test.ts` (falhou antes, passa depois). Console limpo após o fix.


## BUG-02 — treino de domingo à noite some da semana (S2, pré-existente) — corrigido

- **Onde:** home (ofensiva, "X de N treinos"), Treinos (semana/mês), calendário — tudo via `fetchCompletedWorkouts`.
- **Passos:** no Brasil, concluir um treino num domingo depois das 21h e abrir a home.
- **Esperado:** o treino conta na semana que termina naquele domingo.
- **Atual:** os limites iam como `2026-10-11T23:59:59` sem fuso; o Postgres lê como UTC (20:59 em BRT). O treino ficava fora da semana e podia quebrar a ofensiva.
- **Fix:** `localDayRange()` em `lib/date.ts` (meia-noite local → UTC, fim exclusivo), usado em `fetchCompletedWorkouts`. Teste em `date.test.ts` (falhou antes, passa depois).

## BUG-03 — teste de data quebra em CI (S3, pré-existente) — corrigido

- `todayISO` assume BRT; o CI roda em UTC. `vitest.config.ts` do web fixa `TZ=America/Sao_Paulo`. Suíte passa em UTC, BRT e Asia/Tokyo.

## Bloqueio de CI (não é bug do código)

- O CI do `main` falha desde 12/08 no `npm ci`: o secret `PACKAGES_READ_TOKEN` (PAT com `read:packages`) não está configurado no repositório.

## Para checar (não reproduzido)

- Programas prontos em 7 cards altos empurram Recordes e Histórico para baixo no celular — avaliar lista compacta.

## BUG-04 — excluir conta falhava com exercício/alimento próprio em uso (S1, pré-existente) — corrigido

- **Passos:** usuário com exercício próprio usado num treino pede exclusão da conta.
- **Atual:** `update or delete on table "exercises" violates foreign key constraint "workout_sets_exercise_id_fkey"` — FKs `RESTRICT` checadas no meio da cascata.
- **Fix:** migration `20261009130000_account_deletion.sql` torna as 5 FKs para `exercises`/`foods` `DEFERRABLE INITIALLY DEFERRED`. Apagar exercício em uso direto continua bloqueado (checado no commit). Testado ponta a ponta pela Edge Function e pela UI.

## Cosmético

- Após excluir a conta, o navegador registra `403` em `/auth/v1/logout?scope=local` (o usuário já não existe). O supabase-js ignora esse status por design; sessão local é limpa.
