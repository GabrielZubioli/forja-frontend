# Domínio — Fórmulas

Arquivo: [src/lib/domain/formulas.ts](../../src/lib/domain/formulas.ts).

TypeScript **puro**: sem React, sem `window`/DOM. Testável e portável (o comentário
do arquivo cita reuso em RN/Expo). É a única "camada de domínio" isolada do projeto —
o resto da lógica vive inline nas rotas.

## Tipos

```ts
type Sex = "male" | "female" | "other";
type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
type Goal = "lose" | "maintain" | "gain";
```

## Treino

### `epley1RM(weightKg, reps): number`

1RM estimado (fórmula de Epley). `reps === 1` retorna o próprio peso; entradas ≤ 0
retornam 0. Usado por série na sessão (`e1RM`).
`1RM = peso * (1 + reps/30)`.

### `setVolume(weightKg, reps): number`

Volume de uma série = `peso * reps`. Nulos/zeros → 0 (séries de cardio somam 0).
Base do `total_volume_kg` da sessão e do "volume semanal" do dashboard.

### `suggestNextWeight(lastWeightKg, lastReps, targetReps): number`

Sugere a próxima carga de trabalho. Incremento de **2.5 kg** se peso ≥ 60, senão
**1.25 kg**. Regras:

- `lastReps ≥ target+2` → +2 incrementos;
- `lastReps ≥ target` → +1 incremento;
- `lastReps < target-2` → −1 incremento;
- caso contrário → mantém.
  Exibido como "Sugestão: X kg" no bloco de exercício da sessão.

## Nutrição

### `bmrMifflin({ sex, weightKg, heightCm, ageYears }): number`

Taxa metabólica basal (Mifflin-St Jeor): `10*peso + 6.25*altura - 5*idade + offset`,
onde `offset` = +5 (male), −161 (female), −78 (other, média dos dois). Nunca negativo.

### `tdee(bmr, level): number`

Gasto energético total = `bmr * fator`. Fatores: sedentary 1.2, light 1.375,
moderate 1.55, active 1.725, very_active 1.9.

### `goalCalories(tdeeVal, goal): number`

Ajuste por objetivo: `lose` = ×0.85, `gain` = ×1.1, `maintain` = ×1.0. Arredondado.

### `macroTargets(kcal, weightKg): { protein_g, fat_g, carbs_g, fiber_g }`

Divisão de macros:

- **Proteína** = `peso * 2` g;
- **Gordura** = `25% das kcal / 9`;
- **Carboidrato** = kcal restantes / 4 (após descontar proteína e gordura);
- **Fibra** = `14 g por 1000 kcal`.

> Cadeia completa usada no perfil: `bmrMifflin → tdee → goalCalories → macroTargets`.
> Ver [modulos/perfil-e-metas.md](../modulos/perfil-e-metas.md).

## Progresso corporal

### `ema(values, alpha = 0.1): number[]`

Média móvel exponencial de uma série. No app é chamada com **`alpha = 0.2`** para a
tendência de peso (dashboard e corpo). `prev = alpha*v + (1-alpha)*prev`.

## Utilitário de data

### `yearsBetween(birthISO, ref = new Date()): number`

Idade em anos completos entre a data de nascimento e a referência.

## Nota de precisão numérica

`round(x)` interno arredonda a 2 casas (usado em `suggestNextWeight`). Lembrar que os
valores de peso/reps vindos do banco são strings → o código chama `Number(...)` antes
de passar às fórmulas.
