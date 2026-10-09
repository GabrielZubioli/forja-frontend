# openGym → Forja: o que vale trazer

Fonte: https://github.com/DuarteSantos8/openGym (v1.4.0, 09/10/2026), lido no README, CHANGELOG e `docs/`.

## Licença — define o *como*

| parte | licença | o que podemos fazer |
| --- | --- | --- |
| código | **AGPL-3.0** | **não copiar.** Copiar obrigaria o Forja inteiro a ser AGPL (inclusive publicar o código para quem usa pela web). Ideias e comportamento não são protegidos: reimplementamos do zero. |
| animações/fotos (`catalogue/media`) | licença da Gym visual, proibido reuso | **não usar** (o Forja já reverteu mídias da Gym visual antes: migration `revert_gymvisual_media`) |
| textos de 1.324 exercícios (`textSource: exercisedb`) | MIT (ExerciseDB → hasaneyldrm/exercises-dataset) | pode ser usado **a partir da fonte MIT**, com o aviso de licença |
| contornos do mapa corporal | MIT (MuscleMap, Melih Colpan) | pode ser usado com o aviso, se quisermos trocar o desenho |

## Dieta

O openGym não tem dieta — é treino + peso corporal. Nada a trazer; a dieta do Forja segue como diferencial.

## Mapa de recursos

Legenda: ✅ Forja já tem · 🟡 tem parcial · ⬜ não tem. **Lote** = quando entra.

| recurso do openGym | Forja | lote | nota |
| --- | --- | --- | --- |
| Fadiga por músculo com tempo de recuperação próprio (pernas mais lentas que braços), contada em séries e somando treinos recentes | ✅ | **1 · feito** | Forja usa só o último treino e o mesmo tempo base para todos — ombro de 5 séries aparecia "~3 dias" |
| Tela acesa durante o treino (Wake Lock) | ✅ | **1 · feito** | uma API do navegador |
| Calculadora de anilhas pelo que você tem | ✅ | **1 · feito** | puro domínio |
| Mapa de calor do ano (dias treinados) | ✅ | **1 · feito** | |
| Editar treino já salvo / mudar a data / registrar treino feito no papel | 🟡 | **1 · feito (editar e mudar data)** | também pedido por usuários do Befit |
| "Última vez × próxima vez" na tela de fim de treino | ✅ | **1 · feito (última vez)** | completa o resumo pós-treino |
| Importar histórico do Strong, Hevy, FitNotes (CSV) | ✅ | **1 · feito** | maior alavanca para quem troca de app |
| Mapa muscular em 3 modos: volume, recuperando, sem treinar | 🟡 | 2 | temos volume e recuperação; falta "sem treinar" |
| Volume semanal planejado × feito por músculo | 🟡 | 2 | temos o feito por parte do corpo |
| Progressão tripla (reps → séries → carga), linear, por tempo; explicação do porquê do número | 🟡 | 2 | Forja tem dupla progressão |
| RIR/RPE por série com explicação | 🟡 | 2 | coluna `rpe` existe, falta UI |
| Alerta de fim de descanso piscando a tela; escolha do som | 🟡 | 2 | temos som + vibração + notificação |
| Rotação A-B-C **ou** semana fixa, à escolha; mover sessão de dia sem mexer no plano | ✅/🟡 | 2 | Forja já é rotação com dias-guia |
| Nota para dia perdido (doente, viagem) | ⬜ | 2 | |
| Supersets, drop, rest-pause, back-off, pirâmide | 🟡 | 3 | `set_type` e `superset_group` existem |
| Exercício cronometrado (prancha), cardio por tempo/velocidade/inclinação | ⬜ | 3 | também pedido no Befit |
| Por lado (unilateral), peso corporal sem carga, rack de halteres | ⬜ | 3 | |
| Equilíbrio estrutural (razões entre levantamentos) | ⬜ | 3 | |
| 1RM por várias fórmulas | 🟡 | 3 | temos Epley |
| Compartilhar plano (arquivo/PDF), exportar treino como imagem, .fit (Garmin) | ⬜ | 3 | |
| Health Connect / Apple Health | ⬜ | 3 | exige app nativo |
| Coach de IA que propõe mudanças no plano e você aprova uma a uma | 🟡 | 3 | Forja tem o chat `coach` |
| Servidor MCP só-leitura para perguntar ao assistente sobre o histórico | ⬜ | 3 | |
| Passkeys, sync offline com merge campo a campo, 19 idiomas, self-host | — | fora | arquitetura diferente (Supabase + PowerSync); i18n só se houver mercado |
| Catálogo de 5.600 exercícios | 🟡 | 3 | dá para ampliar a partir das fontes MIT; mídia, não |
| Medidas corporais, fotos com antes/depois, exportar tudo em JSON | ✅ | — | já no Forja |

## Lote 1 — o que foi feito (09/10/2026)

| item | onde | testes |
| --- | --- | --- |
| Recuperação v2: meia-vida por músculo (24/30/48h), estímulo em séries (máx. 12/sessão), treinos recentes somam | `@forja/domain` `recovery.ts` | 21 testes, incl. calibração (8 séries de perna ≈ 3,5 dias; braço na metade) |
| Tela acesa no treino | `hooks/use-wake-lock.ts` | **não verificado ao vivo** (navegador de teste sem tela); conferir num celular |
| Anilhas por lado na série com barra | `plates.ts` + `PlateHint` na sessão | 5 testes; ao vivo 70 kg → 25 por lado |
| Mapa de calor de 53 semanas | `activity-heatmap.tsx` em Treinos | ao vivo |
| Corrigir cargas de treino concluído (refaz volume e recordes) e mudar a data | `saveFinishedWorkoutEdits`, `moveWorkoutDate` | ao vivo: 560 → 480 kg; data movida mantendo horário e duração |
| Hoje × última vez no resumo | `session-compare.ts` + `ComparisonList` | 5 testes; ao vivo |
| Importar CSV do Strong/Hevy/FitNotes (casa com o catálogo em pt/en, cria exercício próprio para o resto, não duplica ao reimportar, saneia valores fora de faixa) | `import-csv.ts` + `data/import.ts` + card no Perfil | 14 testes; ao vivo: 12 treinos/90 séries, reimportação = 0 novos |

Ficou para o lote 2: registrar treino feito no papel (dá para fazer criando e mudando a data, mas sem atalho), "próxima vez" no resumo, recordes do histórico importado (as séries importadas entram sem `is_pr`).
