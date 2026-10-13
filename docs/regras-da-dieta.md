# Regras da dieta — Habitual Fit

Referência das regras que calculam metas, escolhem alimentos e montam o
cardápio, no estado **implementado**. Cada regra aponta para o arquivo onde vive.
Versões: metas `TARGETS_CALCULATION_VERSION = 2026.10-1`, gerador
`MEAL_PLAN_RULES_VERSION = 2026.10-1`.

- Regras puras e testadas: `packages/domain/src/nutrition/`
- Banco e orquestração: `apps/web/src/data/` (`meal-plans.ts`, `planning-profile.ts`, `diet-day.ts`, `diet-week.ts`, `local-catalog.ts`)

> ⚠️ As metas são estimativas e o app não substitui nutricionista. Limites de
> segurança, faixas de macros, porções e elegibilidade por refeição são
> propostas de produto **pendentes de validação profissional**.

---

## 1. Fluxo

```
Questionário / perfil
   │  validação: sem dado inventado; bloqueios de escopo e de limites
   ▼
Metas diárias (assessEnergy) ── uma meta, igual nos 7 dias
   ▼
Catálogo curado (curated-foods.ts) ── só alimentos revisados, macros do banco
   ▼
Pool seguro (dietary-filters.ts) ── alergia, dieta e "não gosto" por marcadores
   ▼
Semana (generateWeeklyPlan) ── por refeição: receita → quantidades incrementais
   │                              por dia: fechamento ±50 kcal (ou ±100)
   ▼
Gravação ── plano novo inativo → refeições/itens → troca o ativo (rollback se falhar)
   ▼
Diário ── na 1ª abertura do dia, copia os itens daquele dia da semana
```

---

## 2. Metas diárias — `energy.ts`, `planning-profile.ts`

`assessEnergy` é a única porta de entrada para metas calculadas (geração do
cardápio, Perfil e Configurações).

1. **Dados obrigatórios**: sexo, idade, altura, peso. Faltando → `incomplete_profile`
   (nada de 75 kg / 172 cm / 28 anos inventados). Fora de 35–250 kg, 130–230 cm,
   14–90 anos → `invalid_profile`.
2. **Escopo**: menor de 18 anos → `under_age`; objetivo perder peso com IMC < 18,5
   → `underweight_weight_loss`. Em ambos, não gera e orienta procurar profissional.
3. **TMB** (Mifflin-St Jeor): `10·peso + 6,25·altura − 5·idade + offset`
   (masculino +5, feminino −161, outro −78).
4. **TDEE estimado** = TMB × fator de atividade (derivado dos dias de treino:
   ≤2 → 1,375; 3–4 → 1,55; 5 → 1,725; ≥6 → 1,9). É estimativa, e é rotulado assim.
5. **Objetivo**: perder `max(TDEE·0,85; TDEE−750)`; ganhar `min(TDEE·1,10; TDEE+500)`;
   manter `TDEE`.
6. **Limites**: meta abaixo de 1.500 kcal (masculino/outro) ou 1.200 (feminino), ou
   acima de 5.000 → `kcal_out_of_range`: não corrige, interrompe e orienta.
7. **Macros**: proteína `min(2 g/kg; 35% das kcal)`, gordura 25% das kcal,
   carboidrato = restante (≥ 40% das kcal por construção, nunca negativo), fibra
   14 g/1000 kcal. Entrada inválida lança erro (sem `NaN`).

Metas gravadas no perfil (ajuste manual ou metas adaptativas aceitas) têm
prioridade sobre o cálculo, mas passam pelos limites do item 6 e pelos bloqueios
do item 2. Abrir a tela nunca recalcula metas.

---

## 3. Catálogo curado — `curated-foods.ts`, `food-catalog.ts`

Só 80 alimentos revisados podem ser **prescritos** (gerador e substituições). O
resto do banco continua registrável no diário.

Cada alimento curado declara: conceito (`key`), apelidos (`taco:N`, `forja:*`,
`name:<nome exato>` para a base original sem `external_id`), **papel culinário**
(`starch`, `bread`, `protein`, `legume`, `dairy`, `vegetable`, `fruit`, `fat`,
`nuts`), **refeições elegíveis**, **estado de preparo** (cozido, grelhado, cru,
seco…), **marcadores** (`meat`, `fish`, `seafood`, `dairy`, `egg`, `honey`,
`gluten`, `peanut`, `nuts`, `soy`, `starch`) e **porção** (mín., máx., passo, padrão).

- Os macros **não** estão na curadoria: vêm do banco, normalizados para 100 g a
  partir de `serving_size_g` (o "Pão francês" original é por 50 g).
- Um alimento curado é rejeitado se não tem calorias ou se `4P + 4C + 9G` diverge
  das kcal em mais de 25% (mín. 15 kcal). Ex.: `Leite, de vaca, integral` (taco:458)
  tem macros zerados no seed e não é curado.
- `taco:` e `name:` só valem para alimentos públicos; `forja:` é o catálogo local
  que o próprio app grava. Alimento do usuário com o mesmo nome não é confiável.
- Conceitos com mais de um apelido viram um alimento só.

---

## 4. Restrições — `dietary-filters.ts`

Exclusão por **marcadores**, nunca por trecho de nome:

| Restrição | Exclui marcadores |
|---|---|
| Vegetariana | meat, fish, seafood |
| Vegana | meat, fish, seafood, dairy, egg, honey |
| Sem lactose / alergia a leite | dairy |
| Sem glúten / alergia a glúten | gluten (aveia incluída, por contaminação cruzada) |
| Baixo carboidrato | starch |
| Ovo · Amendoim · Castanhas · Frutos do mar · Peixe · Soja | egg · peanut · nuts · seafood · fish · soy |

- Restrição desconhecida lança erro (não é ignorada).
- "Não gosto de X" (≥ 3 letras, sem acento) tira da geração por nome ou conceito.
- **Nada é afrouxado.** Se café, almoço ou jantar não podem ser montados, a
  geração falha com a explicação; lanche impossível fica vazio e sinalizado.

---

## 5. Refeições — `meal-slots.ts`

- 3 a 8 refeições; **padrão 5** quando não informado (café, almoço, lanche da
  tarde, pós-treino, jantar). Prioridade: almoço → jantar → café → lanche da tarde
  → pós-treino → lanche da manhã → pré-treino → ceia.
- Pesos relativos normalizados (somam 100%): café 20, lanche manhã 8, almoço 28,
  lanche tarde 10, pré 7, pós 10, jantar 22, ceia 5.
- Horários: grade padrão deslizando com o horário de acordar (−60/+180 min), faixa
  por refeição, café ≥ acordar + 30 min, pré = treino − 60, pós = treino + 45,
  intervalo mínimo de 90 min, última refeição até 1 h antes de dormir. Horários
  editados à mão não são mais reescritos ao abrir a tela.

---

## 6. Receitas e quantidades — `recipes.ts`, `meal-plan.ts`

Cada refeição é uma **receita** (composição culinária) com ingredientes por papel:

- Café: pão com ovo e fruta · pão com queijo e café com leite · iogurte com aveia
  e fruta · cuscuz com ovo · tapioca recheada · vitamina com aveia · pão com pasta
  de amendoim e fruta · aveia com fruta e castanhas · tapioca com fruta.
- Lanches: fruta com iogurte · fruta com castanhas · fruta com queijo · sanduíche
  simples · sanduíche de queijo · ovos com fruta.
- Pré-treino: fruta com aveia · pão com banana · tapioca com fruta · batata-doce.
- Almoço/jantar: arroz, feijão, proteína e salada · arroz, feijão, proteína e
  legumes · arroz com lentilha · batata/mandioca com proteína e legumes ·
  macarrão com carne/frango · cuscuz com ovos (jantar).
- Reservas (só quando nenhuma outra é viável): arroz, feijão e legumes (vegano) ·
  proteína com legumes e salada (baixo carboidrato) · fruta.

Quantidades, **incrementalmente**:

1. Ingredientes `fixed` (vegetais, fruta, feijão, laticínio, azeite) na porção padrão.
2. Ingrediente `protein`: gramas para fechar a proteína da refeição **descontando
   a que os outros já trazem** (pão, aveia, feijão, laticínio).
3. Ingrediente `energy` (a base): gramas para as calorias que sobram.
4. Três passadas; tudo dentro de mín./máx. e no passo do alimento.

Se a receita da vez erra a refeição em mais de 15%, tenta a próxima (até 4).

---

## 7. Fechamento do dia e da semana — `meal-plan.ts`

- **Calorias**: um passo de porção por vez, sempre o que mais aproxima da meta,
  preferindo bases → proteínas → acompanhamentos, e a refeição mais longe do
  próprio alvo. Vegetais não entram no ajuste. Para quando nenhum passo aproxima.
- **Proteína**: depois, trocas que aproximam a proteína sem sair de ±50 kcal (ou
  do desvio já alcançado); a compensação com a base é sempre na mesma refeição.
- **Status do dia**: `ideal` (±50), `acceptable` (±100), `outside`. A meta nunca é
  alterada; o desvio real é informado.
- **Semana**: as 7 metas são idênticas. Receita repetida na semana pesa 10; a mesma
  do dia anterior, 30; alimento repetido na semana, 3 por uso; no mesmo dia, 6;
  "gosto de" −4; fonte de proteína pouco densa (g/100 kcal) pesa um pouco;
  desempate por hash determinístico da semente. Mesmo alimento nunca duas vezes
  na mesma refeição.
- **Avisos**: poucas opções por papel (proteína < 3, base < 2, fruta < 3, vegetal
  < 3), dias fora de ±50 com o maior desvio e sugestão de nº de refeições,
  proteína média > 10% abaixo, refeição que não pôde ser montada.

Resultado medido no catálogo de teste (1.600–3.000 kcal, 4–6 refeições, 6 sementes):
onívoro ~96% dos dias em ±50 kcal, proteína média ≈ meta. Vegano e vegetariano
fecham calorias, mas a proteína fica 30–45% abaixo de 2 g/kg — limite do catálogo,
avisado ao usuário.

---

## 8. Gravação e diário — `meal-plans.ts`, `diet-day.ts`, `diet-week.ts`

- Plano novo nasce **inativo**; refeições e itens (com `weekday` e o nome da receita
  em `prep_notes`) são gravados; só então o anterior é arquivado e o novo ativado.
  Falha antes da troca apaga o novo; falha na troca reativa o anterior.
- Metadados de auditoria em `meal_plans.notes` (JSON): versões, semente, data, status
  e desvio por dia, avisos.
- `ensureActiveMealPlan` só gera quando não há plano utilizável; abrir a tela de
  novo não grava nada.
- Diário: copia o plano do dia da semana na primeira abertura (hoje ou futuro);
  passado nunca é remontado; consumido nunca é sobrescrito.
- Plano, diário, cardápio semanal, receitas e gerador usam a mesma soma
  (`nutritionTotals` / `recipeNutrition`).

---

## 9. Substituições — `substitutions.ts`, `substitute-food-dialog.tsx`

- Candidatos: só o catálogo curado, filtrado pelas alergias, dieta e "não gosto"
  do perfil.
- Mesmo papel culinário (arroz ↔ batata/mandioca/macarrão, não pão). Original fora
  da curadoria usa os papéis possíveis da categoria.
- Quantidade preserva o macro dominante e respeita a porção do substituto.
- A tela mostra a diferença de kcal, P, C e G antes de confirmar.

---

## 10. Pendências conhecidas

- Gravidez/amamentação, transtorno alimentar e doenças não são perguntados no
  questionário: o bloqueio de escopo não os cobre.
- Mudar a meta (ajuste manual ou adaptativa) não regenera o cardápio: o plano
  mantém a meta com que foi gerado até o usuário gerar outro.
- Baixo carboidrato não muda a divisão de macros (só exclui amidos): dias tendem a
  ficar abaixo da meta, com aviso.
- Medidas caseiras por alimento ainda vêm só do banco (`household_measure`).
