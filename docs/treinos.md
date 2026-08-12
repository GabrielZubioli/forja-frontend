# Módulo: Treinos

Fluxo completo de treino: biblioteca → template → sessão ao vivo → histórico.

## Telas

| Rota                      | Arquivo                                                                                  | Função                                        |
| ------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------- |
| `/exercises`              | [exercises.tsx](../../src/routes/_authenticated/exercises.tsx)                           | Biblioteca (busca por nome)                   |
| `/workouts`               | [workouts.tsx](../../src/routes/_authenticated/workouts.tsx)                             | Templates + histórico + iniciar treino        |
| `/workouts/templates/$id` | [workouts.templates.$id.tsx](../../src/routes/_authenticated/workouts.templates.$id.tsx) | Editor de template (`$id = "new"` para criar) |
| `/workouts/session/$id`   | [workouts.session.$id.tsx](../../src/routes/_authenticated/workouts.session.$id.tsx)     | Sessão de treino ao vivo                      |

## Tabelas envolvidas

`exercises`, `workout_templates`, `workout_template_exercises`, `workout_sessions`,
`workout_sets`. Detalhes em [banco-de-dados/schema.md](../banco-de-dados/schema.md).

## Biblioteca de exercícios (`/exercises`)

- Lê `exercises` (`.is("deleted_at", null)`, `ilike` no nome, limit 300).
- Exercícios **globais** têm `owner_id = NULL` e `is_public = true` — vêm do seed
  (~66 exercícios em pt-BR). Usuário pode criar os próprios (`owner_id = auth.uid()`),
  embora a UI de criação não esteja exposta nesta tela (apenas listagem/busca).
- Cada exercício tem `primary_muscle`, `secondary_muscles[]`, `equipment`, `category`
  (enums — ver schema).

## Templates (`/workouts` + editor)

- `/workouts` lista `workout_templates` com contagem de exercícios via embed
  `workout_template_exercises(count)`.
- Editor (`templates/$id`):
  - `$id === "new"` → cria o template primeiro (`createTpl`), depois redireciona
    para o id real (só então é possível adicionar exercícios).
  - Adiciona exercícios em `workout_template_exercises` com defaults
    `target_sets=3, target_reps=10, rest_seconds=90`.
  - Reordena por **swap de `position`** usando um valor temporário `-1` para evitar
    colisão (função `swapPositions`).
  - Campos por item editados no `onBlur` (séries/reps/descanso alvo).

## Iniciar um treino (`/workouts`)

Duas formas, ambas criam uma `workout_sessions` e navegam para `/workouts/session/$id`:

- **Treino rápido** (`startBlank`): sessão em branco, nome `Treino dd/MM HH:mm`.
- **A partir de template** (`startFromTemplate`): copia o `name` do template e grava
  `template_id`. ⚠️ **Não copia os exercícios do template para a sessão** — hoje a
  sessão começa vazia e o usuário adiciona exercícios manualmente. (Possível melhoria.)

## Sessão ao vivo (`/workouts/session/$id`)

Coração do módulo. [workouts.session.$id.tsx](../../src/routes/_authenticated/workouts.session.$id.tsx).

- Carrega a sessão e os `workout_sets` (com embed `exercises(...)`), ordenados por
  `position` e `set_index`.
- **Agrupa** as séries por `(position, exercise_id)` → um "bloco" por exercício.
- Adicionar exercício: abre diálogo com busca (filtro por músculo). Ao escolher,
  busca a **última série daquele exercício do próprio usuário** para pré-preencher
  peso/reps (join `workout_sessions!inner(user_id)`).
- Adicionar série: insere `workout_sets` com `completed=false`, herdando peso/reps
  da série anterior.
- Editar série: `onBlur` em peso/reps/RPE → `update`. O botão "#" cicla o
  `set_type` (`working → warmup → drop → failure`).
- **Cronômetro de descanso**: ao marcar série concluída, dispara timer (default 90s)
  via `setRestRemaining` + `setTimeout` recursivo.
- Cardio: se `category === "cardio"`, as colunas viram Distância (m) / Tempo (s).
- Métricas exibidas por série: **e1RM** (`epley1RM`) e badge **PR** se `is_pr`.
- Cabeçalho mostra séries válidas (concluídas e não-warmup) e **volume** total
  (`Σ setVolume`).

### Finalizar treino (`finishSession`)

Calcula `duration_seconds` (agora − `started_at`), soma `total_volume_kg` com
`setVolume`, grava em `workout_sessions`, invalida `["history"]` e
`["recent_sessions"]`, e volta para `/workouts`.

## Histórico

- `/workouts` lista as últimas 30 sessões (`.is("deleted_at", null)`).
- **Excluir é soft delete**: `update({ deleted_at: now })`, não `DELETE`.

## Pontos de atenção / ⚠️ a confirmar

- `is_pr` existe na tabela e é exibido, mas **não localizei código que o defina como
  `true`** (nenhum cálculo de PR ao salvar série). ⚠️ a confirmar se é feito em
  algum lugar ou se é recurso planejado.
- `superset_group` existe em template e há tipo para isso, mas a UI de supersérie
  não está implementada.
- `duration_seconds`/`total_volume_kg` só são preenchidos ao **finalizar**; sessões
  em andamento aparecem como "em andamento".
