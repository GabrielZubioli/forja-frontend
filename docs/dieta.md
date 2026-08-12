# Módulo: Dieta (diário alimentar)

Tela: `/diet` — [diet.tsx](../../src/routes/_authenticated/diet.tsx).

## Tabelas

- `foods` — base de alimentos (globais com `owner_id = NULL` + personalizados).
- `food_log_entries` — itens lançados no diário (por dia e refeição).
- `profiles` — fornece as metas (`daily_kcal_target`, `protein_g_target`, etc.).

Seed inicial: ~25 alimentos brasileiros (fonte `tbca`) + whey/creatina (`custom`).
Ver [banco-de-dados/schema.md](../banco-de-dados/schema.md).

## Refeições

Enum `meal_type_t`: `breakfast | lunch | dinner | snack`. Na UI:

```ts
const MEALS = [
  { key: "breakfast", label: "Café da manhã" },
  { key: "lunch", label: "Almoço" },
  { key: "dinner", label: "Jantar" },
  { key: "snack", label: "Lanches" },
];
```

## Como funciona

- Seletor de **data** (`log_date`, default hoje). Query `["food_log", date]` lê
  `food_log_entries` com embed `foods(*)` do dia.
- As entradas são agrupadas por refeição no client (`.filter(e.meal_type === m.key)`).
- **Adicionar alimento** (`AddFoodDialog`): busca em `foods` (`ilike`, limit 50),
  seleciona, informa **gramas**, e insere em `food_log_entries` com:
  - `grams` = quantidade informada;
  - `servings` = `grams / serving_size_g` (mantém consistência entre os dois campos).
- **Remover**: `delete` na entrada + invalida `["food_log", date]`.

## Cálculo de macros (padrão do app)

Cada `food` guarda os macros por `serving_size_g` (default 100 g). Para uma entrada,
o **fator de porção** converte para a quantidade real:

```ts
const grams = e.grams ?? f.serving_size_g * e.servings;
const factor = grams / f.serving_size_g;
const kcal = f.kcal * factor; // idem protein_g, carbs_g, fat_g, fiber_g
```

Esse mesmo padrão (`factor = grams / serving_size_g`) aparece em **dieta, dashboard
e receitas** — é a convenção central de nutrição do projeto. Lembrar de `Number(...)`
os campos (vêm como string do Postgres).

Os totais do dia (kcal, P, C, G, fibra) são somados com `reduce` e comparados às
metas do `profiles` em barras de progresso (`Stat`).

## Relação com Receitas

Receitas podem lançar seus ingredientes direto no diário de hoje — ver
[modulos/receitas.md](receitas.md) (função `logToDiary`). Isso insere várias linhas
em `food_log_entries` de uma vez e invalida `["food_log", ...]`.

## ⚠️ A confirmar / limitações

- `foods` tem `barcode` e índice para código de barras, mas **não há UI de leitura
  de código de barras** implementada (a landing menciona o recurso).
- Não há UI para **criar/editar alimentos** personalizados nesta tela — só busca na
  base existente. Criação de `foods` custom seria via inserção direta.
