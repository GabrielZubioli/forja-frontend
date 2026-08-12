/**
 * Conversão e medição de cor em oklch.
 *
 * ## Por que isto existe
 *
 * A paleta do app é escrita em oklch, e oklch tem duas armadilhas que nenhuma
 * revisão visual pega de forma confiável:
 *
 * 1. **Nem toda coordenada existe em sRGB.** O croma máximo depende da
 *    luminância e do matiz. Passar do limite não dá erro: o navegador *clipa*
 *    silenciosamente para a borda do gamut. O resultado é uma cor chapada e
 *    fluorescente que ainda por cima renderiza diferente entre monitores. A
 *    paleta anterior deste projeto fazia exatamente isso — `oklch(0.72 0.24
 *    145)` virava `#00c829` na tela.
 *
 * 2. **Contraste não se estima de olho.** Dois tons que "parecem" bem
 *    contrastados passam longe de 4.5:1 com frequência, e o erro só aparece
 *    para quem depende do contraste.
 *
 * Com estas funções as duas coisas viram teste ([design-tokens.test.ts]), e a
 * paleta deixa de depender de alguém ter conferido à mão.
 *
 * As matrizes são a definição de referência do Oklab (Björn Ottosson) e a
 * fórmula de contraste é a da WCAG 2.x.
 */

export type Oklch = { l: number; c: number; h: number };
export type LinearRgb = readonly [number, number, number];

/** Tolerância do teste de gamut: absorve o erro de ponto flutuante da matriz. */
const GAMUT_EPSILON = 0.0005;

/**
 * oklch → sRGB linear.
 *
 * Os valores podem sair de `[0, 1]`: é justamente esse estouro que denuncia
 * uma cor fora do gamut, então não são limitados aqui.
 */
export function oklchToLinearRgb({ l, c, h }: Oklch): LinearRgb {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);

  const lCone = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mCone = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sCone = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    4.0767416621 * lCone - 3.3077115913 * mCone + 0.2309699292 * sCone,
    -1.2684380046 * lCone + 2.6097574011 * mCone - 0.3413193965 * sCone,
    -0.0041960863 * lCone - 0.7034186147 * mCone + 1.707614701 * sCone,
  ];
}

/** A cor pode ser exibida em sRGB sem o navegador precisar clipá-la? */
export function isInSrgbGamut(color: Oklch): boolean {
  return oklchToLinearRgb(color).every((v) => v >= -GAMUT_EPSILON && v <= 1 + GAMUT_EPSILON);
}

/** Curva de transferência do sRGB (linear → codificado). */
function encodeGamma(value: number): number {
  const v = Math.max(0, Math.min(1, value));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

/** oklch → `#rrggbb`. Cores fora do gamut saem clipadas, como no navegador. */
export function oklchToHex(color: Oklch): string {
  const channels = oklchToLinearRgb(color)
    .map((v) => Math.round(encodeGamma(v) * 255))
    .map((v) => v.toString(16).padStart(2, "0"));
  return `#${channels.join("")}`;
}

/** Luminância relativa da WCAG. O clamp reproduz o que a tela mostra. */
export function relativeLuminance(color: Oklch): number {
  const [r, g, b] = oklchToLinearRgb(color).map((v) => Math.max(0, Math.min(1, v)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste WCAG entre duas cores. Vai de 1:1 a 21:1. */
export function contrastRatio(a: Oklch, b: Oklch): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Maior croma que ainda cabe no gamut sRGB para uma luminância e matiz.
 *
 * Busca binária porque a fronteira do gamut não tem forma fechada em oklch.
 * Útil ao escolher um tom novo: dá o teto antes de a cor começar a clipar.
 */
export function maxChroma(l: number, h: number): number {
  let low = 0;
  let high = 0.4;
  for (let i = 0; i < 40; i += 1) {
    const mid = (low + high) / 2;
    if (isInSrgbGamut({ l, c: mid, h })) low = mid;
    else high = mid;
  }
  return low;
}

/**
 * Lê `oklch(L C H)` — com ou sem `/ alpha`, que é ignorado.
 *
 * Aceita apenas a notação usada na paleta (números simples separados por
 * espaço). Devolve `null` para qualquer outra coisa, inclusive `var(--x)`,
 * para o chamador distinguir "não é uma cor literal" de "é uma cor inválida".
 */
export function parseOklch(value: string): Oklch | null {
  const match = value
    .trim()
    .match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*[\d.%]+\s*)?\)$/);
  if (!match) return null;

  const [l, c, h] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (![l, c, h].every(Number.isFinite)) return null;
  return { l, c, h };
}
