# Componentes novos — paridade Befit

Tokens: **os do Forja** (`apps/web/src/styles.css`, oklch, claro/escuro). Nada do Befit entra: nem cor de marca, nem ícones, nem textos. Ícones: Lucide (já instalado). Base: shadcn/Radix (já instalado). Todo texto abaixo é do Forja.

Componentes que já existem e são reaproveitados: Button, Card, Badge, Progress, Sheet/Drawer, Dialog, Tabs, Chip group, Sonner (toast), BodyMap, charts.

```
StatTile                                  (novo — components/workouts/stat-tile.tsx)
  variants  default, highlight (PR)
  anatomy   rótulo (text-xs muted-foreground) / valor (text-2xl 700, tabular-nums) / delta opcional
  states    com valor, sem dado ("—"), delta positivo (success), delta negativo (muted, nunca vermelho: menos volume não é erro)
  tokens    bg card, border border, radius lg, highlight = bg primary-soft text primary-soft-foreground
  a11y      <div role="group" aria-label="{rótulo}: {valor}">; delta com texto, não só cor
  used on   S10 resumo, S15 progresso
```

```
StreakChip                                (novo — components/home/streak-card.tsx)
  anatomy   ícone Flame (Lucide) + "N dias seguidos"
  states    0 ("Comece sua sequência hoje"), ativo, treinou hoje (ícone preenchido), quebrado ontem (volta a 0 sem drama)
  tokens    bg warning-soft text warning-foreground quando ativo; muted quando 0
  a11y      texto completo legível, ícone aria-hidden
  used on   S05 home
```

```
WeeklyGoalRing                            (novo — mesmo arquivo do StreakChip)
  anatomy   barra/anel "X de Y treinos na semana" + pontinhos seg..dom
  states    0/Y, parcial, atingida (success), passou da meta (mostra X/Y, X>Y)
  tokens    Progress do shadcn; dia com treino = bg primary; hoje = ring
  a11y      <progress> nativo via Progress (Radix) com aria-valuetext "X de Y treinos"
  used on   S05 home
```

```
PrBadge                                   (novo — Badge variant)
  anatomy   ícone Trophy + "Recorde"
  tokens    bg primary-soft text primary-soft-foreground
  a11y      texto, não só ícone
  used on   S07 sessão (já existe toast), S10 resumo, S15 painel
```

```
SessionSummary                            (novo — tela S10)
  anatomy   título + data; grid 2x2 de StatTile (duração, volume, séries, recordes); lista por exercício (melhor série, delta vs. última vez, PrBadge)
  states    loading (Skeleton), sem séries concluídas ("Nenhuma série concluída"), com PRs, erro (QueryBoundary existente)
  a11y      h1 da página; lista semântica <ul>
  used on   S10
```

```
PrBoard                                   (novo — S15)
  anatomy   lista de exercícios com o recorde (peso × reps, 1RM estimado, data)
  states    vazio ("Seus recordes aparecem aqui depois do primeiro treino"), cheio, loading, erro
  used on   S15 / exercises
```

```
ProgramCard                               (novo — S13)
  anatomy   nome, objetivo, nível, dias/semana, duração em semanas, CTA "Começar"
  states    default, ativo (rotina atual), bloqueado premium (Lock + "Premium"), loading ao iniciar
  a11y      card inteiro não é botão; CTA é <button>
  used on   S13
```

Skipped: `tokens.json`/`tokens.css`/contraste — os tokens do Forja não mudam (o `/replica-brand` decide se muda). Rota `/design` isolada — os componentes são poucos e entram direto nas telas.
