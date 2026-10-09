# Paridade — Forja × Befit

Data: 2026-10-09

| | |
| --- | --- |
| Score de funcionalidades (must×3, should×2, could×1, partial = ½, skip fora) | **84%** |
| Must-haves completos | **16 / 16** |
| Bugs abertos S1 / S2 | 0 / 0 |
| Score de layout | não medido — nenhuma screenshot do Befit foi salva (clean room, só fontes textuais). As do Forja estão em `clone-screens/`. |

**Veredito: shippable.** Todas as funcionalidades obrigatórias completas, score ≥ 80, sem S1/S2 abertos. "Melhor que o original" depende das correções do `/replica-entrepreneur`.

## Por área (mais fraca primeiro)

| área | score |
| --- | --- |
| monetização | 33% |
| treinos | 69% |
| ajustes | 75% |
| engajamento | 80% |
| progresso | 85% |
| biblioteca | 86% |
| sessão | 86% |
| plano | 94% |
| home, onboarding | 100% |

## O que falta, em ordem de build

1. Paywall (tela) + RevenueCat no app — backend pronto (should)
2. Treino rápido escolhendo o grupo muscular (should)
3. Offline durante a sessão — PowerSync já tem streams, o front não usa (should)
4. Ranking de exercícios favoritos (should)
5. Trocar academia/casa regenerando o plano sem refazer o quiz (should)
6. Lembretes push com frequência configurável, cardio com IA, tela bloqueada, identificar equipamento (could)

## Diferenças de comportamento

| fluxo | Befit faz | Forja faz | decisão |
| --- | --- | --- | --- |
| Ofensiva | diária, 1 por dia | semanas seguidas batendo a meta | manter: descanso não quebra a sequência |
| Registro | série a série | marca o exercício; séries opcionais | manter (decisão de produto do Forja) |
| Editar ficha | só iniciando um treino (crítica do TechTudo) | edita no lugar, sem treino | manter: vantagem |
| Descanso | timer automático | timer ao concluir série ou no botão; persiste no reload; notificação do sistema | manter |
| Programas | biblioteca fixa | presets do gerador, respeitando o equipamento | manter |
| Cliques até começar o treino do dia | play na home (1) | "Abrir treino" na home (1) | empate |
