# Reestruturação — Forja v2

> Plano técnico da reconstrução do app para nível comercial. Escrito após leitura
> integral do código, das 8 migrations, do `@forja/domain` e de toda a
> documentação em `context/`.
>
> Data: 2026-08-04 · Escopo: app web (`@forja/web`) + `packages/domain` + `supabase/`

---

## 0. Princípio que orienta tudo

O projeto **não** é reescrito do zero. A auditoria anterior
([auditoria-e-roadmap.md](auditoria-e-roadmap.md)) já corrigiu 13 bugs, extraiu o
domínio para um pacote puro com 125 testes, e montou uma fundação sólida
(`src/data/`, query-keys, `QueryBoundary`, RLS correto). Jogar isso fora seria
destruir valor.

O que se reconstrói é **tudo o que fica acima dessa fundação**: fluxo de entrada,
modelagem de nutrição, catálogo, telas e a camada de IA.

### O que se preserva

| Ativo                                              | Por quê                                                      |
| -------------------------------------------------- | ------------------------------------------------------------ |
| `@forja/domain` (125 testes)                       | Lógica pura, testada, portável. Cresce, não some.            |
| RLS + padrões de policy                            | Segurança no lugar certo (banco, não aplicação)              |
| `src/data/` + `query-keys` + `supabase-helpers`    | Camada de acesso tipada com tratamento de erro explícito     |
| `QueryBoundary`, `ConfirmButton`, `theme-provider` | Resolvem problemas reais (empty state falso, exclusão fatal) |
| Sessão de treino ao vivo                           | Cronômetro por timestamp, PRs, supersets, DnD — é bom        |
| Gerador de plano determinístico                    | Instantâneo, testável, funciona offline                      |

### O que é refeito

Fluxo de entrada · modelagem de nutrição · catálogo de exercícios e alimentos ·
Home · módulo de treino (visual e navegação) · módulo de dieta (inteiro) ·
progresso · e uma camada de IA que **não existia**.

---

## 1. Decisões de arquitetura

### 1.1 IA híbrida — motor determinístico + LLM

| Responsabilidade                                    | Quem faz                              |
| --------------------------------------------------- | ------------------------------------- |
| Montar treino, dividir a semana, distribuir volume  | `@forja/domain` (determinístico)      |
| Montar dieta, distribuir macros pelas refeições     | `@forja/domain` (determinístico)      |
| Progressão de carga, deload, detecção de estagnação | `@forja/domain` (determinístico)      |
| Substituições de alimento por proximidade de macros | `@forja/domain` (determinístico)      |
| Conversa, dúvidas, explicação, motivação            | LLM (Claude, via Edge Function)       |
| Análise narrativa do progresso                      | LLM, com os números vindos do domínio |

**Por que híbrido e não LLM em tudo.** Um plano de treino gerado por LLM leva
10–30 s, custa por geração, não é determinístico (impossível de testar), e o app
fica inutilizável sem rede — justamente na academia, onde o sinal é pior. Pior
ainda: um LLM sem trava prescreve 30 séries de peito num iniciante. O motor
determinístico já valida volume por grupo muscular
(`findVolumeOutliers`) e é auditável.

O LLM entra onde ele é insubstituível: linguagem. Ele **nunca** inventa números —
recebe os dados já calculados pelo domínio e os explica.

**Segurança:** a chave nunca vai ao browser. Toda chamada passa por uma Supabase
Edge Function que valida o JWT do usuário, monta o contexto a partir do banco
(respeitando RLS) e chama a API. Sem a chave configurada, o app degrada com
elegância: o chat some, todo o resto funciona.

### 1.2 Catálogo de exercícios — Free Exercise DB

873 exercícios, domínio público (sem restrição comercial), **todos com 2 imagens**
(início e fim do movimento) e passos de execução. Nomes em inglês → traduzidos e
mapeados para os enums do banco na importação.

Era a única lacuna que a auditoria anterior declarou impossível de fechar com
código. Fecha.

### 1.3 Alimentos — seed brasileiro + Open Food Facts ao vivo

- **Seed local:** alimentos in natura e preparações brasileiras, com macros e
  micros. Cobre o que a IA usa para montar dieta.
- **Open Food Facts:** busca ao vivo + código de barras para industrializados.
  Alimento usado é copiado para `foods` local (cache), então o histórico não
  quebra se a API sair do ar.

### 1.4 Dieta: de diário para plano executável

Hoje a dieta é um **diário** (o usuário registra o que comeu). Vira um **plano**
(o app diz o que comer, o usuário marca como consumido).

O dia é **materializado** a partir do plano na primeira abertura: cada item vira
uma linha de `food_log_entries` com `consumed = false`. Isso torna trivial marcar
como consumido, editar só aquele dia sem afetar o plano, e manter histórico real.

---

## 2. Modelagem de dados

### 2.1 Migrations novas

| Arquivo                           | Conteúdo                                                                 |
| --------------------------------- | ------------------------------------------------------------------------ |
| `..._expand_exercise_catalog.sql` | Enums novos, colunas de mídia/execução/padrão, `exercise_muscles`, busca |
| `..._nutrition_v2.sql`            | 8 slots de refeição, `meal_plans`, materialização do dia, consumo        |
| `..._foods_enrichment.sql`        | Micronutrientes, categoria, imagem, favoritos, `external_id`             |
| `..._water_and_habits.sql`        | `water_intake`, metas de água                                            |
| `..._user_profile_v2.sql`         | Respostas do questionário (JSONB), restrições, lesões, horários          |
| `..._goals_and_progress.sql`      | `goals`, medidas adicionais                                              |
| `..._ai_coach.sql`                | `ai_conversations`, `ai_messages`, `ai_recommendations`                  |

### 2.2 Regras que valem em todas

- RLS habilitado, seguindo os 3 padrões já existentes (dono direto / dono via pai
  / público-ou-dono).
- `updated_at` via `tg_set_updated_at()`.
- Soft delete onde há risco de perda (`deleted_at`).
- `CHECK` constraints aplicadas `NOT VALID` + validação tolerante, como na
  migration de integridade existente.
- Nada de `ALTER TYPE ... ADD VALUE` dentro de transação — enums novos em vez de
  estender os antigos, com backfill e troca de coluna.

---

## 3. Ondas de execução

| Onda | Entrega                                                            |
| ---- | ------------------------------------------------------------------ |
| 1    | Migrations (modelagem completa)                                    |
| 2    | Importação dos catálogos (exercícios + alimentos)                  |
| 3    | Fluxo de entrada: questionário anônimo → cadastro → geração        |
| 4    | Home                                                               |
| 5    | Módulo de musculação (mapa muscular, semana, execução, progressão) |
| 6    | Módulo de alimentação (plano, consumo, substituições, água)        |
| 7    | Progresso                                                          |
| 8    | IA treinador                                                       |
| 9    | Polimento de experiência                                           |

Cada onda termina com `npm run verify` verde (typecheck + testes + build).

---

## 4. Registro de execução

**Verificação final:** `tsc --noEmit` limpo · `eslint` sem erros · **239 testes**
passando (36 web + 203 domínio; eram 125) · `vite build` OK · 10 migrations
aplicadas no projeto `nursxzqagxmeiucsaqzm`.

### Onda 1 — Modelagem (concluída)

Seis migrations, todas aplicadas e com tipos regenerados.

| Migration                     | Entrega                                                                                                                                                                                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `..._extend_muscle_enum`      | `lower_back` e `neck` em `muscle_t` — isolada porque enum novo não pode ser usado na mesma transação                                                                                                                                            |
| `..._expand_exercise_catalog` | `movement_pattern`, `level`, `mechanic`, `force_type`, `execution[]`, `common_mistakes[]`, `image_urls[]`, `default_cadence`, `contraindications[]`, `popularity`, `name_en` · tabela `exercise_muscles` (contribuição 0–1) · índices `pg_trgm` |
| `..._nutrition_v2`            | 8 slots de refeição · `meal_plans` / `meal_plan_meals` / `meal_plan_items` · `diet_days` · consumo (`consumed`, `plan_item_id`, `source`)                                                                                                       |
| `..._foods_enrichment`        | 12 micronutrientes, categoria, medida caseira, `is_staple`, favoritos, preferências de substituição                                                                                                                                             |
| `..._profile_v2_and_habits`   | `onboarding_answers` (JSONB) · lesões, alergias, restrições, horários · `water_intake` · `goals` · medidas adicionais                                                                                                                           |
| `..._ai_coach`                | `ai_conversations`, `ai_messages`, `ai_recommendations`                                                                                                                                                                                         |

**Decisão que vale registrar:** a coluna `meal_type` foi **removida** após
backfill para `meal_slot`. Manter as duas seria garantia de divergência.

### Onda 2 — Catálogos (concluída)

| Tabela             | Antes | Depois | Fonte                        |
| ------------------ | ----- | ------ | ---------------------------- |
| `exercises`        | 68    | 880    | free-exercise-db (dom. púb.) |
| `exercise_muscles` | —     | 2.574  | derivado                     |
| `foods`            | 25    | 622    | TACO (NEPA/Unicamp)          |

Geradores em `scripts/catalog/`. São **idempotentes**: reexecutar atualiza, não
duplica.

Os 61 exercícios já existentes foram **atualizados**, não recriados — o
histórico de treino aponta para aqueles `exercise_id`. O casamento é por tabela
explícita (`core-pt.mjs`), não por similaridade de nome, e o script falha se um
`external_id` não existir.

**A assimetria deliberada:** execução em português é curada para os 61 do
núcleo. Os outros 819 trazem a descrição original em inglês, rotulada como tal
na UI. Traduzir 3.011 frases distintas por dicionário produziria português
quebrado se passando por conteúdo próprio.

### Onda 3 — Domínio (concluída)

`packages/domain` passou de 125 para 203 testes.

| Módulo                    | Conteúdo                                                                        |
| ------------------------- | ------------------------------------------------------------------------------- |
| `nutrition/meal-slots`    | 8 refeições, distribuição normalizada, horários ancorados na rotina             |
| `nutrition/food-catalog`  | Papel do alimento no prato, corrigido pelos macros quando a categoria engana    |
| `nutrition/meal-plan`     | Gerador determinístico — proteína primeiro, gordura como amortecedor            |
| `nutrition/substitutions` | Quantidade ajustada pelo macro dominante + distância honesta                    |
| `nutrition/hydration`     | Meta por peso e treino, não "2 litros para todo mundo"                          |
| `training/insights`       | Estagnação, fadiga acumulada (deload), volume por grupo, alinhamento energético |
| `body/composition`        | IMC, gordura pelo método da Marinha, progresso de meta, ritmo por regressão     |

### Ondas 4 a 9 — Aplicação (concluídas)

**Fluxo:** `/` (questionário, 24 passos, sem login) → `/criar-conta` →
`/preparando` → app com treino, dieta, metas e progresso já montados.

**Home:** anel de calorias com o que _falta_, quatro anéis de macro contando só
o **consumido**, treino de hoje, próxima refeição pendente, água em um toque,
recomendações do treinador.

**Musculação:** faixa da semana navegável, mapa muscular SVG com intensidade
vinda de `exercise_muscles`, ficha do exercício com demonstração em duas fotos,
edição de séries/reps/descanso/RPE no lugar.

**Alimentação:** dia materializado do plano, marcação de consumo com
atualização otimista, substituição mostrando o custo em macros.

**Treinador:** Edge Function `supabase/functions/coach`. Chave fora do
navegador; contexto montado sob RLS; o modelo explica, não prescreve.

**Progresso:** aba de resumo com IMC, ritmo semanal, gordura estimada e
progresso de meta — cada número com a sua ressalva.

---

## 5. O que depende de você

1. **Chave da IA** — o chat só funciona depois de:

   ```sh
   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   npx supabase functions deploy coach
   ```

   Sem isso, a tela do treinador explica o que falta e o resto do app funciona
   normalmente. As recomendações da Home **não** dependem disso.

2. **Imagens dos exercícios vêm de CDN externa** (`cdn.jsdelivr.net`, servindo
   o free-exercise-db). Funciona e é gratuito. Se quiser independência total,
   as 1.746 imagens (~60 MB) podem ser copiadas para o Storage do Supabase — as
   URLs estão em `exercises.image_urls` e a troca é uma migration de `UPDATE`.

3. **Execução em português para os 819 exercícios restantes** é conteúdo, não
   código. O caminho é preencher `execution`, `cues` e `common_mistakes` no
   padrão de `scripts/catalog/core-pt.mjs`.

4. **Secrets do CI** (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) —
   pendência anterior, ainda aberta.
