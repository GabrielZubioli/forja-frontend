/**
 * A paleta como teste.
 *
 * Este arquivo lê o `styles.css` de verdade — não uma cópia dos valores — e
 * afirma duas propriedades sobre cada token:
 *
 * - **Cabe em sRGB.** Cor fora do gamut é clipada em silêncio pelo navegador e
 *   vira um tom fluorescente que muda de monitor para monitor.
 * - **Tem contraste suficiente onde é lida.** Texto ≥ 4.5:1, objeto gráfico e
 *   anel de foco ≥ 3:1 (WCAG 2.2 AA).
 *
 * O ganho não é pegar o erro de hoje, e sim os de amanhã: um ajuste de "só
 * clarear um pouco o verde" que quebre o contraste do botão passa a falhar no
 * `npm test` em vez de chegar na tela de alguém.
 *
 * Os pares testados são os que existem de fato na interface. Combinação que
 * ninguém usa não entra — teste que afirma o que o produto não faz só custa
 * manutenção.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { contrastRatio, isInSrgbGamut, oklchToHex, parseOklch, type Oklch } from "./color";

const CSS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "styles.css"), "utf8");

/**
 * Extrai os tokens de um bloco (`:root` = claro, `.dark` = escuro).
 *
 * Só interessam declarações com valor `oklch(...)` literal. Aliases
 * (`var(--outra)`), sombras e gradientes ficam de fora: não são cores únicas e
 * seriam medidos pelos tokens que referenciam.
 */
function readTokens(selector: string): Record<string, Oklch> {
  const start = CSS.indexOf(`\n${selector} {`);
  if (start === -1) throw new Error(`Bloco "${selector}" não encontrado em styles.css.`);
  const end = CSS.indexOf("\n}", start);
  const block = CSS.slice(start, end);

  const tokens: Record<string, Oklch> = {};
  for (const [, name, value] of block.matchAll(/^\s*--([\w-]+):\s*([^;]+);/gm)) {
    const color = parseOklch(value);
    if (color) tokens[name] = color;
  }
  return tokens;
}

const light = readTokens(":root");
const dark = readTokens(".dark");

/** Branco puro não aparece como token no bloco claro (é `oklch(1 0 0)`). */
const WHITE: Oklch = { l: 1, c: 0, h: 0 };

describe("paleta — tokens são cores reais", () => {
  it("encontra os dois temas", () => {
    // Guarda contra o pior modo de falha deste arquivo: um `styles.css`
    // reescrito de forma que o parser não ache nada e todos os testes passem
    // por vacuidade.
    expect(Object.keys(light).length).toBeGreaterThan(40);
    expect(Object.keys(dark).length).toBeGreaterThan(40);
  });

  it.each([
    ["claro", light],
    ["escuro", dark],
  ])("todo token do tema %s cabe no gamut sRGB", (_tema, tokens) => {
    const foraDoGamut = Object.entries(tokens)
      .filter(([, color]) => !isInSrgbGamut(color))
      .map(([name, color]) => `--${name} → clipa para ${oklchToHex(color)}`);

    expect(foraDoGamut).toEqual([]);
  });

  it("mantém o matiz da marca coerente entre os temas", () => {
    // O jade pode mudar de luminância entre claro e escuro — precisa mudar,
    // senão some sobre o fundo. O que não pode mudar é o matiz: é ele que faz
    // os dois temas serem o mesmo produto.
    expect(dark.primary.h).toBeCloseTo(light.primary.h, 5);
    expect(dark["chart-1"].h).toBeCloseTo(light["chart-1"].h, 5);
  });
});

/** Par (frente, fundo) com o mínimo exigido pela WCAG para aquele uso. */
type Par = [rotulo: string, frente: Oklch, fundo: Oklch, minimo: number];

const TEXTO = 4.5;
const GRAFICO = 3; // objeto gráfico e componente de interface (WCAG 1.4.11)

function paresDeTexto(t: Record<string, Oklch>, fgBotao: Oklch): Par[] {
  return [
    ["texto principal sobre card", t.foreground, t.card, TEXTO],
    ["texto principal sobre background", t.foreground, t.background, TEXTO],
    ["texto secundário sobre card", t["subtle-foreground"], t.card, TEXTO],
    ["texto auxiliar sobre card", t["muted-foreground"], t.card, TEXTO],
    ["texto auxiliar sobre background", t["muted-foreground"], t.background, TEXTO],
    ["texto auxiliar sobre surface", t["muted-foreground"], t.surface, TEXTO],
    ["texto auxiliar sobre muted", t["muted-foreground"], t.muted, TEXTO],
    ["texto auxiliar sobre popover", t["muted-foreground"], t.popover, TEXTO],

    ["rótulo do botão primário", fgBotao, t.primary, TEXTO],
    ["rótulo do botão primário (hover)", fgBotao, t["primary-hover"], TEXTO],
    ["rótulo do botão primário (active)", fgBotao, t["primary-active"], TEXTO],
    ["texto sobre tinta da marca", t["primary-soft-foreground"], t["primary-soft"], TEXTO],
    ["texto sobre accent", t["accent-foreground"], t.accent, TEXTO],
    ["link / ícone da marca sobre card", t.primary, t.card, TEXTO],
    ["link / ícone da marca sobre background", t.primary, t.background, TEXTO],

    ["rótulo do botão destrutivo", t["destructive-foreground"], t.destructive, TEXTO],
    ["rótulo do botão de sucesso", t["success-foreground"], t.success, TEXTO],
    ["rótulo do botão de aviso", t["warning-foreground"], t.warning, TEXTO],
    ["rótulo do botão informativo", t["info-foreground"], t.info, TEXTO],
    ["texto de erro sobre card", t.destructive, t.card, TEXTO],
    ["texto de aviso sobre card", t.warning, t.card, TEXTO],
    ["texto informativo sobre card", t.info, t.card, TEXTO],
    ["texto de sucesso sobre card", t.success, t.card, TEXTO],

    // Etiquetas de tinta (`Badge variant="success"` e afins): a cor sólida
    // escreve sobre a versão clara dela mesma. É o par mais fácil de errar,
    // porque as duas cores nascem do mesmo matiz e "parecem" contrastadas.
    ["etiqueta de sucesso", t.success, t["success-soft"], TEXTO],
    ["etiqueta de aviso", t.warning, t["warning-soft"], TEXTO],
    ["etiqueta de erro", t.destructive, t["destructive-soft"], TEXTO],
    ["etiqueta informativa", t.info, t["info-soft"], TEXTO],

    ["item ativo da navegação", t["sidebar-accent-foreground"], t["sidebar-accent"], TEXTO],
    ["item inativo da navegação", t["sidebar-foreground"], t.sidebar, TEXTO],
  ];
}

function paresGraficos(t: Record<string, Oklch>): Par[] {
  return [
    ["anel de foco sobre background", t.ring, t.background, GRAFICO],
    ["anel de foco sobre card", t.ring, t.card, GRAFICO],
    ...([1, 2, 3, 4, 5] as const).map((i): Par => [
      `série ${i} do gráfico sobre card`,
      t[`chart-${i}`],
      t.card,
      GRAFICO,
    ]),
  ];
}

describe("paleta — contraste no tema claro", () => {
  it.each(paresDeTexto(light, WHITE))("%s ≥ %d:1", (_rotulo, frente, fundo, minimo) => {
    expect(contrastRatio(frente, fundo)).toBeGreaterThanOrEqual(minimo);
  });

  it.each(paresGraficos(light))("%s ≥ %d:1", (_rotulo, frente, fundo, minimo) => {
    expect(contrastRatio(frente, fundo)).toBeGreaterThanOrEqual(minimo);
  });
});

describe("paleta — contraste no tema escuro", () => {
  it.each(paresDeTexto(dark, dark["primary-foreground"]))(
    "%s ≥ %d:1",
    (_rotulo, frente, fundo, minimo) => {
      expect(contrastRatio(frente, fundo)).toBeGreaterThanOrEqual(minimo);
    },
  );

  it.each(paresGraficos(dark))("%s ≥ %d:1", (_rotulo, frente, fundo, minimo) => {
    expect(contrastRatio(frente, fundo)).toBeGreaterThanOrEqual(minimo);
  });
});

describe("paleta — escada de superfícies", () => {
  /**
   * Cada degrau precisa ser visível e sutil ao mesmo tempo.
   *
   * Abaixo de 1.02 os níveis viram um só e a hierarquia some; acima de ~1.25 a
   * separação vira listra e o app parece remendado. A faixa é estreita de
   * propósito — é o que faz a profundidade parecer material em vez de
   * desenhada.
   */
  const degrau = (a: Oklch, b: Oklch) => contrastRatio(a, b);

  it("o tema escuro sobe a cada nível", () => {
    expect(dark.surface.l).toBeGreaterThan(dark.background.l);
    expect(dark.card.l).toBeGreaterThan(dark.surface.l);
    expect(dark.elevated.l).toBeGreaterThan(dark.card.l);
  });

  it.each([
    ["escuro: background → surface", degrau(dark.background, dark.surface)],
    ["escuro: surface → card", degrau(dark.surface, dark.card)],
    ["escuro: card → elevated", degrau(dark.card, dark.elevated)],
    ["claro: background → surface", degrau(light.background, light.surface)],
  ])("%s é perceptível e sutil", (_rotulo, razao) => {
    expect(razao).toBeGreaterThan(1.02);
    expect(razao).toBeLessThan(1.25);
  });

  it("no tema claro o card é a superfície mais alta", () => {
    expect(light.card.l).toBeGreaterThan(light.surface.l);
    expect(light.card.l).toBeGreaterThanOrEqual(light.background.l);
  });
});

describe("identidade — o verde é próprio", () => {
  /**
   * O verde anterior ficava a ~3° do verde do Spotify (`#1DB954`, cerca de
   * `oklch(0.70 0.19 148)`) — perto o suficiente para o app parecer derivado.
   * O jade fica em 162°. Este teste é o que impede a paleta de escorregar de
   * volta para lá num ajuste futuro.
   */
  const VERDE_GENERICO_FITNESS = 148;
  const DISTANCIA_MINIMA = 10;

  it.each([
    ["claro", light.primary],
    ["escuro", dark.primary],
  ])("o primário do tema %s não é o verde genérico de fitness", (_tema, cor) => {
    expect(Math.abs(cor.h - VERDE_GENERICO_FITNESS)).toBeGreaterThanOrEqual(DISTANCIA_MINIMA);
  });

  it("os neutros carregam um traço do matiz da marca, sem virar verde", () => {
    // Cinza puro ao lado de um jade saturado parece sujo; cinza levemente
    // esverdeado parece intencional. O limite superior é o que impede o
    // "traço" de virar cor.
    for (const nome of ["background", "card", "border", "muted-foreground"] as const) {
      expect(dark[nome].c).toBeLessThanOrEqual(0.02);
      expect(light[nome].c).toBeLessThanOrEqual(0.02);
    }
  });
});
