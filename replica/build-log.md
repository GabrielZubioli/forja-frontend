# Build log

| ID | data | estado | falta | mais difícil que o esperado |
| --- | --- | --- | --- | --- |
| S05 Home | 2026-10-09 | done | — | nada; meta semanal já existia, ofensiva entrou reaproveitando a query da semana (janela de 26 semanas) |
| S07 Sessão | 2026-10-09 | done | descanso na tela bloqueada (exige mobile nativo) | o Forja marca exercício, não série: o timer dispara ao concluir série no detalhe ou pelo botão "Descansar" |
| S10 Resumo | 2026-10-09 | done | delta por exercício vs. última vez | calorias via MET 3,5 + último peso |
| S13 Programas | 2026-10-09 | done | trava premium | — programas são presets do gerador, sem tabela |
| S15 Recordes | 2026-10-09 | done | gráfico por grupo muscular | — |
| S11 Treino rápido | — | partial | gerar treino a partir do músculo escolhido | não iniciado |
| S04 Paywall | — | not started | conta RevenueCat + produtos nas lojas | depende de credenciais do usuário |

| S16 Recuperação | 2026-10-09 | done | — | `fetchMuscleRecovery` já existia sem tela |
| S15 Por parte do corpo | 2026-10-09 | done | — | barras em CSS, sem lib de gráfico |
| S07 Descanso (refactor) | 2026-10-09 | done | — | havia um `use-rest-timer` órfão melhor que o meu; a barra passou a usá-lo |

Verificação (cópia no scratchpad com o contrato compilado do backend local): typecheck ok, lint 0 erros, 226 + 146 testes (UTC, BRT e Tóquio), build ok.
