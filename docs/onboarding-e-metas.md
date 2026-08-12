# Fluxo: Onboarding e cálculo de metas

Do cadastro até ter metas de calorias/macros valendo no diário.

## Passo a passo

```
/auth  (cadastro: email+senha ou Google)
   │  supabase.auth.signUp / OAuth
   │  → trigger handle_new_user cria profiles + user_roles('user')
   ▼
/dashboard  (metas ainda vazias → cards mostram "defina no perfil")
   │
/body  → registrar PESO (upsert em body_weights)   ◄── pré-requisito do cálculo
   │
/profile
   │  preencher: sexo, data de nascimento, altura, nível de atividade, objetivo
   │  preview recalcula em tempo real:
   │     yearsBetween → bmrMifflin → tdee → goalCalories → macroTargets
   │  "Salvar" → grava metas em profiles + onboarding_completed = true
   ▼
/diet e /dashboard passam a comparar consumo × metas
```

## Regras / dependências

- **Perfil é criado automaticamente** no signup (trigger no banco). O usuário nunca
  cria o `profiles` manualmente. Ver [arquitetura/autenticacao.md](../arquitetura/autenticacao.md).
- O cálculo de metas **exige um peso registrado** em `/body`. Sem peso (ou faltando
  sexo/altura/nascimento), o preview no perfil mostra instruções em vez dos números.
- A cadeia de fórmulas está em [dominio/formulas.md](../dominio/formulas.md):
  - `bmrMifflin` (Mifflin-St Jeor) → `tdee` (fator de atividade) →
    `goalCalories` (−15% cortar / +10% ganhar) → `macroTargets` (P 2g/kg, G 25%, C resto, fibra 14g/1000kcal).
- Metas gravadas: `daily_kcal_target`, `protein_g_target`, `carbs_g_target`,
  `fat_g_target`, `fiber_g_target` em `profiles`.

## Onde as metas são consumidas

- **/diet** — barras de progresso por refeição/dia ([modulos/dieta.md](../modulos/dieta.md)).
- **/dashboard** — card de calorias e barras de macros ([modulos/dashboard.md](../modulos/dashboard.md)).

## ⚠️ "Metas adaptativas"

A UI promete ajuste automático conforme o peso semanal, mas **não há recálculo
automático** implementado. Na prática, as metas só mudam quando o usuário reabre
`/profile` e salva de novo (o preview usa o último peso registrado). Ver
[modulos/perfil-e-metas.md](../modulos/perfil-e-metas.md).

## `onboarding_completed`

Vira `true` ao salvar o perfil pela primeira vez. ⚠️ Hoje **nenhuma rota redireciona
com base nesse flag** — não há um wizard de onboarding forçado; o campo existe mas não
é usado para gatear navegação.
