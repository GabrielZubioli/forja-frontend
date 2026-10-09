# Marca

## O nome atual: Forja — **risco alto, decisão sua**

Triagem feita em 09/10/2026 (busca web, não é parecer jurídico):

| achado | onde | por que importa |
| --- | --- | --- |
| App "FORJA": "personalized workout plans, individualized nutrition guides, daily logging" | Google Play `com.seasondiversity.FORJA` | mesmo nome, mesma categoria, mesma proposta (treino + dieta) |
| "FORJA — Treino e dieta sob medida" | forjahub.app | mesmo nome e posicionamento, no Brasil |
| "Um Forja Academia" | App Store id6757489027 / Play `br.com.w12.umforjaacademia` | app de rede de academias com "Forja" no nome |
| "Conceito Forja — app para academias com treino por IA" | tatica.digital (portfólio) | projeto conceito com o mesmo nome |

Antes de publicar nas lojas com "Forja": busca no **INPI** (classes 9, 41 e 42), na loja com o nome exato e consulta com advogado de marcas. Se o INPI mostrar registro de terceiro em classe 9/42, trocar de nome **antes** do lançamento é muito mais barato que depois.

## Alternativas (se trocar)

Ângulo (de `fixes.md`): diário de treino grátis e para sempre, histórico que não se perde, treino + dieta num lugar. Candidatos curtos, sem relação com "Befit" em som ou sentido:

| nome | estilo | ideia | INPI | domínio .com.br / .app | lojas | handles |
| --- | --- | --- | --- | --- | --- | --- |
| Têmpera | metáfora | o aço fica forte depois do calor — mantém o imaginário de "forja" | a rodar | a rodar | a rodar | a rodar |
| Bigorna | metáfora | onde se bate o ferro todo dia; constância | a rodar | a rodar | a rodar | a rodar |
| Repforte | composto | repetição + forte; fácil de soletrar | a rodar | a rodar | a rodar | a rodar |
| Ferrolog | composto | diário (log) do ferro; diz o que faz | a rodar | a rodar | a rodar | a rodar |
| Constante | descritivo | a promessa: constância, histórico que não some | a rodar | a rodar | a rodar | a rodar |

Nenhuma checagem acima foi feita — "a rodar" é literal.

## Paleta e logo

Tokens do Forja ficam como estão (verde oklch, claro/escuro, já com contraste revisado no design system). A cor de marca do Befit não foi medida (não salvamos telas dele); se a marca mudar, conferir que o primário novo não é da mesma família do Befit.

Brief de logo (se trocar o nome): marca símbolo + wordmark; precisa funcionar a 16 px e como ícone 1024 px sem transparência (iOS); entregar SVG, ícone 1024, favicons, imagem social 1200×630; nada de haltere estilizado genérico nem formas que lembrem o logo do Befit ou do openGym.

## Voz

Direto (não seco), encorajador (não animador de torcida), honesto (não alarmista).

| faz | não faz |
| --- | --- |
| "Treino salvo." | "Parabéns, guerreiro!!! 💪🔥" |
| "Descansar está no plano." | "Você quebrou sua sequência!" |
| "Não deu para salvar. Tente de novo." | "Ops! Algo deu errado :(" |
| "Gasto estimado ~280 kcal" | "Você queimou 280 kcal!" |
| "Excluir a conta para sempre?" | "Tem certeza que quer nos deixar? 😢" |

As strings novas deste trabalho (descanso, ofensiva, recordes, programas, exclusão, importação) já seguem essa voz.

## Varredura

`git grep -i` por `befit`, `be fit`, `appbefit`, `3apps`, `opengym` nos dois repositórios, fora de `replica/`, em 09/10/2026:

- código e textos do app: **limpo**;
- `docs/auditoria-e-roadmap.md` (documentação interna antiga) cita o Befit como referência — não vai para o usuário;
- migration renomeada de `…_befit_parity.sql` para `…_subscriptions.sql`;
- **risco de licença pré-existente**: `forja-backend/scripts/catalog/*gymvisual*` e os scripts `catalog:gymvisual`/`catalog:media` montam catálogo com mídia da Gym visual, cuja licença proíbe reuso por terceiros (a migration `revert_gymvisual_media` já tirou a mídia do banco). Recomendo remover esses scripts para ninguém reintroduzir por engano.
