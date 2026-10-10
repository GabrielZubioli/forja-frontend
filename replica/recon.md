# Recon map: Befit — Plano e Treino Academia (iOS + Android)

Scope: o loop central de treino — plano gerado → treino do dia → registrar séries → progresso/recuperação. Dieta, receitas e corpo do Forja ficam fora (o Befit não tem).
For: o próprio Forja. A "réplica" é feita **sobre o Forja existente** (front em `forja-frontend`, back em `forja-backend`), não num projeto novo.
Date: 2026-10-09

Regras seguidas: só fontes públicas, nenhuma conta do Befit usada, nenhum bundle/API privada lida. Nenhuma screenshot salva (`replica/screens/` vazio de propósito — as descrições abaixo vêm do texto das fontes).

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | App Store (pt-BR) | https://apps.apple.com/br/app/befit-plano-e-treino-academia/id6504535443 | lista de features, premium, changelog ("Novidades"), avaliações |
| 2 | Google Play | https://play.google.com/store/apps/details?id=app.befit&hl=pt | mesma descrição; dev 3APPS |
| 3 | Site + FAQ | https://appbefit.com/pt-br | FAQ = central de ajuda: substituir, editar carga, histórico, ofensiva, sons, dias da semana, offline, assinatura |
| 4 | Review TechTudo (30 dias) | https://www.techtudo.com.br/guia/2026/08/befit-vale-a-pena-testamos-os-recursos-do-aplicativo-de-exercicios-edapps.ghtml | onboarding, PR ao registrar, resumo pós-treino, tela bloqueada, críticas |
| 5 | Vídeo walkthrough | https://www.youtube.com/watch?v=mw4E7UA9pjo | perguntas do onboarding na ordem |
| 6 | Aptoide (descrição Android) | https://befit-3apps-llc.br.aptoide.com/app | itens do premium |

## Core loop

Responder um quiz → receber uma ficha A/B/C gerada → abrir o app e apertar play no "treino de hoje" → registrar séries rápido (com descanso e PR) → ver o resumo e o progresso subir.

## Screens

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Boas-vindas / login | primeira abertura | entrar (Google, Apple, e-mail) ou começar | botões OAuth, CTA | default |
| S02 | Quiz de onboarding | "Começar" | gênero, experiência (iniciante/<1a/1-2a/>2a), frequência atual, objetivo (condicionamento/perder peso/definir/ganhar músculo), local (academia grande/pequena/casa/peso corporal), região de foco, dias/semana | option cards, progress bar, voltar | um passo por tela |
| S03 | Gerando plano | fim do quiz | loading do plano "IA" | progress animation | loading, pronto |
| S04 | Paywall | após plano / ao tocar recurso premium | assinatura mensal/anual, restaurar compras | plan cards, CTA, "Restaurar Compras" | default, oferta com desconto |
| S05 | Home / Hoje | tab Início | treino do dia em destaque, dias da semana (Dia 1, Dia 2… = A/B/C), ofensiva, meta semanal, botão Editar | hero card, week strip, streak chip | treino pendente, concluído hoje, descanso |
| S06 | Editar treino | "Editar" na home | trocar exercícios (Substituir), defaults de séries/reps/carga/descanso | exercise rows, swap sheet | default |
| S07 | Sessão ao vivo | play no treino | registrar peso/reps por série, timer de descanso, menu ⋯ (substituir/remover), aviso de PR, tela bloqueada | set table, numeric input, rest timer, PR toast | em andamento, descanso, offline |
| S08 | Seletor de exercício | Substituir / adicionar | escolher exercício do mesmo grupo | search, filtros músculo/equipamento | filtrado, vazio |
| S09 | Detalhe do exercício | tocar no exercício | vídeo, passo a passo, histórico, recorde | video player, steps, mini chart | sem histórico |
| S10 | Resumo pós-treino | finalizar sessão | volume total, duração, calorias, PRs, comparação por exercício | stat tiles, PR list | com/sem PR |
| S11 | Treino rápido | tab Treinos → rápido | escolher grupo muscular e treinar avulso | muscle grid | default |
| S12 | Minhas rotinas | tab Treinos | criar/salvar/editar fichas próprias | list, editor | vazio, cheio, limite free |
| S13 | Biblioteca de programas | tab Treinos → programas | programas prontos: hipertrofia, força, emagrecimento, definição | program cards, detalhe | premium lock |
| S14 | Biblioteca de exercícios | tab Exercícios | 500+ exercícios, busca por músculo/equipamento/palavra | search, chips, grid | vazio de busca |
| S15 | Progresso / Análises | tab Progresso | gráficos por grupo muscular, tendência de força, PRs, ranking de exercícios favoritos, volume, calorias | charts, PR board, ranking | sem dados, premium lock |
| S16 | Recuperação muscular | home / progresso | mapa do corpo com % recuperado por músculo | body map, legend | tudo recuperado |
| S17 | Histórico | progresso → histórico | sessões passadas por data | calendar/list | vazio |
| S18 | Perfil / ajustes | tab Perfil | sons, local/equipamento, editar plano, modo da agenda, assinatura, unidades | settings list, toggles | default |
| S19 | Cardio | Treinos → cardio | registrar cardio; importar Strava/Health; "adicionar com IA" | form, import | vazio |
| S20 | Identificar equipamento | câmera | IA reconhece o aparelho e sugere exercícios | camera, result sheet | reconhecido / não |

## Flows

```
F01 Novo usuário recebe o plano
    S01 -> S02 (7–9 perguntas) -> S03 -> S04 (pular) -> S05
    happy path clicks: ~12
    edge: sem equipamento, iniciante absoluto, fecha o app no meio do quiz

F02 Treinar o dia
    S05 -> play -> S07 (registrar N séries, descanso automático) -> finalizar -> S10
    happy path clicks: 2 para começar + 1 por série + 2 para terminar
    edge: offline no meio, repetir treino no mesmo dia (substitui se mesmo horário), sair sem finalizar

F03 Trocar exercício
    S05 -> Editar -> S06 -> Substituir -> S08     (ou S07 -> ⋯ -> S08)
    happy path clicks: 3
    edge: nenhum exercício do mesmo músculo com o equipamento disponível

F04 Treino rápido por grupo muscular
    S11 -> escolher músculo -> S07 -> S10
    happy path clicks: 3

F05 Criar rotina própria
    S12 -> nova -> S08 (multi) -> séries/reps -> salvar
    edge: limite do plano free

F06 Ver evolução
    S15 -> exercício -> S09 (gráfico + PR)

F07 Assinar
    recurso premium -> S04 -> compra na loja -> desbloqueado; "Restaurar Compras"
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Option card (quiz) | single, multi, com ícone | default, selected | S02 |
| Week strip | dias 1..N | feito, hoje, pendente, descanso | S05 |
| Streak chip | — | 0, ativo, quebrado | S05 |
| Workout hero card | — | pendente, concluído | S05 |
| Set row | normal, aquecimento, drop | vazio, preenchido, concluído, PR | S07 |
| Rest timer | inline, tela cheia | contando, pausado, fim (som) | S07 |
| Exercise row | plano, sessão | default, substituído | S06, S07, S12 |
| Swap / picker sheet | — | busca, filtro, vazio | S08 |
| Stat tile | número, delta | — | S10, S15 |
| PR badge / toast | — | — | S07, S10, S09 |
| Body map | recuperação, volume | — | S16, S15 |
| Chart | linha (força), barra (volume) | sem dados | S09, S15 |
| Paywall plan card | mensal, anual (destaque) | selecionado | S04 |
| Premium lock | overlay, inline | — | S12, S13, S15 |

## Inferred data model

```
Profile        user_id, gender, experience, current_frequency, goal, location/equipment_profile,
               focus_areas[], days_per_week, sound_enabled, units
               evidence: S02 perguntas (vídeo), S18 ajustes | confidence: high

Plan           user_id, generated_at, split (A/B/C…), schedule_mode (sequência | dias fixos)
PlanDay        plan_id, position (Dia 1..N), name
PlanExercise   plan_day_id, exercise_id, position, target_sets, target_reps, target_weight, rest_seconds
               evidence: FAQ "Dias da Semana", "Editar Treino" | confidence: high

Exercise       id, name, primary_muscle, secondary_muscles[], equipment, video_url, steps[]
               evidence: S14, "busque por músculo, equipamento ou palavra-chave" | confidence: high

Session        user_id, plan_day_id?, routine_id?, started_at, finished_at, duration, calories, kind (plano|rápido|rotina|cardio)
SetLog         session_id, exercise_id, set_index, weight, reps, completed, is_pr
               evidence: S07, S10, FAQ "mesmo horário substitui" | confidence: high

PersonalRecord user_id, exercise_id, metric (peso|1RM|volume), value, set_id, achieved_at
               evidence: "informa se bati um recorde pessoal" | confidence: medium (pode ser derivado, não tabela)

Streak / WeeklyGoal  derivados de Session (1/dia na ofensiva; meta semanal conta >1/dia)
               evidence: FAQ "treinar mais de uma vez por dia" | confidence: high (regras), guess (armazenamento)

Program        id, goal, level, weeks, days → PlanDay-like   evidence: S13 | confidence: medium
Subscription   user_id, store (apple|google|hotmart|web), status, period, renews_at
               evidence: FAQ cancelamento | confidence: high
CardioEntry    user_id, kind, duration, distance, calories, source (manual|strava|health|ia) | confidence: medium
```

Relationships: User 1-1 Profile, User 1-n Plan, Plan 1-n PlanDay 1-n PlanExercise, User 1-n Session 1-n SetLog, Exercise 1-n SetLog, User 1-n Routine (mesmo shape de PlanDay), User 1-1 Subscription.

## O que o Forja já tem (base da réplica)

Mapeado por leitura do código: gerador de plano A/B/C (`@forja/domain/training/plan-generator`), onboarding + `preparando`, rotinas e templates, sessão ao vivo com timer, substituição, PR na sessão e no detalhe, recuperação muscular (`recovery.ts`) no card de hoje, biblioteca com filtro de músculo/equipamento, calendário, detalhe do exercício com gráfico, coach IA (Edge Function). Detalhe por feature em `features.csv` (coluna `clone` = estado atual do Forja).

## Feature matrix

See `features.csv`. Must: 16, should: 12, could: 7, skip: 4.

## Out of scope (cannot or should not be cloned)

- Vídeos de exercício do Befit (conteúdo licenciado/próprio) — usar mídia própria/curada do Forja.
- App Apple Watch e widgets — exige nativo (Swift/Kotlin); fora do Expo atual.
- Integração Apple Health / Strava — possível via APIs oficiais, mas é projeto à parte.
- Base de usuários, avaliações e marca "Befit".

## Size

Screens 20, flows 7, entities 11. Hard parts: (1) sessão ao vivo offline com timer em background/tela bloqueada, (2) assinatura multi-loja (IAP Apple/Google + web) com entitlement único, (3) progressão adaptativa que "aprende" com o histórico. Como o Forja já cobre ~60% do must, o delta é **M** (algumas semanas).
