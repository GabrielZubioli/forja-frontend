> **Nota histórica.** Este documento foi escrito quando o Forja era um
> monorepo só. A estrutura de diretórios que ele descreve não existe mais —
> o projeto virou `forja-backend` + `forja-frontend`. As **decisões** abaixo
> (Expo, PowerSync, offline-first) continuam valendo e são o registro de por
> que a arquitetura é o que é; só o layout de pastas está desatualizado.

# Arquitetura — Monorepo e evolução para produção

> Este documento reflete a **virada para produção** (app mobile nas lojas). A
> documentação em `context/modulos/*` descreve o **app web atual**, que continua
> valendo como referência de comportamento até ser reescrito no mobile.

## Decisões fechadas

| Tema                     | Decisão                                                    |
| ------------------------ | ---------------------------------------------------------- |
| Plataforma de publicação | **Expo / React Native** (apps nativos iOS+Android)         |
| Offline + sync           | **PowerSync + Supabase** (SQLite local, fila, conflitos)   |
| Metas adaptativas        | **Filtro de Kalman** (estima TDEE de peso × consumo)       |
| Repositório              | **Monorepo** (npm workspaces); app web mantido em paralelo |
| Acento                   | Laranja/âmbar; tema segue o sistema + override manual      |
| Lovable                  | **Abandonado** — não é mais uma restrição de estrutura     |

## Layout do monorepo

```
/ (raiz = app web atual, @forja/web)
├── src/ …                    # app web TanStack Start (inalterado, funcional)
├── supabase/migrations/      # migrations compartilhadas (Postgres/Supabase)
├── packages/
│   ├── domain/  (@forja/domain)   # lógica de negócio pura, testada (Vitest)
│   └── db/      (@forja/db)        # schema PowerSync + sync rules
└── apps/
    └── mobile/  (@forja/mobile)    # app Expo (novo)
```

npm workspaces em [package.json](../../package.json) (`packages/*`, `apps/*`).

## `@forja/domain` — núcleo de lógica pura

TS estrito (zero `any`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`),
sem DOM/window/localStorage. **Reusado por web e mobile.** Testado com Vitest.

| Módulo                      | Conteúdo                                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `training/one-rep-max`      | `epley1RM`                                                                                                     |
| `training/volume`           | `setVolume`, contribuições por músculo (0..1), `aggregateMuscleVolume` (tonelagem e séries efetivas por grupo) |
| `training/progression`      | `nextDoubleProgression` (dupla progressão configurável, com schema Zod)                                        |
| `training/legacy`           | `suggestNextWeight` (heurística V1, usada só pela web)                                                         |
| `nutrition/energy`          | `bmrMifflin` (Mifflin-St Jeor), `tdee`, `goalCalories`, `macroTargets`                                         |
| `nutrition/adaptive-macros` | **Kalman** 2 estados `[peso real, TDEE]`; `estimateTdeeSeries`, `adaptiveCalorieTarget`                        |
| `body/trend`                | `ema` (média móvel exponencial)                                                                                |
| `shared/units`              | `KCAL_PER_KG`, fatores de Atwater                                                                              |
| `shared/dates`              | utilitários de dia em **UTC**, `yearsBetween`                                                                  |

Rodar testes: `npm run test:domain` (na raiz) — 31 testes passando.

### Kalman (metas adaptativas) — resumo

Estado latente `[pesoReal, tdee]`; a balança observa o peso com ruído; a ingestão
diária é entrada de controle. Do balanço energético `Δpeso = (ingestão − tdee)/K`
(K = 7700 kcal/kg), o filtro separa o peso real do ruído e **reestima o TDEE**
continuamente. `adaptiveCalorieTarget(tdee, ΔpesoSemanal)` gera a meta calórica.
Detalhe em [adaptive-macros.ts](../../packages/domain/src/nutrition/adaptive-macros.ts).

## `@forja/db` — dados compartilhados

- `src/schema.ts` — schema **local SQLite** do PowerSync (`AppSchema`), espelho do
  Postgres. Já inclui tabelas novas: `exercise_muscles`, `progression_settings`,
  `tdee_estimates`, e a coluna `rest_actual_seconds` em `workout_sets`.
- `sync/streams.yaml` — sync rules (formato **streams edition 3**). Stream
  `user_owned` (dados do usuário, tabelas-filhas via JOIN) + `catalog` (exercícios/
  alimentos públicos). Ver [README do pacote](../../packages/db/README.md).
- Segurança: o RLS do Postgres continua sendo a autoridade; as sync rules apenas
  particionam o que desce para o device.

## `@forja/mobile` — app Expo

Expo Router + NativeWind (tokens âmbar light/dark) + PowerSync + Supabase.
Scaffold funcional criado (tema, providers, tela de verificação que já consome
`@forja/domain`). Setup e próximos passos em [apps/mobile/README.md](../../apps/mobile/README.md).

## Estado atual (o que já foi feito)

✅ Monorepo + workspaces · ✅ `@forja/domain` completo e testado ·
✅ Web repointada para o domínio (build verificado) · ✅ `@forja/db`
(schema PowerSync typechecado + sync rules) · ✅ scaffold do app Expo.

## Pendências por milestone (próximos)

1. **Schema+RLS+Seeds+Auth**: migrations das tabelas novas + `updated_at`/`rest_actual_seconds`,
   bucket `progress-photos`, seed de ~200 alimentos + pesos musculares, PowerSync
   ligado, auth no Expo (email+senha, verificação, reset, Google via expo-auth-session).
2. **Design System + Shell** (mobile): componentes base + estados loading/erro/vazio + navegação.
3. **Treino** · 4. **Dieta** (Open Food Facts + código de barras) · 5. **Corpo + Dashboard**.

## Pré-requisitos de infra (externos)

Instância **PowerSync** conectada ao Postgres do Supabase; conta **Expo/EAS**;
contas **Apple Developer** e **Google Play**. Não bloqueiam os milestones 0–1 de código.
