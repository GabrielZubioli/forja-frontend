/**
 * Gera a geometria do mapa muscular.
 *
 * Uso: `node scripts/catalog/build-body-map.mjs`
 *
 * ## Por que não desenhar à mão
 *
 * A primeira versão deste mapa foi desenhada à mão, e ficou ruim: a silhueta
 * virou um borrão e os grupos musculares, manchas sem relação com anatomia.
 * Desenhar um corpo humano reconhecível em SVG é trabalho de ilustrador, não de
 * quem escreve `d="M110 74 c-12 0..."` no editor.
 *
 * ## A fonte
 *
 * `react-native-body-highlighter` (MIT) — figura anatômica com contorno
 * detalhado e cada grupo muscular separado, inclusive lado esquerdo e direito.
 * A licença permite uso comercial; a atribuição fica no arquivo gerado.
 *
 * O script traduz o vocabulário da origem para os valores de `muscle_t` do
 * banco e descarta o que não é músculo (cabelo, mãos, pés), que fica por conta
 * do contorno.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const OUT = join(ROOT, "src", "components", "body-map", "muscle-paths.ts");

const BASE = "https://raw.githubusercontent.com/HichamELBSI/react-native-body-highlighter/main";

/**
 * Slug da origem → valor de `muscle_t`.
 *
 * `null` = não é músculo destacável; entra na silhueta e nunca acende.
 *
 * Duas perdas de resolução que vale registrar:
 *
 * - A origem tem um único `deltoids`. O banco distingue anterior, lateral e
 *   posterior. Na **frente** o desenho corresponde ao anterior/lateral; nas
 *   **costas**, ao posterior. O mapeamento reflete isso, e é o mais fiel
 *   possível sem redesenhar o ombro em três partes.
 * - `upper-back` cobre dorsais e costas médias juntos. Ambos apontam para ele.
 */
const FRONT_MAP = {
  chest: ["chest"],
  abs: ["abs", "core"],
  obliques: ["obliques"],
  biceps: ["biceps"],
  triceps: ["triceps"],
  forearm: ["forearms"],
  deltoids: ["front_delts", "side_delts", "shoulders"],
  trapezius: ["traps"],
  quadriceps: ["quads"],
  adductors: ["adductors", "abductors"],
  calves: ["calves"],
  tibialis: [],
  neck: ["neck"],
  head: null,
  hair: null,
  hands: null,
  feet: null,
  knees: null,
  ankles: null,
};

const BACK_MAP = {
  "upper-back": ["back", "lats"],
  "lower-back": ["lower_back"],
  trapezius: ["traps"],
  deltoids: ["rear_delts", "shoulders"],
  triceps: ["triceps"],
  forearm: ["forearms"],
  gluteal: ["glutes"],
  hamstring: ["hamstrings"],
  adductors: ["adductors", "abductors"],
  calves: ["calves"],
  neck: ["neck"],
  head: null,
  hair: null,
  hands: null,
  feet: null,
  ankles: null,
};

async function get(path) {
  const res = await fetch(`${BASE}/${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${path}`);
  return res.text();
}

/**
 * Extrai os grupos de um arquivo de assets da origem.
 *
 * Parsing por expressão regular em vez de importar o módulo: o arquivo é TS com
 * um import relativo que não resolve fora do projeto dele, e transpilar só para
 * ler dados seria desproporcional.
 */
function parseBodyParts(source) {
  const grupos = [];

  // Cada bloco começa em `slug:` e vai até o próximo — ou até o fim.
  const blocos = source.split(/\n\s*\{\s*\n\s*slug:/).slice(1);

  for (const bloco of blocos) {
    const slugMatch = bloco.match(/^\s*"([a-z-]+)"/);
    if (!slugMatch) continue;
    const slug = slugMatch[1];

    const left = extrairLado(bloco, "left");
    const right = extrairLado(bloco, "right");
    // Alguns grupos (abdômen, pescoço) não têm lados: os paths ficam soltos.
    const soltos = left.length === 0 && right.length === 0 ? extrairTodos(bloco) : [];

    grupos.push({ slug, paths: [...left, ...right, ...soltos] });
  }

  return grupos;
}

function extrairLado(bloco, lado) {
  const re = new RegExp(`${lado}:\\s*\\[([^\\]]*)\\]`, "s");
  const m = bloco.match(re);
  if (!m) return [];
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

function extrairTodos(bloco) {
  // Só o que parece caminho SVG — evita capturar cores hexadecimais e slugs.
  return [...bloco.matchAll(/"(M[\d\s.,a-zA-Z-]{40,})"/g)].map((x) => x[1]);
}

/** Junta os grupos por músculo do banco, resolvendo os apelidos do mapa. */
function agrupar(partes, mapa, view) {
  const porMusculo = new Map();
  const silhueta = [];

  for (const { slug, paths } of partes) {
    if (!(slug in mapa)) {
      console.warn(`  ⚠ slug desconhecido em ${view}: ${slug}`);
      continue;
    }

    const musculos = mapa[slug];
    if (musculos === null || musculos.length === 0) {
      // Não é músculo destacável, mas faz parte do corpo: entra na silhueta,
      // senão a figura teria buracos no lugar das mãos e da cabeça.
      silhueta.push(...paths);
      continue;
    }

    for (const musculo of musculos) {
      const atual = porMusculo.get(musculo) ?? [];
      // Vários slugs podem apontar para o mesmo músculo; `Set` evita desenhar
      // o mesmo caminho duas vezes (custo de render e serrilhado na borda).
      porMusculo.set(musculo, [...new Set([...atual, ...paths])]);
    }
  }

  return { porMusculo, silhueta };
}

// ---------------------------------------------------------------- execução

console.log("Baixando a figura anatômica…");

const [frontSrc, backSrc, wrapperSrc] = await Promise.all([
  get("assets/bodyFront.ts"),
  get("assets/bodyBack.ts"),
  get("components/SvgMaleWrapper.tsx"),
]);

const contornos = [...wrapperSrc.matchAll(/d="(M[^"]+)"/g)].map((m) => m[1]);
if (contornos.length < 2) throw new Error("Contornos não encontrados no wrapper.");

const front = agrupar(parseBodyParts(frontSrc), FRONT_MAP, "frente");
const back = agrupar(parseBodyParts(backSrc), BACK_MAP, "costas");

const serialize = (mapa) =>
  [...mapa.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([musculo, paths]) =>
        `  ${musculo}: [\n${paths.map((p) => `    ${JSON.stringify(p)},`).join("\n")}\n  ],`,
    )
    .join("\n");

const arquivo = `/**
 * Geometria do mapa muscular — GERADO por scripts/catalog/build-body-map.mjs.
 *
 * NÃO EDITE À MÃO. Para mudar o mapeamento de músculos, altere FRONT_MAP /
 * BACK_MAP no script e rode-o de novo.
 *
 * ## Origem
 *
 * Figura anatômica de \`react-native-body-highlighter\`
 * (https://github.com/HichamELBSI/react-native-body-highlighter), licença MIT.
 *
 * A primeira versão deste mapa foi desenhada à mão e ficou ruim — silhueta
 * borrada, músculos sem relação com anatomia. Desenhar um corpo humano
 * reconhecível é trabalho de ilustrador; adotar uma figura pronta e boa custa
 * uma linha de atribuição e entrega o que o usuário espera ver.
 *
 * ## Sistema de coordenadas
 *
 * As duas vistas vivem no mesmo espaço de 1448×1448: a frente ocupa x 0–724 e
 * as costas, x 724–1448. Cada vista é renderizada com o seu próprio viewBox.
 */

export type BodyView = "front" | "back";

/** viewBox de cada vista, dentro do espaço compartilhado. */
export const VIEW_BOX: Record<BodyView, string> = {
  front: "0 0 724 1448",
  back: "724 0 724 1448",
};

/** Contorno do corpo — traçado, não preenchido. Dá a linha da figura. */
export const BODY_OUTLINE: Record<BodyView, string> = {
  front: ${JSON.stringify(contornos[0])},
  back: ${JSON.stringify(contornos[1])},
};

/**
 * Partes que compõem a silhueta e nunca acendem: cabeça, mãos, pés,
 * articulações. Sem elas a figura teria buracos.
 */
export const SILHOUETTE_PARTS: Record<BodyView, readonly string[]> = {
  front: [
${front.silhueta.map((p) => `    ${JSON.stringify(p)},`).join("\n")}
  ],
  back: [
${back.silhueta.map((p) => `    ${JSON.stringify(p)},`).join("\n")}
  ],
};

/** Caminhos por músculo (valores de \`muscle_t\`), na vista da frente. */
export const FRONT_MUSCLES: Record<string, readonly string[]> = {
${serialize(front.porMusculo)}
};

/** Caminhos por músculo, na vista de costas. */
export const BACK_MUSCLES: Record<string, readonly string[]> = {
${serialize(back.porMusculo)}
};

export const MUSCLES_BY_VIEW: Record<BodyView, Record<string, readonly string[]>> = {
  front: FRONT_MUSCLES,
  back: BACK_MUSCLES,
};

/** Todos os músculos que a figura sabe destacar, em qualquer vista. */
export const DRAWN_MUSCLES = new Set([
  ...Object.keys(FRONT_MUSCLES),
  ...Object.keys(BACK_MUSCLES),
]);

/**
 * Músculos do banco que a figura não desenha separadamente, mapeados para o
 * grupo visível mais próximo.
 *
 * Em vez de perder o destaque, o estímulo é transferido — um treino de
 * \`full_body\` não pode resultar num boneco apagado.
 */
export const MUSCLE_ALIASES: Record<string, string> = {
  cardio: "quads",
  full_body: "chest",
};

/** Resolve um valor de \`muscle_t\` para o grupo desenhável correspondente. */
export function resolveMuscle(muscle: string): string | null {
  if (DRAWN_MUSCLES.has(muscle)) return muscle;
  const alias = MUSCLE_ALIASES[muscle];
  return alias && DRAWN_MUSCLES.has(alias) ? alias : null;
}

/** Em qual vista um músculo aparece — usado para abrir a figura no lado certo. */
export function viewOf(muscle: string): BodyView | null {
  if (muscle in FRONT_MUSCLES) return "front";
  if (muscle in BACK_MUSCLES) return "back";
  return null;
}
`;

writeFileSync(OUT, arquivo, "utf8");

console.log(`\nEscrito: ${OUT}`);
console.log(
  `  frente: ${front.porMusculo.size} músculos, ${front.silhueta.length} partes de silhueta`,
);
console.log(
  `  costas: ${back.porMusculo.size} músculos, ${back.silhueta.length} partes de silhueta`,
);
console.log(`  ${(arquivo.length / 1024).toFixed(0)} KB`);
console.log(`\n  frente: ${[...front.porMusculo.keys()].sort().join(", ")}`);
console.log(`  costas: ${[...back.porMusculo.keys()].sort().join(", ")}`);
