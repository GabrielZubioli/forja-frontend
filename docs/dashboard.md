# Módulo: Dashboard

Tela inicial da área logada: `/dashboard` — [dashboard.tsx](../../src/routes/_authenticated/dashboard.tsx).
É uma tela **só de leitura/agregação** — não escreve nada.

## Queries

| Query key             | Fonte                                  | Uso                                |
| --------------------- | -------------------------------------- | ---------------------------------- |
| `["profile"]`         | `profiles`                             | metas de kcal/macros e nome        |
| `["food_log", today]` | `food_log_entries` + `foods(*)` do dia | calorias/macros de hoje            |
| `["recent_sessions"]` | `workout_sessions` (5 últimas)         | volume semanal + lista de recentes |
| `["weights_30"]`      | `body_weights` (últimos 60 dias)       | peso atual + tendência + gráfico   |

## Cards de resumo (StatCard)

1. **Calorias hoje** — soma dos macros do dia (mesmo `factor = grams / serving_size_g`
   da dieta) vs `daily_kcal_target`.
2. **Volume semanal** — soma de `total_volume_kg` das sessões desde o início da
   semana (`startOfWeek`, semana começa **segunda**: `weekStartsOn: 1`).
3. **Peso atual** — último valor de `body_weights`.
4. **Tendência** — último valor da **média móvel exponencial** `ema(series, 0.2)`.

## Painéis

- **Macros de hoje** (`MacroBar`): proteína, carbo, gordura vs metas do perfil.
- **Peso — últimos 60 dias** (recharts): linha bruta `peso` + linha `tendencia` (EMA).
- **Treinos recentes**: lista das últimas sessões com data, duração e volume; sessão
  sem `total_volume_kg` aparece como "em andamento".

## Observações

- Reaproveita as mesmas convenções de cálculo de macros (dieta) e de EMA (corpo) —
  ⚠️ lógica duplicada inline, não extraída para util. Ver [arquitetura/padroes.md](../arquitetura/padroes.md).
- `weekStartsOn: 1` (date-fns) — segunda-feira como início da semana.
