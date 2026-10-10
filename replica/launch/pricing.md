# Preço

## Mercado (preços públicos)

| app | grátis | mensal | anual | vitalício | fonte (lida em) |
| --- | --- | --- | --- | --- | --- |
| Befit | 1 treino, depois só pago (relatado nas avaliações) | US$ 19,99 | US$ 69,99 (BR: R$ 159,90–199,90 cobrado à vista, segundo avaliações) | — | appbefit.com/help-center (09/10/2026); avaliações App Store BR |
| Hevy | treinos ilimitados, 4 rotinas | US$ 2,99 | US$ 23,99 | US$ 74,99 | hevyapp.com/compare/strong (09/10/2026) |
| Strong | treinos ilimitados, 3 rotinas | US$ 4,99 | US$ 29,99 | US$ 99,99 | sensai.fit, set/2026 (lido 09/10/2026) |
| Fitbod | trial | — | US$ 95,99 | — | sensai.fit, set/2026 (lido 09/10/2026) |

Preços mudam: conferir nas lojas no dia de publicar.

## O que reclamam de cobrança (Befit, `../fixes.md`)

136 avaliações (113 com ≤3★) em 2 lojas + 82 queixas "Não consigo cancelar" no Reclame Aqui: "grátis" que só deixa treinar uma vez; parcelado anunciado e anual cobrado à vista; reembolso negado dentro dos 7 dias do CDC; suporte que não responde.

## Modelo

| plano | para quem | o que tem | preço sugerido (BR) |
| --- | --- | --- | --- |
| **Grátis** | quem quer registrar o treino | diário ilimitado, rotinas ilimitadas, histórico completo, recordes, recuperação, importação de outros apps, exportação, dieta básica | R$ 0, para sempre |
| **Pro** | quem quer que o app monte e ajuste o plano | plano ajustado automaticamente, programas prontos, treinador com IA, análises por parte do corpo, dieta com plano automático | R$ 14,90/mês ou R$ 99,90/ano (≈ 2 meses grátis) |

Dois planos, não três: o ângulo é "o diário é grátis", e um plano do meio só confunde.

Âncora: abaixo do Befit anual, acima do Hevy (que não tem dieta nem IA). Validar com 10 usuários antes de fixar.

## Regras de cobrança (no produto, não só no texto)

- Preço anual mostrado **como anual** ("R$ 99,90 por ano"), com o mensal equivalente menor e entre parênteses. Nunca "12x" se a loja cobra à vista.
- Teste grátis de 7 dias do Pro, com lembrete 2 dias antes de cobrar.
- Cancelar em um toque (link direto para a assinatura da loja ou para o portal do Stripe).
- Reembolso dentro de 7 dias sem pergunta (CDC art. 49): na web pelo Stripe; nas lojas, orientar o pedido e não contestar.
- O diário nunca fica atrás do paywall: perder o Pro não bloqueia registrar treino nem ver histórico.

## Produtos a criar (você cria, nas suas contas)

RevenueCat: entitlement `pro`; produtos `forja_pro_mensal` e `forja_pro_anual` em App Store Connect, Play Console e Stripe (web), ligados à entitlement. O webhook `billing-webhook` já grava o resultado em `subscriptions`.
