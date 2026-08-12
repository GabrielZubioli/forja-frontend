# Módulo: Perfil e metas nutricionais

Tela: `/profile` — [profile.tsx](../../src/routes/_authenticated/profile.tsx).

## Tabela

`profiles` (1:1 com `auth.users`, criada no cadastro pelo trigger `handle_new_user`).
Campos editáveis aqui: `display_name`, `sex`, `birth_date`, `height_cm`,
`activity_level`, `goal`. Campos calculados/gravados: `onboarding_completed` e as
metas (`daily_kcal_target`, `protein_g_target`, `carbs_g_target`, `fat_g_target`,
`fiber_g_target`).

## O que a tela faz

1. Carrega `profiles` (`maybeSingle`) e o **último peso** de `body_weights`.
2. Formulário controlado (`useState`) com sexo, nascimento, altura, nível de
   atividade e objetivo.
3. **Preview de metas em tempo real** (`preview`): recalcula a cada mudança usando
   as fórmulas puras, desde que haja peso + altura + data de nascimento:

```ts
const age = yearsBetween(form.birth_date);
const bmr = bmrMifflin({ sex, weightKg: peso, heightCm: altura, ageYears: age });
const t = tdee(bmr, activity_level);
const kcal = goalCalories(t, goal);
const m = macroTargets(kcal, peso); // { protein_g, fat_g, carbs_g, fiber_g }
```

4. **Salvar**: grava o formulário + as metas do preview em `profiles`, seta
   `onboarding_completed = true`, e invalida `["profile"]`.

Detalhe das fórmulas: [dominio/formulas.md](../dominio/formulas.md).

## Dependência importante

O cálculo **exige um peso registrado** em `body_weights`. Se o usuário não registrou
peso (ou faltam sexo/altura/nascimento), o preview mostra a instrução:
_"Preencha sexo, data de nascimento, altura e registre seu peso em Corpo…"_.

Fluxo recomendado ao usuário: registrar peso em **/body** → preencher **/profile** →
metas passam a valer em **/diet** e **/dashboard**.

## Enums usados (do banco)

- `sex_t`: `male | female | other`
- `activity_level_t`: `sedentary | light | moderate | active | very_active`
- `goal_t`: `lose | maintain | gain`
- `unit_system_t`: `metric | imperial` (campo existe em `profiles`, default `metric`;
  ⚠️ **não há UI para trocar de sistema** — o app assume métrico em toda a interface).

## ⚠️ A confirmar

- O texto da tela promete _"metas adaptativas: ajustamos automaticamente conforme seu
  peso semanal evolui"_, mas **não há job/recálculo automático** no código — as metas
  só mudam quando o usuário reabre o perfil e salva. ⚠️ recurso aspiracional/manual hoje.
