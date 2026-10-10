# O que os usuários do Befit reclamam — e o que o Forja faz com isso

**Amostra:** 597 avaliações da App Store via feed oficial da Apple (450 do Brasil, out/2025–out/2026; 147 dos EUA, abr/2025–set/2026), 181 delas com 3★ ou menos. Mais a página pública do Reclame Aqui da empresa: 378 reclamações, 82 na categoria "Não consigo cancelar" (contagem do próprio site em 09/10/2026). Google Play não entrou: a página não expõe as avaliações sem login/rolagem, e não fiz scraping. Linhas completas em `reviews.csv`; temas contados por palavra-chave, então os números são aproximados. Os links das avaliações apontam para o feed RSS da loja com o id da avaliação.

## 1. O que eles odeiam

| # | problema | avaliações (≤3★) | fontes | citação |
| --- | --- | --- | --- | --- |
| 1 | Cobrança que surpreende: "grátis" que só deixa treinar uma vez, valor mensal anunciado e anual cobrado à vista, reembolso negado dentro dos 7 dias do CDC | 136 (113) | BR, US, Reclame Aqui | "A oferta mostrava o valor de 12x de R$13,00, porém foi cobrado o valor integral de R$159,90 de uma só vez" ([#13293473997](https://itunes.apple.com/br/rss/customerreviews/id=6504535443/sortBy=mostRecent/json#13293473997)) · "Só deixa treinar uma vez sem pagar, horrível" ([#14552111710](https://itunes.apple.com/br/rss/customerreviews/id=6504535443/sortBy=mostRecent/json#14552111710)) |
| 2 | Bugs que perdem o treino: trava no meio, não finaliza, cronômetro eterno, histórico some | 63 (50) | BR, US | "every 6 weeks or so it resets and all exercises , data and progress GONE!!" ([#14452751781](https://itunes.apple.com/us/rss/customerreviews/id=6504535443/sortBy=mostRecent/json#14452751781)) · "finalizo o treino e o cronometro dele continua correndo no segundo plano" ([#13330987103](https://itunes.apple.com/br/rss/customerreviews/id=6504535443/sortBy=mostRecent/json#13330987103)) |
| 3 | Conta presa ao aparelho/loja: troca Android→iPhone e perde a assinatura; e-mail que não pode mudar; excluir conta não funciona | 28 (26) | BR, US | "botão de excluir conta não funciona" ([#14034007841](https://itunes.apple.com/br/rss/customerreviews/id=6504535443/sortBy=mostRecent/json#14034007841)) · "Se você compra na Apple Store, não consegue logar no Android ou restaurar a compra" ([#13888602075](https://itunes.apple.com/br/rss/customerreviews/id=6504535443/sortBy=mostRecent/json#13888602075)) |
| 4 | Suporte que não responde | 25 (25) | BR, US | "Email for support comes back as undeliverable and Chat function does not work" ([#13787233994](https://itunes.apple.com/us/rss/customerreviews/id=6504535443/sortBy=mostRecent/json#13787233994)) |
| 5 | "IA" que gera sempre o mesmo e ignora o equipamento informado | 31 (22) | BR, US | "I literally told it I didn't have kettle bells and updated it and the first workout was something with kettle bells" ([#14225314508](https://itunes.apple.com/us/rss/customerreviews/id=6504535443/sortBy=mostRecent/json#14225314508)) |
| 6 | Descanso não avisa com a tela bloqueada | 19 (11) | BR, US | "não dá aviso sonoro ou com vibração quando o descanso termina COM A TELA DO CELULAR BLOQUEADO" ([#14030598022](https://itunes.apple.com/br/rss/customerreviews/id=6504535443/sortBy=mostRecent/json#14030598022)) |
| 7 | Ofensiva diária que zera no fim de semana | 1 — **fino** | BR | "Treinei 5 dias consecutivos (seg a sex) e descansei no fds. Na segunda seguinte [...] o app zerou a ofensiva" ([#13679509304](https://itunes.apple.com/br/rss/customerreviews/id=6504535443/sortBy=mostRecent/json#13679509304)) |

## 2. O que está faltando

| # | pedido | avaliações | fontes | citação |
| --- | --- | --- | --- | --- |
| 1 | Cardio (esteira, bike, elíptico) dentro do treino | 17 | BR, US | "Colocar estreita , bike , elíptico e etc para registar os treinos de Cardio" ([#13860864887](https://itunes.apple.com/br/rss/customerreviews/id=6504535443/sortBy=mostRecent/json#13860864887)) |
| 2 | Aparelhos/exercícios que faltam; criar exercício próprio | 14 | BR, US | "Não têm 1/3 dos aparelhos que têm na minha academia" ([#14513850507](https://itunes.apple.com/br/rss/customerreviews/id=6504535443/sortBy=mostRecent/json#14513850507)) · "an option to add custom exercises" ([#13616972692](https://itunes.apple.com/us/rss/customerreviews/id=6504535443/sortBy=mostRecent/json#13616972692)) |
| 3 | Editar cargas/reps de treino já concluído | 2 — **fino** | BR, US | "permitir editar repetições e pesos de exercícios de treinos já concluídos" ([#14491530030](https://itunes.apple.com/br/rss/customerreviews/id=6504535443/sortBy=mostRecent/json#14491530030)) |
| 4 | Descartar treino sem salvar | 1 — **fino** | BR | "Não tem opção de descartar o treino quando não quero salvar" ([#13502389491](https://itunes.apple.com/br/rss/customerreviews/id=6504535443/sortBy=mostRecent/json#13502389491)) |
| 5 | Teste grátis de verdade antes de pagar | dentro do tema 1 | BR, US | "O app deveria oferecer 30 dias de teste gratuito." ([#13270187319](https://itunes.apple.com/br/rss/customerreviews/id=6504535443/sortBy=mostRecent/json#13270187319)) |

## 3. O que ninguém resolve

- **Quem quer só registrar o treino, de graça.** Vários usuários aceitariam pagar pela IA, mas não pelo diário: "recursos como plano personalizado podem ser pagos, mas a interface de montar meu treino e realizá-lo todos os dias deveria ser gratuita" ([#13971815836](https://itunes.apple.com/br/rss/customerreviews/id=6504535443/sortBy=mostRecent/json#13971815836)).
- **Quem treina em casa com o que tem.** "AI workout does not take into account the equipment you have at home" ([#13864019928](https://itunes.apple.com/us/rss/customerreviews/id=6504535443/sortBy=mostRecent/json#13864019928)).
- **Quem quer musculação e dieta no mesmo lugar.** O Befit não tem dieta; o Forja já tem.

## Plano de correção

| # | o que | tamanho | skill | evidência | estado |
| --- | --- | --- | --- | --- | --- |
| 1 | Registro de treino ilimitado e grátis; premium só para IA/programas/análises. Preço anual mostrado como anual; cancelamento em 1 toque; reembolso em 7 dias sem atrito | S (decisão) | `/replica-launch` | tema 1 (136) | definido no launch |
| 2 | Excluir conta que funciona (apaga dados e fotos) | S | `/replica-backend` | tema 3 + exigência da Apple | **feito agora** |
| 3 | Criar exercício próprio (aparelho que falta) | S | `/replica-build` | pedido 2 (14) | **feito agora** |
| 4 | Conta por e-mail/Google, independente da loja; assinatura via RevenueCat ligada ao id do Supabase | — | já existe | tema 3 | já existe (webhook usa o id do Supabase) |
| 5 | Plano que respeita o equipamento | — | já existe | tema 5 | já existe (`buildRoutineDraft` cruza perfil × marcado) |
| 6 | Ofensiva semanal que não zera no descanso | — | feito | queixa 7 | feito (`weeklyStreak`) |
| 7 | Descanso com aviso fora do app | M | `/replica-build` | tema 6 (19) | web: notificação do sistema (hook); mobile nativo: falta |
| 8 | Cardio no treino (tempo/distância) | M | `/replica-build` | pedido 1 (17) | próximo |
| 9 | Editar treino concluído | S | `/replica-build` | pedido 3 (fino) | próximo |

Já resolvidos no Forja e sem trabalho: dados no Postgres (não "resetam"), descartar treino existe, ficha editável sem abrir treino, exportação de dados (CSV).

## O ângulo

1. **Para quem quer só treinar e cansou de app que cobra para registrar uma série**, o Forja registra treinos de graça e para sempre; o pago é o extra. *Evidência: tema 1, 136 avaliações em 2 lojas + 82 queixas de cancelamento no Reclame Aqui.*
2. **Para quem já perdeu o histórico num app de treino**, o Forja guarda tudo na sua conta (não no celular), exporta em CSV e apaga de verdade quando você pede. *Evidência: temas 2 e 3, 91 avaliações.*
3. **Para quem quer treino e dieta juntos**, um app só, com o plano de treino conversando com as calorias. *Evidência: fina nas avaliações; é diferencial do produto, não dor medida.*

**Recomendado: o 1**, com o 2 como prova. É a dor mais citada, com mais fontes, e é a mais barata de cumprir: o diário já é grátis por natureza no Forja.
