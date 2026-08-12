# Módulo: Receitas

Telas:

- `/recipes` — lista ([recipes.tsx](../../src/routes/_authenticated/recipes.tsx)).
- `/recipes/$id` — editor ([recipes.$id.tsx](../../src/routes/_authenticated/recipes.$id.tsx)).

## Tabelas

- `recipes` — cabeçalho (nome, `servings`, notas, soft delete).
- `recipe_items` — ingredientes (`food_id` + `grams`).
- Depende de `foods` (base de alimentos) e escreve em `food_log_entries` ao lançar no diário.

## Lista (`/recipes`)

- Lê `recipes` com contagem `recipe_items(count)`, `.is("deleted_at", null)`.
- **Nova receita**: cria `{ name: "Nova receita", servings: 1 }` e navega para o editor.
- **Excluir**: soft delete (`update deleted_at`).

## Editor (`/recipes/$id`)

- Edita nome, **porções** (`servings`, mínimo 1) e notas.
- **Ingredientes** (`AddFoodDialog`): busca em `foods`, escolhe alimento + gramas,
  insere em `recipe_items`. Gramas por item editável no `onBlur`.
- **Macros calculados** (mesmo padrão da dieta — `factor = grams / serving_size_g`):
  - Totais da receita somados via `reduce` sobre `recipe_items` (memoizado).
  - Exibe **por porção**: `total / servings` (`perServing`).

## Lançar no diário (`logToDiary` / `LogToDiary`)

Recurso-chave. Transforma a receita em várias entradas de `food_log_entries` de hoje:

```ts
grams = (it.grams / max(1, servings)) * portions; // por ingrediente
// insere 1 food_log_entry por ingrediente, meal_type escolhido, servings: 1,
// notes: `Da receita: <nome>`
```

- O usuário escolhe **refeição** e **nº de porções**.
- Cada ingrediente entra proporcional às porções pedidas.
- `onSuccess`: toast "Adicionado ao diário de hoje". (Não invalida a query do diário
  aqui porque a tela de dieta é outra rota; ao navegar para `/diet` os dados são
  refeitos.)

## ⚠️ Observações

- Não há "salvar receita como um `food` agregado" — o lançamento é sempre
  ingrediente a ingrediente. Isso mantém os macros precisos mas gera múltiplas linhas
  no diário.
