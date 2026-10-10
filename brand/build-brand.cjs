// Monta os SVGs da marca Habitual Fit a partir dos caminhos vetorizados.
// Uso: node build-brand.cjs <paths.json> <pasta-de-saida>
const fs = require("fs");
const path = require("path");

const [, , pathsFile, outDir] = process.argv;
const P = JSON.parse(fs.readFileSync(pathsFile, "utf8"));
fs.mkdirSync(outDir, { recursive: true });

const VERDE = "#01D798";
const ESCURO = "#020306";
const BRANCO = "#FFFFFF";
const PAD = 6; // respiro usado no recorte das máscaras, em px da imagem original

// Posição de cada parte na arte original (1254 × 1254), em px.
const POS = {
  simbolo: { x: 434, y: 274, w: 424, h: 368 },
  habitual: { x: 192, y: 715, w: 877, h: 142 },
  fit: { x: 185, y: 898, w: 878, h: 62 },
};

const arred = (d) => d.replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n))));
const D = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, arred(v.d)]));

/** Uma parte da arte original: posição final = (dx, dy) + s × coordenada original. */
const parte = (nome, cor, dx = 0, dy = 0, s = 1) => {
  const { x, y } = POS[nome];
  // O caminho está no espaço do recorte ampliado 4×, que começa em (x − PAD, y − PAD).
  return `<path fill="${cor}" fill-rule="evenodd" transform="translate(${r(dx + s * (x - PAD))} ${r(dy + s * (y - PAD))}) scale(${r(s / 4)})" d="${D[nome]}"/>`;
};
const r = (n) => Math.round(n * 1000) / 1000;

const svg = (w, h, body, bg) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r(w)} ${r(h)}" width="${r(w)}" height="${r(h)}">` +
  (bg ? `<rect width="100%" height="100%" fill="${bg}"/>` : "") +
  body +
  `</svg>\n`;

const grava = (nome, conteudo) => fs.writeFileSync(path.join(outDir, nome), conteudo);

// ── Símbolo isolado ─────────────────────────────────────────────────────────
const S = POS.simbolo;
for (const [sufixo, cor] of [["", VERDE], ["-branco", BRANCO], ["-preto", ESCURO]]) {
  grava(`habitual-fit-simbolo${sufixo}.svg`, svg(S.w, S.h, parte("simbolo", cor, -S.x, -S.y)));
}

// Ícone de app: símbolo centralizado num quadrado com respiro (área segura ~62%).
const icone = (bg, cor, lado = 1024, ocupa = 0.62) => {
  const s = (lado * ocupa) / Math.max(S.w, S.h);
  const dx = (lado - S.w * s) / 2;
  const dy = (lado - S.h * s) / 2;
  return svg(lado, lado, parte("simbolo", cor, dx - S.x * s, dy - S.y * s, s), bg);
};
grava("habitual-fit-icone-escuro.svg", icone(ESCURO, VERDE));
grava("habitual-fit-icone-claro.svg", icone(BRANCO, VERDE));
grava("habitual-fit-icone-verde.svg", icone(VERDE, BRANCO));

// ── Logo vertical (como a arte original) ────────────────────────────────────
const vertical = (corTexto, bg) => {
  const minX = POS.fit.x, maxX = POS.fit.x + POS.fit.w;
  const minY = S.y, maxY = POS.fit.y + POS.fit.h;
  const m = 40;
  const w = maxX - minX + 2 * m, h = maxY - minY + 2 * m;
  const ox = -minX + m, oy = -minY + m;
  return svg(
    w,
    h,
    parte("simbolo", VERDE, ox, oy) + parte("habitual", corTexto, ox, oy) + parte("fit", VERDE, ox, oy),
    bg,
  );
};
grava("habitual-fit-logo-vertical-escura.svg", vertical(BRANCO));
grava("habitual-fit-logo-vertical-clara.svg", vertical(ESCURO));
grava("habitual-fit-logo-vertical-escura-fundo.svg", vertical(BRANCO, ESCURO));
grava("habitual-fit-logo-vertical-clara-fundo.svg", vertical(ESCURO, BRANCO));

// ── Logo horizontal: símbolo à esquerda, nome à direita ─────────────────────
const horizontal = (corTexto, bg, m = 40) => {
  const gap = 56;
  const textoH = POS.fit.y + POS.fit.h - POS.habitual.y; // bloco do nome
  const s = (S.h * 0.78) / textoH; // nome com ~78% da altura do símbolo
  const textoW = POS.fit.w * s;
  const w = m + S.w + gap + textoW + m;
  const h = S.h + 2 * m;
  const simb = parte("simbolo", VERDE, m - S.x, m - S.y);
  const tx = m + S.w + gap, ty = m + (S.h - textoH * s) / 2;
  const nome = (n, cor) => parte(n, cor, tx - s * POS.fit.x, ty - s * POS.habitual.y, s);
  return svg(w, h, simb + nome("habitual", corTexto) + nome("fit", VERDE), bg);
};
grava("habitual-fit-logo-horizontal-escura.svg", horizontal(BRANCO));
grava("habitual-fit-logo-horizontal-clara.svg", horizontal(ESCURO));
grava("habitual-fit-logo-horizontal-escura-fundo.svg", horizontal(BRANCO, ESCURO));
grava("habitual-fit-logo-horizontal-clara-fundo.svg", horizontal(ESCURO, BRANCO));
// Sem margem, para a interface do app.
grava("habitual-fit-logo-horizontal-clara-ui.svg", horizontal(ESCURO, undefined, 0));
grava("habitual-fit-logo-horizontal-escura-ui.svg", horizontal(BRANCO, undefined, 0));

console.log(fs.readdirSync(outDir).filter((f) => f.endsWith(".svg")).length, "svgs");
