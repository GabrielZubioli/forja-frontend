# Plano de lançamento

## Antes de qualquer anúncio (bloqueios)

1. **Nome** — decidir se fica "Forja" (há apps homônimos na categoria, ver `../brand.md`). Busca no INPI + advogado.
2. **Paywall** — a seção "Pro" da descrição (teste de 7 dias, cancelar em um toque) só vale quando a tela existir e o RevenueCat estiver configurado. Até lá, publicar sem a seção Pro.
3. **CI verde** — configurar o secret `PACKAGES_READ_TOKEN` no GitHub (o CI do `main` falha desde 12/08 por falta dele).
4. **Produção** — o projeto Supabase está pausado; restaurar, aplicar as 2 migrations novas e implantar `delete-account` e `billing-webhook` (ver `/replica-deploy`).
5. **Política de privacidade** listando Supabase, RevenueCat, Stripe (se web), provedor de IA do treinador; URL de suporte que responde.

## Lista de espera / beta

- Formulário simples (e-mail) na própria `/` enquanto o nome não é decidido.
- Beta fechado com 20–30 pessoas que treinam 3+ vezes por semana; metade vinda de outro app (testa a importação).

## Medir desde o dia 1

- Erros: o app já tem `lib/error-capture.ts`; ligar a um serviço (Sentry ou similar) antes do beta.
- Funil: questionário concluído → primeiro treino concluído → 3º treino em 14 dias → semana na meta.

## Onde estão os insatisfeitos (pesquisa em `../fixes.md`)

- Avaliações de 1–3★ na App Store e no Reclame Aqui do concorrente mostram o público: quem foi cobrado sem querer e quem perdeu histórico. Não abordar ninguém pelas avaliações; falar com o público onde ele já conversa: r/academia e grupos de musculação, comunidades de Strong/Hevy, criadores de conteúdo de treino em casa.
- Mensagem: o diário é grátis para sempre e o histórico vem junto (importação). Nunca citar o concorrente em anúncio ou loja.

## Post de lançamento

Product Hunt / comunidades: "Diário de treino grátis para sempre, com importação do Strong/Hevy e dieta no mesmo app" — liderar pela correção (grátis + importação + exclusão real), mostrar a tela de descanso e o resumo pós-treino.

## Os primeiros 10

Conversar um a um com os 10 primeiros que concluírem 3 treinos: o que quase os fez desistir, o que pagariam, o que falta. Antes de fixar o preço do Pro.
