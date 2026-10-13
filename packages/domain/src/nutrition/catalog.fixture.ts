import { CURATED_FOODS } from "./curated-foods";
import { buildCatalog, type CatalogFood, type CatalogRow } from "./food-catalog";

/**
 * Catálogo de teste com os valores reais (por 100 g) da TACO e do catálogo
 * local — um por conceito curado. Usado só nos testes.
 */
const MACROS: Record<string, [string, number, number, number, number, number]> = {
  // conceito: [id, kcal, proteína, carboidrato, gordura, fibra]
  "arroz-branco": ["taco:3", 128.26, 2.52, 28.06, 0.23, 1.56],
  "arroz-integral": ["taco:1", 123.53, 2.59, 25.81, 1, 2.75],
  "batata-inglesa": ["taco:91", 51.59, 1.16, 11.94, 0, 1.34],
  "batata-doce": ["taco:88", 76.76, 0.64, 18.42, 0.09, 2.21],
  mandioca: ["taco:129", 125.36, 0.57, 30.09, 0.3, 1.56],
  macarrao: ["forja:macarrao", 158, 5.8, 30.9, 0.9, 1.8],
  "pao-frances": ["taco:53", 299.81, 7.95, 58.65, 3.1, 2.31],
  "pao-integral": ["taco:52", 253.19, 9.43, 49.94, 3.65, 6.88],
  aveia: ["taco:7", 393.82, 13.92, 66.64, 8.5, 9.13],
  tapioca: ["forja:tapioca", 240, 0.1, 59.4, 0, 0.6],
  "fecula-mandioca": ["taco:124", 330.85, 0.52, 81.15, 0.28, 0.65],
  cuscuz: ["taco:533", 113.46, 2.16, 25.28, 0.68, 2.05],
  "frango-grelhado": ["taco:410", 159.19, 32.03, 0, 2.48, 0],
  "frango-cozido": ["taco:408", 162.87, 31.47, 0, 3.16, 0],
  "frango-coxa": ["taco:398", 167.43, 26.86, 0, 5.85, 0],
  patinho: ["taco:377", 219.26, 35.9, 0, 7.31, 0],
  "carne-moida": ["taco:326", 212.42, 26.69, 0, 10.92, 0],
  musculo: ["taco:371", 193.8, 31.23, 0, 6.7, 0],
  "contra-file": ["taco:346", 193.69, 35.88, 0, 4.49, 0],
  "coxao-mole": ["taco:351", 218.68, 32.38, 0, 8.91, 0],
  tilapia: ["forja:tilapia", 128, 26.2, 0, 2.7, 0],
  merluza: ["taco:301", 121.91, 26.6, 0, 0.92, 0],
  sardinha: ["taco:318", 164.35, 32.18, 0, 2.99, 0],
  salmao: ["taco:317", 242.71, 26.14, 0, 14.53, 0],
  atum: ["forja:atum-agua", 116, 25.5, 0, 1, 0],
  "ovo-cozido": ["taco:488", 145.7, 13.29, 0.61, 9.48, 0],
  "ovo-mexido": ["taco:489", 143.11, 13.03, 1.64, 8.9, 0],
  clara: ["taco:486", 59.44, 13.45, 0, 0.09, 0],
  leite: ["name:Leite integral", 58, 3.2, 4.6, 3.3, 0],
  "leite-desnatado": ["forja:leite-desnatado", 35, 3.4, 4.9, 0.2, 0],
  iogurte: ["taco:448", 51.49, 4.06, 1.92, 3.04, 0],
  "iogurte-desnatado": ["taco:449", 41.49, 3.83, 5.77, 0.32, 0],
  "queijo-minas": ["taco:461", 264.27, 17.41, 3.24, 20.18, 0],
  ricota: ["taco:469", 139.73, 12.6, 3.79, 8.11, 0],
  mozarela: ["taco:463", 329.87, 22.65, 3.05, 25.18, 0],
  cottage: ["forja:cottage", 98, 11.1, 3.4, 4.3, 0],
  "feijao-carioca": ["taco:561", 76.42, 4.78, 13.59, 0.54, 8.51],
  "feijao-preto": ["taco:567", 77.03, 4.48, 14.01, 0.54, 8.4],
  "feijao-fradinho": ["taco:563", 78.01, 5.09, 13.5, 0.64, 7.47],
  "feijao-roxo": ["taco:573", 76.89, 5.72, 12.91, 0.54, 11.51],
  "feijao-rajado": ["taco:569", 84.7, 5.54, 15.27, 0.4, 9.32],
  tofu: ["taco:584", 64.49, 6.55, 2.13, 3.95, 0.75],
  "bebida-soja": ["taco:582", 39.1, 2.38, 4.28, 1.61, 0.37],
  lentilha: ["taco:577", 92.64, 6.31, 16.3, 0.52, 7.86],
  "grao-de-bico": ["forja:grao-de-bico", 164, 8.9, 27.4, 2.6, 7.6],
  alface: ["taco:78", 10.68, 1.35, 1.7, 0.16, 1.83],
  tomate: ["taco:157", 15.34, 1.1, 3.14, 0.17, 1.17],
  brocolis: ["taco:100", 24.64, 2.13, 4.37, 0.46, 3.42],
  cenoura: ["taco:110", 34.14, 1.32, 7.66, 0.17, 3.18],
  "cenoura-cozida": ["taco:109", 29.86, 0.85, 6.69, 0.22, 2.63],
  abobrinha: ["taco:70", 15.04, 1.13, 2.98, 0.2, 1.59],
  couve: ["taco:116", 90.34, 1.67, 8.71, 6.59, 5.74],
  chuchu: ["taco:112", 18.54, 0.41, 4.79, 0, 1.04],
  beterraba: ["taco:97", 32.15, 1.29, 7.23, 0.09, 1.88],
  pepino: ["taco:142", 9.53, 0.87, 2.04, 0, 1.12],
  repolho: ["taco:149", 17.12, 0.88, 3.86, 0.14, 1.89],
  "couve-flor": ["taco:118", 19.11, 1.24, 3.88, 0.27, 2.13],
  berinjela: ["taco:95", 18.85, 0.68, 4.47, 0.15, 2.52],
  abobora: ["taco:64", 48.04, 1.44, 10.76, 0.73, 2.46],
  banana: ["taco:182", 98.25, 1.27, 25.96, 0.07, 2.04],
  "banana-nanica": ["taco:179", 91.53, 1.4, 23.85, 0.12, 1.95],
  maca: ["taco:222", 55.52, 0.29, 15.15, 0, 1.35],
  mamao: ["taco:226", 40.16, 0.46, 10.44, 0.12, 1.04],
  laranja: ["taco:214", 36.77, 1.04, 8.95, 0.13, 0.77],
  morango: ["taco:239", 30.15, 0.89, 6.82, 0.31, 1.72],
  manga: ["taco:231", 50.69, 0.86, 12.77, 0.22, 2.07],
  melancia: ["taco:235", 32.61, 0.88, 8.14, 0, 0.12],
  melao: ["taco:236", 29.37, 0.68, 7.53, 0, 0.25],
  abacaxi: ["taco:164", 48.32, 0.86, 12.33, 0.12, 0.99],
  goiaba: ["taco:200", 54.17, 1.09, 13.01, 0.44, 6.22],
  kiwi: ["taco:207", 51.14, 1.34, 11.5, 0.63, 2.65],
  tangerina: ["taco:251", 37.83, 0.85, 9.61, 0.07, 0.94],
  uva: ["taco:256", 52.87, 0.75, 13.57, 0.2, 0.92],
  abacate: ["taco:163", 96.15, 1.24, 6.03, 8.4, 6.31],
  azeite: ["taco:260", 884, 0, 0, 100, 0],
  "castanha-do-para": ["taco:589", 642.96, 14.54, 15.08, 63.46, 7.93],
  "castanha-de-caju": ["taco:588", 570.17, 18.51, 29.13, 46.28, 3.66],
  amendoa: ["taco:587", 580.75, 18.55, 29.55, 47.32, 11.64],
  amendoim: ["taco:558", 605.78, 22.48, 18.7, 53.96, 7.76],
  "pasta-amendoim": ["forja:pasta-amendoim", 588, 25, 20, 50, 6],
};

export function rowFor(key: string): CatalogRow {
  const [id, kcal, proteinG, carbsG, fatG, fiberG] = MACROS[key]!;
  const porNome = id.startsWith("name:");
  return {
    id: key,
    name: porNome ? id.slice(5) : key,
    category: "other",
    kcal,
    proteinG,
    carbsG,
    fatG,
    fiberG,
    popularity: 50,
    externalId: porNome ? null : id,
    isPublic: true,
  };
}

/** Catálogo completo de teste (um alimento por conceito curado). */
export const TEST_CATALOG: CatalogFood[] = buildCatalog(
  CURATED_FOODS.map((f) => rowFor(f.key)),
).foods;

export const byKey = (key: string): CatalogFood => {
  const f = TEST_CATALOG.find((x) => x.profile.key === key);
  if (!f) throw new Error(`Conceito ausente no catálogo de teste: ${key}`);
  return f;
};
