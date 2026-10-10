# Marca Habitual Fit

Verde da marca **#01D798** · fundo escuro **#020306** · branco **#FFFFFF**.

| Pasta | O que tem |
| --- | --- |
| `original/` | As artes recebidas (identidade visual e logo vertical). |
| `svg/` | Tudo em vetor: símbolo (verde, branco, preto), ícones de app (escuro, claro, verde), logo horizontal e vertical (escura = texto branco, clara = texto escuro; `-fundo` com fundo; `-ui` sem margem, usada no app). |
| `png/simbolo/` | Símbolo sem texto, fundo transparente, 256/512/1024 px. |
| `png/icone-app/` | Ícones 1024 px: quadrado (para as lojas, que arredondam sozinhas) e arredondado (para apresentações). |
| `png/logo/` | Logos horizontal e vertical, 2000 px, com e sem fundo. |
| `png/web/` | Favicon, ícones do PWA (192, 512, maskable), apple-touch-icon e imagem de compartilhamento 1200×630. |

Os vetores foram traçados da arte original (`trace.cjs`, com `potrace`) e
montados por `build-brand.cjs`. Para regerar: crie as máscaras ampliadas 4× de
cada parte (símbolo, "Habitual", "FIT"), rode `node trace.cjs <pasta>` e depois
`node build-brand.cjs <pasta>/paths.json svg/`.
