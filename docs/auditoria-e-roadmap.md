# Auditoria técnica e roadmap — Forja

> Documento de diagnóstico completo do app web (`@forja/web`) e plano de evolução
> para nível comercial/SaaS. Baseado em leitura integral do código-fonte, do
> schema, das migrations e da documentação em `context/`.
>
> Data da auditoria: 2026-07-29 · Escopo: raiz do monorepo (app web) +
> `packages/domain` + `supabase/`.

---

## 0. Sumário executivo

O Forja tem uma **base melhor do que a média** de projetos gerados por IA: o
domínio já está extraído num pacote puro e testado (`@forja/domain`, 31 testes),
o isolamento de dados é feito corretamente no banco via RLS, o design system
usa tokens semânticos em oklch, e a documentação em `context/` é excelente.

O que impede o produto de parecer feito por uma equipe sênior é o **acabamento
da camada de aplicação**: as rotas falam direto com o Supabase sem camada
intermediária, erros de query são engolidos silenciosamente, não existe estado
de carregamento em nenhuma tela, datas são calculadas em UTC num app brasileiro,
e várias funcionalidades prometidas na UI não existem no código.

**Os 6 problemas mais graves encontrados** (todos com evidência de código):

| #   | Problema                                                                        | Onde                                         | Impacto                     |
| --- | ------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------- |
| 1   | "Hoje" é calculado em UTC — depois das 21h (BRT) o app registra no dia seguinte | 7 ocorrências de `toISOString().slice(0,10)` | Dados no dia errado         |
| 2   | Datas exibidas em inglês (`date-fns` sem locale)                                | `diet.tsx`, `workouts.tsx`, `body.tsx`       | "Tuesday, 29 de July"       |
| 3   | "Volume semanal" soma apenas as 5 sessões mais recentes                         | `dashboard.tsx:83`                           | Número errado               |
| 4   | Sugestão de carga sempre sugere aumento                                         | `workouts.session.$id.tsx:238`               | Recomendação inválida       |
| 5   | Erros de query descartados — falha vira "lista vazia"                           | ~20 queries                                  | Usuário não sabe que falhou |
| 6   | Empty state aparece durante o carregamento                                      | Todas as listas                              | Parece que os dados sumiram |

---

## 1. Diagnóstico

### 1.1 Pontos fortes (preservar)

- **`@forja/domain`** — TypeScript estrito, zero `any`, sem dependência de DOM,
  validação Zod nas entradas estruturadas, 31 testes passando. O filtro de
  Kalman para metas adaptativas e a dupla progressão já estão **implementados e
  testados** — só não estão ligados na UI.
- **Segurança de dados no lugar certo** — RLS no Postgres, não na aplicação.
  Três padrões de policy consistentes (dono direto / dono via pai / público-ou-dono).
  Funções sensíveis com `SECURITY DEFINER` + `EXECUTE` revogado de `anon`.
- **Design tokens** — cores em oklch, variáveis semânticas, tema escuro já
  definido em `styles.css`. Nada de cor hardcoded nas rotas.
- **Soft delete consistente** em exercises, foods, templates, sessions, recipes.
- **Roteamento type-safe** file-based com `head:` por rota (títulos e OG tags).
- **Documentação `context/`** — mapa do repositório, schema, RLS, fluxos e
  fórmulas. Raro e valioso.

### 1.2 Correção — bugs confirmados

#### B1. Fuso horário: o app opera em UTC, o usuário vive em BRT

**Evidência:** `new Date().toISOString().slice(0, 10)` em `dashboard.tsx:25`,
`diet.tsx:38`, `body.tsx:33`, `body.tsx:145`, `body.tsx:278`, `recipes.$id.tsx:125`.

**Por que é problema:** `toISOString()` converte para UTC. No Brasil (UTC−3),
das 21:00 às 23:59 o valor retornado já é o dia seguinte. Um jantar registrado
às 22h cai no diário de amanhã; um peso registrado às 21:30 grava na data errada
e, por causa do `UNIQUE(user_id, log_date)`, pode sobrescrever o registro do dia
seguinte.

**Impacto:** Corrompe silenciosamente os dados de 3 módulos (dieta, corpo,
receitas) em ~12% das horas do dia. Alto.
**Solução:** helper `todayLocal()` que formata a data no fuso local
(`format(new Date(), "yyyy-MM-dd")`).
**Alternativa:** guardar `timestamptz` e converter na leitura — muito mais caro,
exige migration e reescrita das queries. Não compensa.
**Prioridade:** P1.

#### B2. Datas em inglês

**Evidência:** `format(new Date(date + "T00:00:00"), "EEEE, dd 'de' MMMM")` em
`diet.tsx:83`; `format(..., "dd 'de' MMMM, HH:mm")` em `workouts.tsx:181`;
`body.tsx:255`. `date-fns` está instalado, mas nunca importa `locale/pt-BR`.

**Por que é problema:** produz `"Tuesday, 29 de July"` — mistura de idiomas
visível na tela principal de dieta. Quebra a percepção de produto acabado.
**Impacto:** Estético, mas em elemento de destaque. Médio-alto.
**Solução:** `import { ptBR } from "date-fns/locale"` + wrapper `formatDate()`
centralizado que já aplica o locale.
**Prioridade:** P1 (custo quase zero).

#### B3. Volume semanal calculado sobre amostra errada

**Evidência:** `dashboard.tsx:43-54` — a query `recent_sessions` tem `.limit(5)`.
`dashboard.tsx:83-85` filtra essas 5 por `started_at >= weekStart` e soma.

**Por que é problema:** quem treina 6× por semana vê o volume de apenas 5
sessões. E se as 5 últimas forem todas da semana passada, o card mostra 0.
**Impacto:** Métrica principal do dashboard mostra número errado. Alto.
**Solução:** query dedicada `["weekly_volume", weekStart]` filtrando por
`started_at >= weekStart` sem limite, agregando só `total_volume_kg`.
**Prioridade:** P1.

#### B4. Sugestão de carga é degenerada

**Evidência:** `workouts.session.$id.tsx:237-238`:

```ts
suggestNextWeight(Number(last.weight_kg), Number(last.reps), Number(last.reps));
```

O 3º parâmetro é `targetReps`. Passar `lastReps` como alvo faz a condição
`lastReps >= targetReps` ser **sempre verdadeira** → a função sempre retorna
+1 incremento, independentemente do desempenho.

**Por que é problema:** a "sugestão inteligente" anunciada na landing page é, na
prática, "sempre adicione 2,5 kg". Recomendação fisiologicamente ruim.
**Impacto:** Funcionalidade de destaque tecnicamente quebrada. Alto.
**Solução:** usar `target_reps` do `workout_template_exercises` quando a sessão
veio de template; caso contrário, migrar para `nextDoubleProgression` do
`@forja/domain`, que já existe, é testado e considera todas as séries de trabalho.
**Prioridade:** P1.

#### B5. Erros de query descartados silenciosamente

**Evidência:** o padrão `const { data } = await supabase...; return data ?? []`
aparece em ~20 queries (`dashboard.tsx:37,50,64`, `diet.tsx:52`, `workouts.tsx:35,48`,
`body.tsx:40,153,286`, `exercises.tsx:28`, `recipes.tsx:33`, e outras).

**Por que é problema:** o objeto `error` é ignorado. Uma falha de rede, um token
expirado ou uma policy RLS bloqueando resultam em `data === null` → `[]` → a UI
mostra o empty state ("Nenhuma receita ainda"). O usuário conclui que perdeu os
dados. `useQuery` nunca entra em estado de erro porque a `queryFn` resolveu com
sucesso.
**Impacto:** Confiança do usuário + suporte impossível de diagnosticar. Alto.
**Solução:** helper `unwrap()` que lança em caso de erro, permitindo que o React
Query faça retry e exponha `isError`.
**Prioridade:** P1.

#### B6. Empty state falso durante carregamento

**Evidência:** `workouts.tsx:122` — `(templates.data ?? []).length === 0` renderiza
"Você ainda não criou templates" **antes** dos dados chegarem. Mesmo padrão em
`recipes.tsx:67`, `diet.tsx:111`, `body.tsx:218`, `exercises.tsx:60`,
`workouts.session.$id.tsx:182`.

**Por que é problema:** em toda navegação o usuário vê por ~300ms uma mensagem
afirmando que não tem dados. É o oposto do feedback correto.
**Impacto:** Percepção de app quebrado/lento. Alto.
**Solução:** componentes `<QueryBoundary>` / `<Skeleton>` que distinguem
`isPending` / `isError` / vazio.
**Prioridade:** P1.

#### B7. `is_pr` nunca é calculado

**Evidência:** a coluna existe, `workouts.session.$id.tsx:373` renderiza o badge,
mas nenhum `update`/`insert` no repositório grava `is_pr: true`.
**Impacto:** funcionalidade morta. Médio.
**Solução:** ao concluir uma série, comparar o e1RM com o melhor e1RM histórico
do exercício; marcar e celebrar.
**Prioridade:** P2.

#### B8. Iniciar treino a partir de template não copia os exercícios

**Evidência:** `workouts.tsx:70-88` — `startFromTemplate` copia só `name` e
grava `template_id`. A sessão nasce vazia.
**Por que é problema:** anula o propósito do template. O usuário monta a rotina
e precisa adicionar tudo manualmente de novo.
**Impacto:** Funcionalidade central inutilizável. Alto.
**Solução:** ler `workout_template_exercises` e inserir os `workout_sets`
correspondentes (`target_sets` linhas por exercício, `completed: false`,
peso/reps pré-preenchidos do histórico).
**Prioridade:** P1 (é o fluxo principal do app).

#### B9. Volume da sessão inclui aquecimento e séries não concluídas

**Evidência:** `workouts.session.$id.tsx:120` soma **todas** as séries; já o
contador do cabeçalho (linha 151) filtra `completed && set_type !== "warmup"`.
**Impacto:** `total_volume_kg` inflado e inconsistente com o que a tela mostra.
Contamina o volume semanal do dashboard. Médio-alto.
**Solução:** aplicar o mesmo filtro nos dois lugares (helper compartilhado).
**Prioridade:** P1.

#### B10. Timer de descanso ignora o descanso configurado e sofre drift

**Evidência:** `workouts.session.$id.tsx:361` — `onCompleted(90)` hardcoded,
descartando `set.rest_seconds` e o `rest_seconds` do template. O timer usa
`setTimeout` recursivo dentro de `useEffect` (linha 137-146).
**Por que é problema:** (a) o valor configurado no template é ignorado;
(b) `setTimeout` acumula drift; (c) navegadores fazem throttling de timers em
abas em background — o timer _para_ quando o usuário sai do app, que é
exatamente o momento em que ele mais precisa dele durante um treino.
**Impacto:** Alto para o caso de uso real (celular no bolso entre séries).
**Solução:** timer baseado em timestamp-alvo (`Date.now() + rest*1000`) com
`requestAnimationFrame`/intervalo de reconciliação, `Notification` + vibração ao
terminar, e persistência em `sessionStorage`.
**Prioridade:** P2.

#### B11. `logToDiary` não invalida o cache do diário

**Evidência:** `recipes.$id.tsx:139` — `onSuccess` só faz `toast.success`.
**Impacto:** ao navegar para `/diet`, o cache serve dados antigos antes do
refetch. Baixo-médio.
**Solução:** invalidar `queryKeys.foodLog(today)` — resolvido de vez com a
factory central de query keys.
**Prioridade:** P1 (vem de graça com a refatoração).

#### B12. Exclusões destrutivas sem confirmação

**Evidência:** `workouts.tsx:189` (excluir treino), `body.tsx:262` e `428`,
`diet.tsx:128`, `recipes.tsx:86`, `recipes.$id.tsx:212`. O componente
`alert-dialog.tsx` existe no projeto e **não é usado em lugar nenhum**.
**Impacto:** um toque acidental apaga um treino inteiro. Alto em mobile.
**Solução:** `<ConfirmButton>` reutilizável com `AlertDialog`; e undo via toast
(`sonner` suporta action) onde o soft delete permite.
**Prioridade:** P1.

#### B13. `<html lang="en">` num app pt-BR

**Evidência:** `__root.tsx:104`. As telas 404 e de erro também estão em inglês
("Page not found", "This page didn't load").
**Impacto:** leitores de tela anunciam em inglês; SEO incorreto. Médio.
**Prioridade:** P1 (trivial).

### 1.3 Arquitetura

| Problema                                             | Evidência                                                                                                  | Impacto                                                                                   | Solução                                                                                |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Sem camada de acesso a dados**                     | Todas as 11 rotas importam `supabase` e montam queries inline                                              | Impossível testar, trocar backend ou aplicar política transversal (retry, log, validação) | `src/data/*.ts` — módulos por domínio expondo funções tipadas; rotas só consomem hooks |
| **Query keys como strings mágicas**                  | 20+ arrays literais espalhados; `padroes.md` já lista isso como risco                                      | Invalidação inconsistente (B11 é sintoma direto)                                          | `src/data/query-keys.ts` — factory tipada e hierárquica                                |
| **Cálculo de macros duplicado 4×**                   | `diet.tsx:65-77`, `dashboard.tsx:69-80`, `recipes.$id.tsx:104-118`, mais o cálculo por item em cada lista  | Divergência já existe: dashboard não faz `Number()` nos campos                            | `nutritionTotals()` em `@forja/domain` (é lógica pura)                                 |
| **`AddFoodDialog` duplicado**                        | `diet.tsx:158` e `recipes.$id.tsx:226` — implementações diferentes, UX diferente                           | Manutenção dobrada, inconsistência visível                                                | Componente único `<FoodPicker>`                                                        |
| **`AddExerciseDialog` duplicado**                    | `workouts.session.$id.tsx:380` e `workouts.templates.$id.tsx:250`                                          | Idem — um tem filtro por músculo, o outro não                                             | `<ExercisePicker>` único                                                               |
| **`user_id` obtido via round-trip em cada mutation** | `supabase.auth.getUser()` em 8 mutations                                                                   | Request HTTP extra por escrita                                                            | Hook `useCurrentUser()` lendo do contexto da rota (`beforeLoad` já retorna `user`)     |
| **Sem testes no app web**                            | 0 arquivos de teste em `src/`                                                                              | Regressões invisíveis                                                                     | Vitest + Testing Library nos helpers e componentes críticos                            |
| **Lint permissivo**                                  | `noUnusedLocals: false`, `@typescript-eslint/no-unused-vars: "off"` → hack `void Component;` em 2 arquivos | Código morto acumula                                                                      | Reativar a regra com `argsIgnorePattern: "^_"` e remover os `void`                     |
| **Sem CI**                                           | Nenhum workflow                                                                                            | Build quebrado chega no Lovable                                                           | GitHub Action: `lint` + `tsc` + `test:domain` + `build`                                |

### 1.4 Performance

| Oportunidade                             | Evidência                                                                | Ganho                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `QueryClient` sem defaults               | `router.tsx:6` — `new QueryClient()` puro                                | `staleTime` 30s + `retry` inteligente + `refetchOnWindowFocus: false` elimina refetch em toda navegação |
| Busca sem debounce                       | `diet.tsx:164` (`["foods", q]`), `exercises.tsx:24`, session e templates | 1 request HTTP por tecla digitada → ~10 requests por busca                                              |
| Sem preload de rotas                     | `router.tsx` não define `defaultPreload`                                 | `defaultPreload: "intent"` carrega a rota no hover                                                      |
| Recharts no bundle inicial               | Importado estaticamente em `dashboard.tsx` e `body.tsx`                  | ~90 kB gzip; `lazy()` no gráfico tira do caminho crítico                                                |
| `exercises` sem paginação                | `limit(300)` e render de 300 Cards                                       | Virtualização ou paginação                                                                              |
| `swapPositions` = 3 requests sequenciais | `workouts.templates.$id.tsx:143-148`                                     | RPC única ou update em lote; enquanto isso, optimistic update                                           |
| Inputs sem optimistic update             | `SetRow` faz `onBlur → update → invalidate → refetch → re-render`        | Durante o treino, cada campo pisca. `onMutate` otimista resolve                                         |
| EMA de 180 dias no client                | `body.tsx:38,64`                                                         | Aceitável hoje; virar view materializada quando passar de ~1000 pontos                                  |

### 1.5 Acessibilidade

- **Botões-ícone sem nome acessível:** `diet.tsx:128`, `body.tsx:262`, `body.tsx:428`,
  `recipes.$id.tsx:212`, `workouts.templates.$id.tsx:208/212/216`. Leitor de tela
  anuncia apenas "botão".
- **Botão de tipo de série** (`workouts.session.$id.tsx:316`) usa `title` mas não
  tem `aria-label` nem comunica o estado atual/próximo.
- **Bottom nav com 6 colunas** (`route.tsx:87`) — em telas de 320px cada alvo tem
  ~53px de largura mas o rótulo de 12px trunca; abaixo do confortável para toque.
- **Sem skip link** e sem landmark `<main>` na landing e na tela de auth.
- **Texto de 10px** (`workouts.session.$id.tsx:371`, `diet.tsx:153`) abaixo do
  mínimo legível.
- **`<img>` sem dimensões** (`body.tsx:392,421`) → layout shift na galeria.
- **Sem `:focus-visible` customizado** — o anel padrão some em fundos escuros.
- **Sem `prefers-reduced-motion`**.

### 1.6 UI / Design System

- **Tema escuro existe mas é inalcançável.** `styles.css:104-141` define a
  paleta `.dark` completa, e **nenhum código adiciona a classe `dark`**. Trabalho
  já feito, desperdiçado. Custo de ligar: baixíssimo. Ganho percebido: alto.
- **Sem skeletons.** `skeleton.tsx` existe e não é usado em nenhuma rota.
- **Barras de progresso sem semântica de estado** — proteína em 40% e em 120% da
  meta usam a mesma cor. Falta o token de excesso/atingido (`--success` existe
  em `styles.css:83` e nunca é usado).
- **Densidade inconsistente:** `PageBody` usa `p-4 md:p-8`, mas cards internos
  variam entre `p-3`, `p-4` e o default do `Card`.
- **Sem microinterações** — nenhum `transition` em cards, nenhuma animação de
  entrada de lista, nenhum feedback tátil ao concluir série.
- **`shadow-soft`** definido e usado só na tela de auth.
- **Gradiente** aplicado inline via `style={{...}}` em 5 lugares em vez de uma
  classe utilitária.

### 1.7 Segurança

| Risco                                 | Avaliação                                                                                                                                              | Ação                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `.env` esteve versionado              | As chaves são _publishable/anon_ — projetadas para exposição no client. Já foi removido do índice e o `.gitignore` está correto. **Risco real: baixo** | Nenhuma ação urgente. Rotacionar se algum dia entrar uma `service_role`                     |
| Sem validação de entrada nas escritas | Peso `-500` kg ou `99999` g são aceitos pelo banco (sem `CHECK` constraints)                                                                           | Schemas Zod nos formulários **+** `CHECK` constraints na migration (defesa em profundidade) |
| Upload de foto sem limite             | `body.tsx:373` só usa `accept="image/*"` (contornável); sem limite de tamanho no client nem no bucket                                                  | Validar MIME + tamanho no client; `file_size_limit`/`allowed_mime_types` no bucket          |
| `beforeLoad` chama `getUser()`        | Round-trip a cada navegação para a área logada                                                                                                         | `getSession()` + `getUser()` só quando necessário                                           |
| Signed URLs de 1h em estado local     | `body.tsx:296` — expiram sem renovação                                                                                                                 | Renovar por TTL                                                                             |
| Papéis `admin` latentes               | `has_role` existe, nenhuma policy usa                                                                                                                  | Documentado. Só implementar quando houver área administrativa real                          |
| Sem cabeçalhos de segurança           | Nenhum CSP/HSTS/X-Frame-Options                                                                                                                        | Configurar no Nitro                                                                         |
| Sem trilha de auditoria               | Nenhuma                                                                                                                                                | P4 — só faz sentido em cenário multiusuário                                                 |

**Nota positiva:** não há injeção de SQL possível (PostgREST parametriza), não há
`dangerouslySetInnerHTML` em nenhum lugar do `src/`, e o modelo de autorização
está correto — RLS no banco em vez de checagem no cliente.

### 1.8 SEO

- Landing (`/`) **não define `head:`** — herda o título genérico do root. Rotas
  internas têm meta tags, mas são as que não precisam (área logada).
- Sem `robots.txt`, sem `sitemap.xml`, sem `canonical`.
- Sem imagem OG real (`twitter:card: summary_large_image` declarado sem `og:image`).
- `lang="en"` (B13).
- Sem dados estruturados JSON-LD.
- A landing tem 1 seção e ~200 palavras — insuficiente para ranquear.

### 1.9 Escalabilidade

- Toda leitura é client-side sem paginação. `exercises` (300), `body_weights`
  (180 dias), `measurements` (180 dias), histórico (30). Funciona com 1 usuário
  e 1 ano de dados; degrada em 3 anos.
- Agregações (volume semanal, totais de macro, EMA) rodam no client sobre listas
  completas. Deveriam virar views/RPC no Postgres conforme o volume crescer.
- Não há cursor-based pagination em nenhum lugar.
- `foods` tem índice GIN full-text no `name` que o app **não usa** (usa `ilike
%termo%`, que não aproveita o índice). Trocar para `textSearch` é ganho direto.

### 1.10 Funcionalidades prometidas e não implementadas

| Promessa                                                                 | Onde é prometida                | Realidade                                                                           |
| ------------------------------------------------------------------------ | ------------------------------- | ----------------------------------------------------------------------------------- |
| "Metas adaptativas: ajustamos automaticamente conforme seu peso semanal" | `profile.tsx:165`               | Nenhum recálculo automático. O Kalman existe em `@forja/domain` mas não está ligado |
| "Código de barras"                                                       | `index.tsx:61`                  | Coluna `barcode` + índice no banco; zero UI                                         |
| "Superséries"                                                            | `index.tsx:60`                  | Coluna `superset_group`; zero UI                                                    |
| "Cargas sugeridas com base no seu histórico"                             | `index.tsx:63`                  | Implementado mas degenerado (B4)                                                    |
| Onboarding                                                               | `profiles.onboarding_completed` | Campo gravado, nunca lido para gatear navegação                                     |
| `unit_system` (métrico/imperial)                                         | Coluna com default              | Sem UI; app assume métrico                                                          |

---

## 2. Roadmap

### Prioridade 1 — Críticas

Corrigem dados errados, funcionalidades quebradas e a fundação sobre a qual todo
o resto se apoia. **Sem dependências externas.**

| Item                                                       | Motivo                                                                            | Impacto    | Dificuldade | Dependências | Estimativa |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------- | ----------- | ------------ | ---------- |
| **1.1 Camada de dados + query keys** (`src/data/`)         | Elimina strings mágicas, centraliza tratamento de erro e desbloqueia todo o resto | Fundação   | Média       | —            | 4h         |
| **1.2 `unwrap()` — erros deixam de ser engolidos** (B5)    | Falha silenciosa é o pior modo de falha                                           | Alto       | Baixa       | 1.1          | 1h         |
| **1.3 Datas locais + locale pt-BR** (B1, B2)               | Dados no dia errado + texto em inglês                                             | Alto       | Baixa       | —            | 2h         |
| **1.4 `QueryBoundary` + skeletons** (B6)                   | Remove o empty state falso de todas as telas                                      | Alto       | Média       | 1.1          | 3h         |
| **1.5 Confirmação em ações destrutivas** (B12)             | Perda de dados por toque acidental                                                | Alto       | Baixa       | —            | 2h         |
| **1.6 Volume semanal correto** (B3)                        | Métrica principal errada                                                          | Alto       | Baixa       | 1.1          | 1h         |
| **1.7 Volume da sessão consistente** (B9)                  | Contamina o dashboard                                                             | Médio-alto | Baixa       | —            | 1h         |
| **1.8 Template → sessão copia exercícios** (B8)            | Fluxo principal inutilizável                                                      | Alto       | Média       | 1.1          | 3h         |
| **1.9 Sugestão de carga via `nextDoubleProgression`** (B4) | Recomendação inválida hoje                                                        | Alto       | Média       | 1.1          | 3h         |
| **1.10 Validação Zod nos formulários + `CHECK` no banco**  | Dados inválidos entram hoje                                                       | Médio-alto | Média       | —            | 4h         |
| **1.11 `lang="pt-BR"` + 404/erro em português** (B13)      | Correção trivial de acabamento                                                    | Médio      | Trivial     | —            | 30min      |
| **1.12 `QueryClient` com defaults + `defaultPreload`**     | Elimina refetch redundante                                                        | Médio      | Trivial     | —            | 30min      |

**Total P1: ~25h**

### Prioridade 2 — Muito importantes

Elevam a percepção de qualidade e completam o que já foi prometido.

| Item                                                                     | Motivo                                                                              | Impacto          | Dificuldade | Dependências   | Estimativa |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ---------------- | ----------- | -------------- | ---------- |
| **2.1 Tema claro/escuro/sistema**                                        | Paleta pronta, inalcançável                                                         | Alto             | Baixa       | —              | 2h         |
| **2.2 Acessibilidade — nomes acessíveis, alvos de toque, focus-visible** | Barreira real de uso                                                                | Alto             | Média       | —              | 4h         |
| **2.3 Componentes únicos `<FoodPicker>` / `<ExercisePicker>`**           | Elimina duplicação e inconsistência                                                 | Médio-alto       | Média       | 1.1            | 4h         |
| **2.4 `nutritionTotals()` no `@forja/domain` + testes**                  | Remove a 4ª duplicação e a divergência de `Number()`                                | Médio-alto       | Baixa       | —              | 2h         |
| **2.5 Timer de descanso robusto** (B10)                                  | Uso real é com o app em background                                                  | Alto             | Média       | —              | 4h         |
| **2.6 Cálculo e celebração de PR** (B7)                                  | Funcionalidade morta; alto valor emocional                                          | Médio-alto       | Média       | 1.1            | 4h         |
| **2.7 Optimistic updates na sessão de treino**                           | Piscar de campos durante o treino                                                   | Alto (percebido) | Média       | 1.1            | 3h         |
| **2.8 Debounce nas buscas + `textSearch` no `foods`**                    | 10 requests por busca                                                               | Médio            | Baixa       | 2.3            | 2h         |
| **2.9 Metas adaptativas ligadas (Kalman)**                               | Promessa explícita na UI; o motor já existe e é testado                             | Alto             | Alta        | 1.1, migration | 8h         |
| **2.10 Onboarding guiado**                                               | `onboarding_completed` existe e não é usado; hoje o usuário cai num dashboard vazio | Alto             | Média       | 1.1            | 6h         |
| **2.11 Estados de erro por rota + retry**                                | Hoje só há error boundary global                                                    | Médio            | Média       | 1.4            | 3h         |
| **2.12 SEO da landing + `robots`/`sitemap`/OG image**                    | Página pública sem `head:`                                                          | Médio            | Baixa       | —              | 3h         |

**Total P2: ~45h**

### Prioridade 3 — Melhorias

Diferenciam o produto.

| Item                                                          | Motivo                                                    | Impacto    | Dificuldade | Dependências | Estimativa |
| ------------------------------------------------------------- | --------------------------------------------------------- | ---------- | ----------- | ------------ | ---------- |
| **3.1 Busca global (⌘K)** — `cmdk` já instalado               | Navegação de produto sênior (Linear/Raycast)              | Alto       | Média       | 1.1          | 5h         |
| **3.2 Histórico por exercício** (rota `exercises.$id`)        | Ver progressão de e1RM/volume de um exercício             | Alto       | Média       | 1.1          | 6h         |
| **3.3 Superséries com drag-and-drop**                         | Coluna existe, sem UI                                     | Médio-alto | Alta        | 1.8          | 8h         |
| **3.4 Copiar dia anterior / refeições favoritas**             | Reduz de 4 cliques para 1 no fluxo mais repetitivo do app | Alto       | Média       | 2.3          | 5h         |
| **3.5 Alimentos personalizados (CRUD)**                       | Hoje só dá para inserir direto no banco                   | Médio-alto | Média       | 2.3          | 4h         |
| **3.6 Código de barras (`@zxing/browser` + Open Food Facts)** | Prometido na landing                                      | Alto       | Alta        | 3.5          | 8h         |
| **3.7 Lazy loading dos gráficos + virtualização**             | Bundle e render                                           | Médio      | Média       | —            | 3h         |
| **3.8 Exportar dados (CSV/JSON)**                             | Confiança e portabilidade; requisito de LGPD              | Médio      | Baixa       | 1.1          | 3h         |
| **3.9 PWA (manifest + service worker)**                       | Instalável no celular — é um app de academia              | Alto       | Média       | —            | 5h         |
| **3.10 Relatórios semanais/mensais**                          | Retenção                                                  | Médio-alto | Alta        | 3.2          | 8h         |
| **3.11 CI (lint + tsc + testes + build)**                     | Prevenção de regressão                                    | Médio      | Baixa       | —            | 2h         |
| **3.12 Testes do app web**                                    | 0 hoje                                                    | Médio-alto | Média       | 1.1          | 8h         |

**Total P3: ~65h**

### Prioridade 4 — Funcionalidades futuras

| Item                                                                                                                            | Motivo                                                                | Estimativa |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------- |
| **4.1 Suporte offline (fila de mutações + IndexedDB)**                                                                          | Academia tem sinal ruim; é o caso de uso principal                    | 15h        |
| **4.2 Notificações push (lembretes de treino/pesagem)**                                                                         | Retenção                                                              | 10h        |
| **4.3 Treinador virtual com IA** — análise de estagnação, ajuste de volume, sugestão de deload a partir dos dados de RPE e e1RM | Diferencial competitivo real; os dados já existem                     | 20h        |
| **4.4 Importação (Strong, Hevy, MyFitnessPal)**                                                                                 | Remove a barreira de migração                                         | 12h        |
| **4.5 Sistema de conquistas/streaks**                                                                                           | Engajamento                                                           | 8h         |
| **4.6 Compartilhamento social de treinos**                                                                                      | Aquisição orgânica                                                    | 10h        |
| **4.7 Modo treinador (multi-atleta)**                                                                                           | Monetização B2B — exige usar os papéis `admin` latentes e revisar RLS | 30h        |
| **4.8 Suporte a unidades imperiais**                                                                                            | Coluna já existe; abre mercado EUA                                    | 6h         |
| **4.9 Trilha de auditoria**                                                                                                     | Só faz sentido com 4.7                                                | 8h         |

---

## 3. Novas funcionalidades propostas (visão de produto)

Além do roadmap acima, propostas que se justificam **por este domínio
específico**, não por lista genérica:

1. **Detecção de estagnação** — o app tem e1RM por série e RPE. Cruzando os dois
   dá para detectar quando um exercício não progride há 3+ sessões _e_ o RPE está
   subindo (sinal de fadiga acumulada) → sugerir deload. Nenhum concorrente
   brasileiro faz isso bem.
2. **Prontidão diária** — combinar volume dos últimos 7 dias, RPE médio e
   tendência de peso num indicador simples de "hoje é dia de puxar ou de segurar".
3. **Balanço de volume por grupo muscular** — `packages/domain` já tem
   `aggregateMuscleVolume` com contribuições parciais por músculo. Um gráfico de
   séries efetivas por grupo na semana, comparado com faixas recomendadas (10-20
   séries), é feature de app premium.
4. **Metas adaptativas com explicação** — o Kalman não deve ser uma caixa preta:
   mostrar "seu TDEE estimado subiu de 2.680 para 2.740 kcal porque você perdeu
   0,3 kg comendo 2.700 kcal/dia". Transparência é o que faz o MacroFactor ser
   respeitado.
5. **Timeline unificada** — hoje treino, dieta e corpo são silos. Uma linha do
   tempo única (treinou · pesou · bateu a meta de proteína) dá senso de progresso.
6. **Modo "treino rápido" de verdade** — botão único que repete o último treino
   do mesmo template com as cargas já progredidas.
7. **Widget de descanso persistente** — barra fixa com o cronômetro visível em
   qualquer rota enquanto a sessão está ativa.

---

## 4. Princípios de execução

Toda alteração deve:

1. **Preservar comportamento** — nenhuma feature existente pode regredir.
2. **Seguir o padrão do projeto** — `PageHeader`/`PageBody`, `@/` para imports,
   tokens CSS em vez de cores, UI em pt-BR e identificadores em inglês.
3. **Manter tipagem estrita** — sem `any`, sem `as never` novo.
4. **Tratar erro explicitamente** — nenhum `catch` vazio, nenhum `error` descartado.
5. **Ser verificável** — `tsc --noEmit`, `eslint` e `test:domain` passando após
   cada etapa.
6. **Não reescrever histórico git** (restrição do Lovable — `AGENTS.md`).

---

## 5. Registro de execução

Preenchido a cada etapa concluída.

| Etapa                                                | Status       | Data       |
| ---------------------------------------------------- | ------------ | ---------- |
| **P1 — Correções críticas e fundação**               | ✅ concluída | 2026-07-29 |
| **P2 parte 1** — tema, a11y, pickers, timer, PR, SEO | ✅ concluída | 2026-07-29 |
| **P2 parte 2** — metas adaptativas, onboarding       | ✅ concluída | 2026-07-29 |
| **P3 — Diferenciais** (parcial, ver abaixo)          | 🟡 em parte  | 2026-07-29 |

### Etapa 1 — P1 completa + parte de P2 (2026-07-29)

**Verificação:** `tsc --noEmit` limpo · `eslint` sem erros (restam apenas avisos
de `react-refresh` já existentes) · 50 testes passando (eram 31) · `vite build` OK.

#### Bugs corrigidos

| ID  | Correção                                                    | Onde                                               |
| --- | ----------------------------------------------------------- | -------------------------------------------------- |
| B1  | Datas de registro passam a ser **locais**, não UTC          | `src/lib/date.ts` + 6 rotas                        |
| B2  | Todo texto de data em **pt-BR** (`date-fns/locale`)         | `src/lib/date.ts`                                  |
| B3  | Volume semanal com consulta própria, sem `limit(5)`         | `dashboard.tsx`                                    |
| B4  | Sugestão de carga via `nextDoubleProgression`               | `workouts.session.$id.tsx`                         |
| B5  | `unwrap`/`unwrapList` — erros deixam de ser engolidos       | `src/data/supabase-helpers.ts`                     |
| B6  | `QueryBoundary` + skeletons: fim do empty state falso       | `src/components/query-boundary.tsx`                |
| B7  | `is_pr` calculado e celebrado ao concluir a série           | `workouts.session.$id.tsx`, `src/data/workouts.ts` |
| B8  | Template → sessão **copia os exercícios**                   | `src/data/workouts.ts`                             |
| B9  | Volume da sessão exclui aquecimento e séries não concluídas | `@forja/domain` (`sessionVolume`)                  |
| B10 | Cronômetro por timestamp, sobrevive ao background           | `src/hooks/use-rest-timer.ts`                      |
| B11 | Receita lançada no diário invalida o cache do diário        | `recipes.$id.tsx`                                  |
| B12 | Confirmação + desfazer em todas as exclusões                | `src/components/confirm-button.tsx`                |
| B13 | `lang="pt-BR"`, telas de 404 e erro em português            | `__root.tsx`                                       |

#### Arquitetura

- `src/data/query-keys.ts` — factory hierárquica de chaves (substitui 20+ strings mágicas).
- `src/data/supabase-helpers.ts` — `unwrap*`, `assertOk`, `num`, `DataError` com
  mensagens do Postgres traduzidas.
- `src/data/workouts.ts` — operações compostas do módulo de treino.
- `@forja/domain`: `nutrition/totals` (elimina a 4ª duplicação do cálculo de
  macros, 15 testes) e `training/volume` (`sessionVolume`, `countWorkingSets`, 4 testes).
- `src/components/pickers/*` — `<FoodPicker>` e `<ExercisePicker>` únicos
  (eram 4 diálogos duplicados com comportamentos divergentes).
- `src/lib/labels.ts` — enums do banco traduzidos (a UI exibia `chest`, `barbell`).
- `useCurrentUser()` — remove o `auth.getUser()` de cada mutação.

#### UX/UI

- Tema claro/escuro/sistema com script anti-flash (`theme-provider.tsx`).
- Skeletons e estados de erro com retry em todas as telas.
- Navegação por data no diário (setas, com limite em hoje).
- Barras de macro sinalizam excesso; `role="progressbar"` com valores.
- Cabeçalho mobile com tema e sair; bottom nav com alvos maiores e safe-area do iOS.
- Empty states com ação sugerida em vez de frase seca.

#### Acessibilidade

- `aria-label` em todos os botões-ícone; `aria-current` na navegação.
- Skip link e landmark `<main>`.
- `aria-invalid`/`aria-describedby` nos campos validados.
- `<img>` com `width`/`height` e `alt` descritivo (fim do layout shift).

#### Segurança e integridade

- Migration `20260729120000_add_data_integrity_constraints.sql` — `CHECK`
  constraints em 11 tabelas, aplicadas como `NOT VALID` com validação tolerante
  do histórico.
- Validação Zod no perfil (altura, data de nascimento, idade plausível).
- Upload de foto valida MIME e tamanho; remove o arquivo se os metadados falharem.
- URLs assinadas renovadas a cada 50 min.
- `beforeLoad` evita round-trip quando não há sessão.

#### Performance

- `QueryClient` com `staleTime`, `gcTime` e `retry` seletivo por código de erro.
- `defaultPreload: "intent"`.
- Debounce de 300 ms em todas as buscas (era 1 requisição por tecla).
- Optimistic updates na sessão de treino e na reordenação de templates.
- Histórico dos exercícios do template em **uma** consulta (era 1 por exercício).

#### Riscos conhecidos

- A migration ainda **não foi aplicada** ao banco remoto — requer
  `npx supabase db push`. Até lá, as `CHECK` constraints não estão valendo.
- `startSessionFromTemplate` cria mais linhas em `workout_sets` do que antes
  (`target_sets` por exercício). É o comportamento correto, mas sessões iniciadas
  de templates grandes fazem um insert maior.
- O tema escuro nunca esteve ativo: componentes podem ter contrastes não testados
  nesse modo. Vale uma passada visual.

### Etapa 2 — P2 parte 2 (2026-07-29)

**Verificação:** `tsc --noEmit` limpo · 50 testes passando · `vite build` OK.

#### 2.9 Metas adaptativas ligadas (filtro de Kalman)

O `@forja/domain` já tinha o filtro implementado e testado; ele nunca havia sido
conectado a dado nenhum. Agora está.

**Arquivos:** `src/data/adaptive-goals.ts`, `src/components/adaptive-goals-card.tsx`,
`profile.tsx`.

**Como funciona.** Monta uma série diária contínua dos últimos 60 dias cruzando
`body_weights` (observação ruidosa do peso) com os totais de `food_log_entries`
(entrada de controle). O filtro separa o peso real da flutuação e **infere o
TDEE a partir de como o peso respondeu ao que foi comido** — em vez de confiar no
fator de atividade que o próprio usuário declarou, que é um chute com margem de
centenas de kcal.

**Decisões de projeto:**

- **Não grava sozinho.** A estimativa é exibida com a explicação de como foi
  obtida (quantas pesagens, quantos dias de diário, média de consumo, ritmo
  observado) e um botão para aplicar. Uma caixa-preta que muda a meta calórica
  sem avisar destrói a confiança no número — é o que separa o MacroFactor dos
  concorrentes.
- **Recusa-se a estimar com dados insuficientes** (mínimo de 8 pesagens, 10 dias
  de diário e 14 dias de histórico). Mostra o que falta em vez de um número ruim
  com aparência de precisão.
- **Expõe a confiança** derivada da variância do filtro (±60 kcal → alta;
  ±150 → média; acima → baixa).
- Dias com menos de 500 kcal registradas são tratados como esquecimento, não
  jejum: contá-los enviesaria o TDEE para baixo.
- A incerteza inicial do TDEE é alta de propósito (σ² = 250.000), para que o
  palpite da fórmula não domine os dados reais.

#### 2.10 Onboarding guiado

**Arquivo:** `src/components/onboarding-checklist.tsx` (exibido no topo do dashboard).

`profiles.onboarding_completed` era gravado e **nunca lido** — não existia
onboarding. Um usuário novo caía num dashboard com quatro cards zerados e nenhuma
indicação do que fazer; pior, o cálculo de metas depende de um peso registrado em
outra tela, dependência que nada comunicava.

- Checklist de 4 passos com barra de progresso e destaque no próximo passo.
- Estado derivado dos **dados reais** (contagens via `head: true`), não de um
  flag: quem já registrou peso vê o passo concluído.
- **Dispensável**, não obrigatório — o usuário mantém liberdade de explorar.
  Some sozinho quando os 4 passos estão completos.
- Falha da consulta não bloqueia o dashboard (é auxílio, não conteúdo essencial).

### Etapa 3 — P3 parcial (2026-07-29)

**Verificação:** `npm run verify` verde (typecheck + 36 testes web + 50 testes de
domínio + build).

#### Entregue

| Item                              | Arquivo                                          | Nota                                                                                                                                  |
| --------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| **3.1 Busca global ⌘K**           | `src/components/command-palette.tsx`             | `cmdk` já era dependência e nunca fora usado. Ações, navegação e busca ao vivo em exercícios/alimentos/receitas/treinos, com debounce |
| **3.2 Histórico por exercício**   | `src/routes/_authenticated/exercises.$id.tsx`    | Progressão de e1RM, volume por sessão, recorde, evolução percentual e seletor de período                                              |
| **3.4 Copiar dia anterior**       | `diet.tsx`                                       | O fluxo mais repetitivo do app passou de ~4 toques por alimento para um clique. O botão vira primário quando o dia está vazio         |
| **3.7 Lazy loading dos gráficos** | `src/components/charts/*`                        | O chunk do Recharts (361 kB) saiu do caminho crítico: o chunk do dashboard caiu para 12 kB                                            |
| **3.8 Exportação de dados**       | `src/data/export.ts`, `export-data-card.tsx`     | JSON e CSV; portabilidade LGPD e backup manual                                                                                        |
| **3.9 PWA**                       | `public/manifest.webmanifest`, `public/icon.svg` | Instalável, com atalhos para treino/dieta/peso e ícone SVG próprio                                                                    |
| **3.11 CI**                       | `.github/workflows/ci.yml`                       | Typecheck, testes, build e verificação de `routeTree.gen.ts` desatualizado                                                            |
| **3.12 Testes do app web**        | `vitest.config.ts` + 3 suítes                    | 36 testes cobrindo datas (fuso e locale), CSV e rótulos — exatamente onde nasceram os bugs mais caros                                 |

Scripts novos em `package.json`: `typecheck`, `test`, `test:watch`, `test:all`,
`verify`.

#### Não entregue (e por quê)

| Item                                     | Motivo                                                   |
| ---------------------------------------- | -------------------------------------------------------- |
| **3.3 Superséries com drag-and-drop**    | Exige `@dnd-kit`; ver bloqueio de instalação abaixo      |
| **3.6 Código de barras**                 | Exige `@zxing/browser`; mesmo bloqueio                   |
| **3.5 CRUD de alimentos personalizados** | Sem bloqueio técnico — ficou fora por escopo desta etapa |
| **3.10 Relatórios semanais/mensais**     | Depende de agregação no banco para escalar bem           |

#### ⚠️ Bloqueio: instalação de novas dependências

`npm install` **falha na raiz** por conflito de peer dependencies pré-existente
no workspace `apps/mobile`:

```
peer react-native@"*" from @powersync/react-native@2.0.0
```

Isso impede adicionar qualquer dependência nova sem `--legacy-peer-deps` (por
isso o CI usa essa flag). O `vitest` só pôde ser configurado porque já estava
hoisted em `node_modules` pelo workspace `@forja/domain`.

**Recomendação:** alinhar as versões de `react-native` / `@powersync/react-native`
em `apps/mobile`, ou remover o workspace mobile da raiz enquanto ele não estiver
em desenvolvimento ativo. Enquanto isso não for feito, os itens 3.3 e 3.6
permanecem bloqueados.

#### Riscos desta etapa

- O ícone do PWA é **SVG**. Chrome e Edge instalam normalmente; o Safari/iOS não
  usa SVG em `apple-touch-icon` e cairá no favicon. Gerar PNGs de 192/512 px
  resolveria — não foi feito por não haver ferramenta de imagem disponível aqui.
- O CI referencia os secrets `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`;
  sem configurá-los no GitHub, o passo de build falha.
- `exercises.$id.tsx` importa o Recharts diretamente (não via lazy). Como é um
  chunk de rota, só é baixado ao visitar a tela — aceitável.

### Etapa 4 — Destravamento de dependências + superséries (2026-07-29)

**Verificação:** `npm run verify` verde · `npm install` sem `ERESOLVE` · `npm ci`
limpo no CI (a flag `--legacy-peer-deps` foi removida).

#### A causa real do bloqueio

O diagnóstico anterior atribuía o conflito ao PowerSync. Estava errado — ele só
aparecia no rastro do npm. A causa era:

```
apps/mobile pinava   react@19.2.0
react-native@0.86.0  exige  peer react@^19.2.3
```

`19.2.0` não satisfaz `^19.2.3`, e isso derrubava a resolução do workspace
inteiro, impedindo qualquer `npm install` na raiz.

**Correção:** `apps/mobile/package.json` passou de `"react": "19.2.0"` para
`"react": "^19.2.3"`. Optou-se por um _range_ em vez de versão exata para que o
npm consiga hoistar **uma única cópia** do React (19.2.8) satisfazendo a raiz
(`^19.2.0`), o mobile (`^19.2.3`) e o React Native. Confirmado: não há cópia
aninhada em `apps/mobile/node_modules/react`.

#### Superséries (item 3.3 do roadmap, antes bloqueado)

**Migration:** `20260729140000_add_superset_group_to_workout_sets.sql` —
`workout_template_exercises.superset_group` já existia, mas `workout_sets` (onde
o treino de fato acontece) não tinha equivalente, então qualquer agrupamento se
perdia ao iniciar a sessão.

**Entregue em `workouts.session.$id.tsx`:**

- **Reordenar exercícios arrastando** (`@dnd-kit`) — antes **não havia forma
  alguma** de mudar a ordem: quem adicionasse na sequência errada tinha de
  apagar e recriar. Como `position` não tem restrição de unicidade em
  `workout_sets` (ao contrário dos templates), a faixa inteira é reatribuída de
  uma vez, sem o artifício do valor temporário. Atualização otimista.
- **Agrupar/desagrupar em supersérie** pelo botão entre dois blocos, com marca
  visual conectando os cards e suporte a grupos de três ou mais.
- **Descanso ciente da supersérie:** entre exercícios do mesmo grupo o timer usa
  15s de transição em vez do descanso completo — é o comportamento correto, já
  que não se descansa entre os pares de uma supersérie.
- `startSessionFromTemplate` passou a **preservar o `superset_group`** do template.
- Sensor de ponteiro com 8px de tolerância, para o arraste não competir com o
  scroll no celular; navegação por teclado incluída.

#### ⚠️ Dependência de migration

A UI de supersérie **escreve numa coluna que ainda não existe no banco**.
Enquanto `npx supabase db push` não for executado, agrupar exercícios falha com
erro (visível em toast). O restante da tela — inclusive o reordenar por arraste —
funciona normalmente, porque depende só de `position`.

Há **três migrations pendentes de aplicação**:

1. `20260728000000_create_progress_photos_bucket.sql`
2. `20260729120000_add_data_integrity_constraints.sql`
3. `20260729140000_add_superset_group_to_workout_sets.sql`

Após aplicá-las, regenerar os tipos:

```sh
npx supabase gen types typescript --linked > src/integrations/supabase/types.ts
```

Isso permite remover os três casts pontuais marcados no código
(`workouts.session.$id.tsx` × 2 e `data/workouts.ts` × 1).

#### Ainda em aberto

- **3.6 Código de barras** — agora _desbloqueado_ (dá para instalar
  `@zxing/browser`), mas não implementado nesta etapa.
- `apps/mobile` ainda declara várias dependências como `"*"`, que resolvem para
  a versão mais recente e podem divergir do Expo SDK 57. O próprio arquivo
  recomenda `cd apps/mobile && npx expo install --fix` — vale rodar antes de
  retomar o app mobile.

### Etapa 5 — Plano de treino gerado automaticamente (2026-07-29)

Pedido: que a parte de treino funcione como o **Befit** (appbefit.com) — app
brasileiro cujo diferencial é montar a ficha sozinho a partir de poucas
respostas. Estilo: inspirado, mantendo a identidade do Forja.

**Verificação:** `npm run verify` verde · 106 testes (36 web + 70 domínio) ·
`eslint` sem erros.

#### Comparativo que orientou o escopo

| Befit                                                          | Forja antes            | Agora                          |
| -------------------------------------------------------------- | ---------------------- | ------------------------------ |
| Plano gerado a partir de nível/objetivo/equipamento/frequência | templates 100% manuais | ✅ assistente de 4 passos      |
| Divisão A/B/C com sequência própria                            | não existia            | ✅ rotina com "próximo treino" |
| Progressão de carga que aprende                                | ✅ dupla progressão    | ✅ mantida                     |
| Descanso editável                                              | ✅                     | ✅                             |
| Substituir exercício na sessão                                 | ❌                     | ❌ ainda pendente              |
| Análise de recuperação muscular                                | ❌                     | ❌ ainda pendente              |
| Vídeos dos exercícios                                          | ❌                     | ❌ ainda pendente              |

#### `@forja/domain` — `training/plan-generator` (20 testes)

O gerador devolve **vagas** (`ExerciseSlot`: músculo + padrão de movimento +
séries + faixa de reps + descanso), não exercícios concretos. O domínio segue
puro; casar vaga↔exercício é responsabilidade da camada de dados, que conhece o
catálogo. Isso mantém as regras de programação testáveis e permite trocar a
seleção de exercícios sem tocar nelas.

Regras: **nível** define o volume semanal alvo (8/12/16 séries diretas),
**objetivo** define reps e descanso (força 4–6/180s · hipertrofia 8–12/120s ·
resistência 12–20/60s), **equipamento** substitui padrões inviáveis por
alternativas (sem barra, levantamento terra vira unilateral) e **frequência**
escolhe a divisão (2d corpo inteiro · 3d PPL · 4d superior/inferior · 5–6d
divisões maiores).

**Dois erros meus, corrigidos durante a implementação:**

1. A primeira versão distribuía o alvo por _músculo do enum_, mas validava por
   _grupo_ — as sessões saíam com 30+ séries. Alinhar a distribuição ao grupo
   trouxe para 15–25, faixa realista.
2. As divisões iniciais tinham 4–5 vagas; como há teto de séries por vaga, o
   volume semanal ficava sistematicamente abaixo do produtivo e o próprio
   validador acusava o plano padrão do app. As divisões passaram a 5–7 vagas,
   com dois movimentos para os grupos grandes.

`findVolumeOutliers` valida por grupo muscular (peito, costas, ombros,
quadríceps, posteriores) e não por valor do enum: uma remada estimula `back`,
`lats` e `traps` ao mesmo tempo, e avaliá-los isoladamente gerava alertas falsos.
Braços, panturrilhas e core ficam de fora por receberem muito volume indireto.

#### Schema — `20260729160000_add_workout_routines.sql`

`workout_routines` (nível, objetivo, equipamento, frequência, `current_index`,
`is_active`) + `routine_id`/`routine_order`/`routine_letter` em
`workout_templates` + `target_rep_min`/`target_rep_max` nos itens. Índice único
parcial garante **uma rotina ativa por usuário** no banco, e não por convenção
da aplicação. Templates avulsos seguem funcionando (`routine_id NULL`).

#### Aplicação

- `src/data/routines.ts` — casa cada vaga com um exercício real por pontuação
  (músculo exato > padrão reconhecido no nome > equipamento preferido > ainda
  não usado na rotina), monta a prévia sem gravar e depois materializa rotina +
  templates, desfazendo tudo se algo falhar no meio.
- `workouts.routines.new.tsx` — assistente de 4 passos com prévia completa da
  ficha, volume semanal por grupo e avisos antes de confirmar.
- `active-routine-card.tsx` — o card responde "o que eu treino hoje?": destaca a
  próxima divisão com botão grande e mostra a sequência.
- A sequência avança ao **finalizar** o treino (não ao iniciar) e independe do
  calendário — quem pula uma semana retoma onde parou. Falha ao avançar não
  invalida o treino registrado.

#### ⚠️ `src/data/pending-schema.ts`

Ponto **único** de escape de tipagem, criado porque `types.ts` é gerado do schema
e as migrations novas ainda não foram aplicadas. A alternativa seria espalhar
`as never` por dezenas de chamadas, apagando a tipagem em cada uma e tornando
impossível rastrear o que ainda falta. O arquivo documenta como removê-lo.

**Quatro migrations pendentes** (`npx supabase db push` + regenerar `types.ts`):

1. `20260728000000_create_progress_photos_bucket`
2. `20260729120000_add_data_integrity_constraints`
3. `20260729140000_add_superset_group_to_workout_sets`
4. `20260729160000_add_workout_routines`

Até lá, **o assistente de plano e as superséries falham ao gravar** (erro visível
em toast). O restante do app funciona normalmente.

#### Ainda faltando para paridade com o Befit

- **Substituir exercício** na sessão por outro do mesmo grupo muscular.
- **Análise de recuperação muscular** — o `aggregateMuscleVolume` do domínio já
  fornece a base; falta cruzar com os dias desde o último estímulo.
- **Vídeos/demonstrações** dos exercícios (o catálogo tem 66 itens sem mídia;
  o Befit tem 300+ com vídeo).

### Etapa 6 — Paridade final com o Befit (2026-07-29)

**Verificação:** `npm run verify` verde · **125 testes** (36 web + 89 domínio) ·
`eslint` sem erros.

#### Recuperação muscular

`packages/domain/src/training/recovery.ts` (19 testes) + `src/data/recovery.ts`

- `src/components/recovery-panel.tsx`, exibido em `/workouts`.

Modelo: `horasNecessárias = 24 + 4 × sériesEfetivas` (teto de 96h);
`recuperação = min(1, horasDesdeOTreino / horasNecessárias)`. Deliberadamente
simples e explicável — recuperação real depende de sono, calorias e idade, que o
app não mede, e a UI declara isso em vez de vender o número como verdade.

Decisões que mudam o resultado:

- Conta a partir do **fim** da sessão, não do início.
- Usa só o **estímulo mais recente** de cada músculo: somar sessões antigas
  superestimaria a fadiga.
- Músculos secundários pesam **meia série** (o supino fatiga o tríceps, mas menos
  que o peito).
- Músculo sem estímulo na janela **não aparece** no painel — "não treinado" é
  diferente de "100% recuperado", e inventar o valor seria informação falsa.

`rankSplitsByRecovery` cruza isso com as divisões da rotina e destaca **o melhor
treino para hoje**, listando o que ainda está em recuperação.

#### Substituir exercício

`src/components/pickers/substitute-exercise-dialog.tsx`, ligado à sessão ao vivo.
Filtra alternativas pelo mesmo músculo primário e ordena por proximidade de
equipamento. A troca **preserva séries, peso, reps e RPE já registrados** — quem
fez 3 séries de supino e achou o banco ocupado não perde o que registrou.

#### Demonstrações dos exercícios

Migration `20260729180000_add_exercise_media.sql` adiciona `video_url`,
`image_url` e `cues` a `exercises`, com `CHECK` que só aceita `http(s)` — um
`javascript:` não chega a virar `href`.

Como não há conteúdo curado nem licenciado, a UI **cai numa busca por vídeo pelo
nome do exercício** em vez de embutir material de terceiros ou fingir biblioteca
própria. Quando `video_url` for povoado, o player embutido entra automaticamente,
restrito a origens conhecidas (YouTube via `youtube-nocookie`, Vimeo).

Esta é a única lacuna que **não se fecha com código**: o Befit tem 300+ vídeos
próprios; fechar de verdade exige produzir ou licenciar o material.

---

### Etapa 7 — Destravamento e sincronia com o banco (2026-07-31)

**Estado resolvido:** as 7 migrations estão **aplicadas** no projeto
`nursxzqagxmeiucsaqzm`, os tipos foram regenerados e a camada de escape saiu.

#### Um erro meu que quebrou o build

As etapas anteriores instruíam a regenerar os tipos com
`--project-id afknyturqrjitorzbwtx` — ref copiado desta própria documentação,
que estava desatualizada desde a migração para outro projeto Supabase. O ref
correto é `nursxzqagxmeiucsaqzm`.

O `>` do shell **trunca o arquivo antes** de o comando executar. Com o ref
errado, o comando falhou e `src/integrations/supabase/types.ts` ficou com
**0 bytes** — 5 erros de TypeScript e build quebrado (`File ... is not a module`).

Correções aplicadas:

- `types.ts` regenerado com `--linked` (lê o `config.toml`, não há ref para errar).
- Ref corrigido em `setup.md`, `stack.md`, `migrations.md` e neste documento.
- `migrations.md` ganhou o alerta sobre a armadilha do `>` e a variante segura
  com arquivo temporário + `mv`.

#### Camada de escape removida

Com os tipos corretos, `src/data/pending-schema.ts` perdeu a razão de existir e
foi apagado. Saíram junto todos os casts que dependiam dele: `dbUntyped` (9
ocorrências em `routines.ts`), os casts de linha que o TypeScript agora infere,
`rows as never` em `workouts.ts` e `as unknown as` / `changes as never` /
`superset_group ... as never` na sessão.

Restam apenas `as never` de narrowing de enum (`.eq("primary_muscle", muscle)`),
que são pré-existentes e legítimos.

**Verificação:** `npm run verify` verde — typecheck limpo, 125 testes, build OK.

---

## 6. Pendências que dependem de você

Nada bloqueia o uso do app. O que resta é opcional:

1. **Secrets do CI** (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) —
   sem eles o passo de build do GitHub Actions falha.

2. **PNGs 192/512 do ícone**, se quiser instalação de PWA no iOS (hoje é SVG,
   que o Safari ignora em `apple-touch-icon`).

3. **`cd apps/mobile && npx expo install --fix`** antes de retomar o app mobile —
   várias dependências estão como `"*"` e podem divergir do Expo SDK 57.
