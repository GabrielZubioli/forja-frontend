import { foodRole, type FoodCandidate, type FoodRole } from "./food-catalog";

/**
 * Substituições de alimento.
 *
 * ## O problema que resolve
 *
 * O plano manda comer tilápia. A pessoa não tem tilápia. Sem substituição, ela
 * come outra coisa qualquer e o plano deixa de descrever a realidade — ou,
 * pior, ela não come nada e abandona a dieta. É a causa mais banal de fracasso
 * de plano alimentar, e a que menos apps tratam bem.
 *
 * ## Como funciona
 *
 * Duas etapas, nesta ordem, porque a ordem inversa produz absurdos:
 *
 * 1. **Ajusta a quantidade** do substituto para igualar o *macro dominante* do
 *    original. Trocar 150 g de frango por 150 g de feijão não é substituir — é
 *    trocar 45 g de proteína por 7 g. O que se preserva é o papel nutricional,
 *    e para isso a quantidade tem de mudar.
 *
 * 2. **Pontua a distância** dos macros restantes naquela quantidade ajustada.
 *
 * ## Por que não busca só "calorias parecidas"
 *
 * Porque 100 g de azeite e 900 g de brócolis têm as mesmas calorias. Igualdade
 * calórica sem igualdade de papel é uma coincidência aritmética, não uma
 * substituição.
 */

export interface Substitution {
  food: FoodCandidate;
  /** Quantidade que preserva o macro dominante do original. */
  grams: number;
  /**
   * Distância dos macros, 0 = idêntico. Acima de ~0,35 a troca começa a mudar
   * a refeição de forma perceptível.
   */
  distance: number;
  /** Diferenças absolutas, para a UI mostrar o custo da troca. */
  delta: { kcal: number; proteinG: number; carbsG: number; fatG: number };
}

export interface SubstitutionOptions {
  /** Quantos resultados devolver. */
  limit?: number;
  /**
   * IDs que o usuário já escolheu antes para este alimento. Sobem ao topo:
   * quem trocou tilápia por frango três vezes quer frango na quarta.
   */
  preferredIds?: readonly string[];
  /**
   * Exige o mesmo papel nutricional. Ligado por padrão — é o que impede
   * "substituir arroz por azeite".
   */
  sameRoleOnly?: boolean;
}

/** Macro que define o alimento — aquele que responde pela maior fatia das calorias. */
function dominantMacro(food: FoodCandidate): {
  key: "proteinG" | "carbsG" | "fatG";
  per100: number;
} {
  const p = food.proteinG * 4;
  const c = food.carbsG * 4;
  const f = food.fatG * 9;

  if (p >= c && p >= f) return { key: "proteinG", per100: food.proteinG };
  if (c >= f) return { key: "carbsG", per100: food.carbsG };
  return { key: "fatG", per100: food.fatG };
}

/**
 * Distância entre dois conjuntos de macros, normalizada.
 *
 * Cada macro é comparado em relação à própria escala do original, e não em
 * gramas absolutas: errar 10 g de gordura (90 kcal) importa muito mais que
 * errar 10 g de carboidrato (40 kcal), e uma diferença absoluta trataria os
 * dois como iguais.
 *
 * A proteína pesa o dobro. Para quem treina, ela é o macro cuja falha muda o
 * resultado — carboidrato e gordura se compensam ao longo do dia; proteína não.
 */
function macroDistance(
  original: { proteinG: number; carbsG: number; fatG: number; kcal: number },
  candidate: { proteinG: number; carbsG: number; fatG: number; kcal: number },
): number {
  const rel = (a: number, b: number, escala: number) => Math.abs(a - b) / Math.max(escala, 1);

  const base = Math.max(original.kcal / 4, 10);
  const dProt = rel(
    original.proteinG,
    candidate.proteinG,
    Math.max(original.proteinG, base * 0.15),
  );
  const dCarb = rel(original.carbsG, candidate.carbsG, Math.max(original.carbsG, base * 0.3));
  const dFat = rel(original.fatG, candidate.fatG, Math.max(original.fatG, base * 0.1));
  const dKcal = rel(original.kcal, candidate.kcal, Math.max(original.kcal, 50));

  return (dProt * 2 + dCarb + dFat + dKcal * 1.5) / 5.5;
}

const macrosAt = (food: FoodCandidate, grams: number) => {
  const f = grams / 100;
  return {
    kcal: food.kcal * f,
    proteinG: food.proteinG * f,
    carbsG: food.carbsG * f,
    fatG: food.fatG * f,
  };
};

/**
 * Chave de ordenação — separada de `distance`, que é a medida honesta.
 *
 * Um alimento que o usuário já escolheu para esta troca entra num tier próprio
 * e vem primeiro: a decisão dele sobre o que tem em casa vale mais que a
 * proximidade teórica de macros. Dentro de cada tier, ordena por proximidade,
 * com desempate suave por popularidade.
 */
function rankKey(sub: Substitution, preferidos: ReadonlySet<string>): number {
  const tier = preferidos.has(sub.food.id) ? 0 : 1;
  return tier * 1000 + sub.distance - (sub.food.popularity / 100) * 0.05;
}

/** Arredonda para uma quantidade que dá para executar na cozinha. */
function usableGrams(grams: number, role: FoodRole): number {
  const step = role === "fat" ? 1 : 5;
  const max = role === "fat" ? 100 : 600;
  return Math.max(step, Math.min(max, Math.round(grams / step) * step));
}

/**
 * Substitutos para um alimento numa dada quantidade, do mais próximo ao mais
 * distante.
 */
export function findSubstitutions(
  original: FoodCandidate,
  originalGrams: number,
  pool: readonly FoodCandidate[],
  options: SubstitutionOptions = {},
): Substitution[] {
  const { limit = 8, preferredIds = [], sameRoleOnly = true } = options;

  const alvoRole = foodRole(original);
  const alvoMacros = macrosAt(original, originalGrams);
  const dominante = dominantMacro(original);
  const alvoDominante = dominante.per100 * (originalGrams / 100);

  const preferidos = new Set(preferredIds);

  return (
    pool
      .filter((f) => f.id !== original.id)
      .filter((f) => !sameRoleOnly || foodRole(f) === alvoRole)
      .map((f) => {
        const per100 = f[dominante.key];

        // Sem o macro dominante, o candidato não consegue cumprir o papel em
        // nenhuma quantidade razoável — cair no peso original produziria uma
        // "substituição" que muda tudo.
        const grams =
          per100 > 0.5
            ? usableGrams((alvoDominante / per100) * 100, alvoRole)
            : usableGrams(originalGrams, alvoRole);

        const macros = macrosAt(f, grams);
        const distance = macroDistance(alvoMacros, macros);

        return {
          food: f,
          grams,
          distance,
          delta: {
            kcal: Math.round(macros.kcal - alvoMacros.kcal),
            proteinG: Math.round((macros.proteinG - alvoMacros.proteinG) * 10) / 10,
            carbsG: Math.round((macros.carbsG - alvoMacros.carbsG) * 10) / 10,
            fatG: Math.round((macros.fatG - alvoMacros.fatG) * 10) / 10,
          },
        };
      })
      // A ordenação é separada da medida de propósito. Embutir a preferência do
      // usuário dentro de `distance` a promoveria na lista **e** mentiria sobre a
      // troca: `describeSubstitution` chamaria de "praticamente equivalente" um
      // substituto que muda 20 g de gordura, só porque foi escolhido antes.
      // Preferência decide a ordem; `distance` continua dizendo a verdade.
      .sort((a, b) => rankKey(a, preferidos) - rankKey(b, preferidos))
      .slice(0, limit)
  );
}

/**
 * Como descrever a troca para o usuário.
 *
 * Um número de "distância" não significa nada para quem quer saber se pode
 * trocar. A frase traduz para a única pergunta que importa.
 */
export function describeSubstitution(sub: Substitution): string {
  if (sub.distance < 0.12) return "Praticamente equivalente";
  if (sub.distance < 0.25) return "Muito próximo";
  if (sub.distance < 0.45) return "Próximo, com pequeno ajuste nos macros";
  return "Aproximado — vai mexer nos macros do dia";
}
