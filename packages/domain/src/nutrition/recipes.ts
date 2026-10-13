import type { CulinaryRole } from "./curated-foods";
import type { MealSlot } from "./meal-slots";
import { nutritionTotals, perServing, type MacroTotals, type Portion } from "./totals";

/**
 * Receitas — a unidade de geração das refeições.
 *
 * Uma receita aqui é uma composição culinária reconhecível ("arroz, feijão,
 * proteína e salada"), não uma lista de macros. Cada ingrediente diz o
 * **papel** que ocupa, como a quantidade é decidida e, quando a receita pede,
 * quais alimentos servem. O gerador escolhe os alimentos dentro do pool seguro
 * (alergias e dieta já aplicadas a cada ingrediente) e calcula as gramas.
 *
 * Os macros nunca são escritos à mão: saem dos ingredientes reais via
 * `nutritionTotals`, a mesma função do diário.
 *
 * ⚠️ Os padrões são sugestões de composição para revisão de nutricionista,
 * não prescrição.
 */

/** Como a quantidade do ingrediente é decidida. */
export type Sizing =
  /** Porção padrão do alimento (vegetal, fruta, tempero, acompanhamento). */
  | "fixed"
  /** Fecha a proteína da refeição, descontando a que os outros já trazem. */
  | "protein"
  /** Fecha as calorias que sobram — a base flexível da refeição. */
  | "energy";

export interface RecipeComponent {
  role: CulinaryRole;
  sizing: Sizing;
  /** Conceitos permitidos (`FoodProfile.key`). Ausente = qualquer um do papel. */
  only?: readonly string[];
  /** Sem candidato seguro, a receita segue sem este ingrediente. */
  optional?: boolean;
}

export interface MealRecipe {
  id: string;
  name: string;
  slots: readonly MealSlot[];
  components: readonly RecipeComponent[];
  /**
   * Só entra quando nenhuma outra receita do horário é viável — o prato sem
   * proteína animal, por exemplo, que é o certo para quem é vegano e
   * proteína baixa para quem não é.
   */
  fallback?: boolean;
}

const RICE = ["arroz-branco", "arroz-integral"];
const BEANS = ["feijao-carioca", "feijao-preto", "feijao-fradinho", "feijao-roxo", "feijao-rajado"];
const TUBERS = ["batata-inglesa", "batata-doce", "mandioca"];
const BREADS = ["pao-frances", "pao-integral"];
const CHEESE = ["queijo-minas", "ricota", "mozarela", "cottage"];
const MILK = ["leite", "leite-desnatado", "bebida-soja"];
const YOGURT = ["iogurte", "iogurte-desnatado"];
const SALAD = ["alface", "tomate", "pepino", "repolho", "cenoura"];
const COOKED_VEG = [
  "brocolis",
  "cenoura-cozida",
  "abobrinha",
  "couve",
  "chuchu",
  "beterraba",
  "couve-flor",
  "berinjela",
  "abobora",
];

const comp = (
  role: CulinaryRole,
  sizing: Sizing,
  extra: { only?: readonly string[]; optional?: boolean } = {},
): RecipeComponent => ({ role, sizing, ...extra });

const MAIN: MealSlot[] = ["lunch", "dinner"];
const SNACKS: MealSlot[] = ["morning_snack", "afternoon_snack"];

export const MEAL_RECIPES: readonly MealRecipe[] = [
  // ---------------------------------------------------------- café da manhã
  {
    id: "pao-ovo-fruta",
    name: "Pão com ovo e fruta",
    slots: ["breakfast"],
    components: [
      comp("bread", "energy", { only: BREADS }),
      comp("protein", "protein", { only: ["ovo-cozido", "ovo-mexido"] }),
      comp("fruit", "fixed", { optional: true }),
    ],
  },
  {
    id: "pao-queijo-cafe-leite",
    name: "Pão com queijo e café com leite",
    slots: ["breakfast"],
    components: [
      comp("bread", "energy", { only: BREADS }),
      comp("dairy", "fixed", { only: CHEESE }),
      comp("dairy", "fixed", { only: MILK }),
    ],
  },
  {
    id: "iogurte-aveia-fruta",
    name: "Iogurte com aveia e fruta",
    slots: ["breakfast", "morning_snack", "afternoon_snack", "post_workout"],
    components: [
      comp("dairy", "fixed", { only: YOGURT }),
      comp("bread", "energy", { only: ["aveia"] }),
      comp("fruit", "fixed"),
    ],
  },
  {
    id: "cuscuz-ovo",
    name: "Cuscuz com ovo",
    slots: ["breakfast"],
    components: [
      comp("bread", "energy", { only: ["cuscuz"] }),
      comp("protein", "protein", { only: ["ovo-cozido", "ovo-mexido"] }),
      comp("fruit", "fixed", { optional: true }),
    ],
  },
  {
    id: "tapioca-recheada",
    name: "Tapioca recheada",
    slots: ["breakfast", "afternoon_snack"],
    components: [
      comp("bread", "energy", { only: ["tapioca", "fecula-mandioca"] }),
      comp("protein", "protein", { only: ["frango-cozido", "ovo-mexido", "ovo-cozido"] }),
      comp("dairy", "fixed", { only: ["queijo-minas", "mozarela"], optional: true }),
    ],
  },
  {
    id: "vitamina-aveia",
    name: "Vitamina de fruta com aveia",
    slots: ["breakfast", "morning_snack", "afternoon_snack", "pre_workout", "post_workout"],
    components: [
      comp("dairy", "fixed", { only: MILK }),
      comp("fruit", "fixed", {
        only: ["banana", "banana-nanica", "mamao", "morango", "manga", "abacate"],
      }),
      comp("bread", "energy", { only: ["aveia"] }),
    ],
  },
  {
    id: "pao-pasta-amendoim-fruta",
    name: "Pão com pasta de amendoim e fruta",
    slots: ["breakfast", "afternoon_snack", "pre_workout"],
    components: [
      comp("bread", "energy", { only: BREADS }),
      comp("nuts", "fixed", { only: ["pasta-amendoim"] }),
      comp("fruit", "fixed"),
    ],
  },
  {
    id: "aveia-fruta-castanhas",
    name: "Aveia com fruta e castanhas",
    slots: ["breakfast", "morning_snack", "afternoon_snack"],
    components: [
      comp("bread", "energy", { only: ["aveia"] }),
      comp("fruit", "fixed"),
      comp("nuts", "fixed", { optional: true }),
    ],
  },

  // ----------------------------------------------------------------- lanches
  {
    id: "fruta-iogurte",
    name: "Fruta com iogurte",
    slots: [...SNACKS, "supper"],
    components: [comp("dairy", "fixed", { only: YOGURT }), comp("fruit", "energy")],
  },
  {
    id: "fruta-castanhas",
    name: "Fruta com castanhas",
    slots: [...SNACKS, "supper"],
    components: [comp("fruit", "energy"), comp("nuts", "fixed")],
  },
  {
    id: "fruta-queijo",
    name: "Fruta com queijo branco",
    slots: [...SNACKS, "supper"],
    components: [
      comp("fruit", "energy"),
      comp("dairy", "fixed", { only: ["queijo-minas", "ricota", "cottage"] }),
    ],
  },
  {
    id: "sanduiche-simples",
    name: "Sanduíche simples",
    slots: ["afternoon_snack", "post_workout"],
    components: [
      comp("bread", "energy", { only: BREADS }),
      comp("protein", "protein", {
        only: ["frango-cozido", "frango-grelhado", "atum", "ovo-cozido"],
      }),
      comp("vegetable", "fixed", { only: ["tomate"], optional: true }),
    ],
  },
  {
    id: "sanduiche-queijo",
    name: "Sanduíche de queijo",
    slots: SNACKS,
    components: [
      comp("bread", "energy", { only: BREADS }),
      comp("dairy", "fixed", { only: CHEESE }),
    ],
  },
  {
    id: "ovos-fruta",
    name: "Ovos cozidos com fruta",
    slots: ["afternoon_snack", "post_workout"],
    components: [comp("protein", "protein", { only: ["ovo-cozido"] }), comp("fruit", "energy")],
  },

  // ------------------------------------------------------------ pré-treino
  {
    id: "fruta-aveia",
    name: "Fruta com aveia",
    slots: ["pre_workout", "morning_snack"],
    components: [comp("fruit", "fixed"), comp("bread", "energy", { only: ["aveia"] })],
  },
  {
    id: "pao-com-fruta",
    name: "Pão com banana",
    slots: ["pre_workout"],
    components: [
      comp("bread", "energy", { only: BREADS }),
      comp("fruit", "fixed", { only: ["banana", "banana-nanica"] }),
    ],
  },
  {
    id: "tapioca-fruta",
    name: "Tapioca com fruta",
    slots: ["breakfast", "pre_workout"],
    components: [
      comp("bread", "energy", { only: ["tapioca", "fecula-mandioca"] }),
      comp("fruit", "fixed"),
    ],
  },
  {
    id: "batata-doce-pre",
    name: "Batata-doce com fruta",
    slots: ["pre_workout"],
    components: [
      comp("starch", "energy", { only: ["batata-doce"] }),
      comp("fruit", "fixed", { optional: true }),
    ],
  },

  {
    id: "fruta",
    name: "Fruta",
    slots: [...SNACKS, "pre_workout", "supper"],
    fallback: true,
    components: [comp("fruit", "energy")],
  },

  // ------------------------------------------------------------------ ceia
  {
    id: "iogurte-ceia",
    name: "Iogurte natural",
    slots: ["supper"],
    components: [comp("dairy", "energy", { only: YOGURT })],
  },
  {
    id: "leite-aveia-ceia",
    name: "Leite com aveia",
    slots: ["supper"],
    components: [
      comp("dairy", "fixed", { only: MILK }),
      comp("bread", "energy", { only: ["aveia"] }),
    ],
  },

  // ---------------------------------------------------------- almoço e jantar
  {
    id: "arroz-feijao-proteina-salada",
    name: "Arroz, feijão, proteína e salada",
    slots: MAIN,
    components: [
      comp("starch", "energy", { only: RICE }),
      comp("legume", "fixed", { only: BEANS }),
      comp("protein", "protein"),
      comp("vegetable", "fixed", { only: SALAD }),
      comp("vegetable", "fixed", { only: SALAD, optional: true }),
      comp("fat", "fixed", { optional: true }),
    ],
  },
  {
    id: "arroz-feijao-proteina-legumes",
    name: "Arroz, feijão, proteína e legumes",
    slots: MAIN,
    components: [
      comp("starch", "energy", { only: RICE }),
      comp("legume", "fixed", { only: BEANS }),
      comp("protein", "protein"),
      comp("vegetable", "fixed", { only: COOKED_VEG }),
      comp("fat", "fixed", { optional: true }),
    ],
  },
  {
    id: "arroz-lentilha-proteina",
    name: "Arroz com lentilha, proteína e legumes",
    slots: MAIN,
    components: [
      comp("starch", "energy", { only: RICE }),
      comp("legume", "fixed", { only: ["lentilha", "grao-de-bico"] }),
      comp("protein", "protein"),
      comp("vegetable", "fixed", { only: COOKED_VEG }),
      comp("fat", "fixed", { optional: true }),
    ],
  },
  {
    id: "tuberculo-proteina-legumes",
    name: "Batata ou mandioca com proteína e legumes",
    slots: MAIN,
    components: [
      comp("starch", "energy", { only: TUBERS }),
      comp("protein", "protein"),
      comp("vegetable", "fixed", { only: COOKED_VEG }),
      comp("vegetable", "fixed", { only: SALAD, optional: true }),
      comp("fat", "fixed", { optional: true }),
    ],
  },
  {
    id: "macarrao-proteina",
    name: "Macarrão com carne ou frango e salada",
    slots: MAIN,
    components: [
      comp("starch", "energy", { only: ["macarrao"] }),
      comp("protein", "protein", {
        only: ["carne-moida", "frango-cozido", "frango-grelhado", "patinho"],
      }),
      comp("vegetable", "fixed", { only: SALAD }),
      comp("fat", "fixed", { optional: true }),
    ],
  },
  {
    id: "cuscuz-jantar",
    name: "Cuscuz com ovos e salada",
    slots: ["dinner"],
    components: [
      comp("bread", "energy", { only: ["cuscuz"] }),
      comp("protein", "protein", { only: ["ovo-cozido", "ovo-mexido", "frango-cozido"] }),
      comp("vegetable", "fixed", { only: SALAD }),
    ],
  },
  {
    id: "arroz-feijao-legumes-vegetal",
    name: "Arroz, feijão e legumes",
    slots: MAIN,
    fallback: true,
    components: [
      comp("starch", "energy", { only: RICE }),
      comp("legume", "protein"),
      comp("vegetable", "fixed", { only: COOKED_VEG }),
      comp("vegetable", "fixed", { only: SALAD, optional: true }),
      comp("fat", "fixed", { optional: true }),
    ],
  },
  {
    // Sem base de amido (baixo carboidrato): a proteína fecha as calorias,
    // dentro do teto de porção — se não couber, o desvio é informado.
    id: "proteina-legumes-salada",
    name: "Proteína com legumes e salada",
    slots: MAIN,
    fallback: true,
    components: [
      comp("protein", "energy"),
      comp("legume", "fixed", { optional: true }),
      comp("vegetable", "fixed", { only: COOKED_VEG }),
      comp("vegetable", "fixed", { only: SALAD, optional: true }),
      comp("fat", "fixed", { optional: true }),
    ],
  },
];

/** Um ingrediente com quantidade real, para o cálculo da receita. */
export interface RecipeIngredient {
  food: Portion["food"];
  grams: number;
}

/**
 * Macros de uma receita inteira e de uma porção, a partir dos ingredientes.
 *
 * `servings` é o rendimento declarado. Usado pelo gerador e pela tela de
 * receitas, para que as duas nunca discordem.
 */
export function recipeNutrition(
  ingredients: readonly RecipeIngredient[],
  servings: number,
): { total: MacroTotals; perServing: MacroTotals; totalGrams: number; servingGrams: number } {
  const total = nutritionTotals(ingredients.map((i) => ({ food: i.food, grams: i.grams })));
  const porcoes = servings > 0 ? servings : 1;
  const totalGrams = ingredients.reduce((s, i) => s + (Number.isFinite(i.grams) ? i.grams : 0), 0);
  return {
    total,
    perServing: perServing(total, porcoes),
    totalGrams,
    servingGrams: totalGrams / porcoes,
  };
}
