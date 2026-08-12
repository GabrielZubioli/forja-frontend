# Fluxo: Registrar um treino

Do modelo à sessão finalizada. Telas e tabelas detalhadas em
[modulos/treinos.md](../modulos/treinos.md).

## Passo a passo

```
/workouts
   │  (opcional) cria/edita um template em /workouts/templates/$id
   │
   ├── "Treino rápido"  ──────────┐   insert workout_sessions (em branco)
   └── "Iniciar" (de template) ───┤   insert workout_sessions (template_id + name)
                                   ▼
                         /workouts/session/:id
                                   │
                                   │  Adicionar exercício (diálogo com busca)
                                   │     └ pré-preenche peso/reps da última vez
                                   │  Adicionar série  → insert workout_sets (completed=false)
                                   │  Editar peso/reps/RPE (onBlur → update)
                                   │  Marcar concluída  → dispara timer de descanso
                                   ▼
                              "Finalizar"
                                   │  update workout_sessions:
                                   │    ended_at, duration_seconds, total_volume_kg
                                   ▼
                         volta para /workouts (aparece no Histórico)
```

## Detalhes que importam

1. **Criar sessão** (`/workouts`):
   - `startBlank`: nome `Treino dd/MM HH:mm`.
   - `startFromTemplate`: copia só o `name` e grava `template_id`.
     ⚠️ **os exercícios do template NÃO são copiados** — a sessão nasce vazia.

2. **Estrutura da sessão**: `workout_sets` agrupados por `(position, exercise_id)`.
   `position` = ordem do exercício; `set_index` = número da série.

3. **Pré-preenchimento inteligente**: ao adicionar um exercício, busca a última série
   dele **do próprio usuário** (join `workout_sessions!inner(user_id)`) para sugerir
   peso/reps iniciais. A próxima carga sugerida usa `suggestNextWeight`.

4. **Tipos de série** (`set_type`): botão "#" cicla `working → warmup → drop →
failure`. Só séries concluídas e não-warmup contam como "válidas".

5. **Cardio**: exercícios `category === "cardio"` trocam as colunas para
   Distância (m) / Tempo (s); `setVolume` retorna 0 para eles.

6. **Métricas ao vivo**: e1RM por série (`epley1RM`), volume total (`Σ setVolume`).

7. **Finalizar**: calcula duração e volume, grava na sessão, invalida `["history"]`
   e `["recent_sessions"]` (o dashboard reflete na hora).

8. **Excluir do histórico**: soft delete (`deleted_at`), nunca `DELETE` físico.

## ⚠️ Pontos abertos

- Marcação de **PR** (`is_pr`) não parece ser calculada em lugar nenhum ao salvar.
- Supersérie (`superset_group`) tem coluna/tipo mas sem UI.
