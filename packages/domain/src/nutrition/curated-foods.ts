import type { MealSlot } from "./meal-slots";

/**
 * Catálogo curado: os alimentos que o gerador pode **prescrever**.
 *
 * ## Por que uma lista explícita
 *
 * O banco tem ~600 alimentos da TACO, e a marcação antiga (`is_staple`) deixava
 * o gerador escolher biscoito recheado, arroz cru e wafer — e decidia alergia e
 * dieta procurando pedaços de palavra no nome ("mel" tirava melão; "vegana" não
 * tirava carne). Aqui cada alimento prescritível foi revisado um a um:
 *
 * - **papel culinário** (o lugar que ocupa no prato), que não é inferido dos macros;
 * - **refeições** em que faz sentido;
 * - **estado de preparo** — os macros são do estado indicado (cozido ≠ cru);
 * - **marcadores** de alérgenos e de origem animal, declarados, não deduzidos;
 * - **porção** mínima, máxima, passo e padrão, em gramas do estado indicado.
 *
 * Os **macros não estão aqui**: vêm do banco (TACO), por 100 g. Esta lista diz
 * o que pode ser recomendado e como; nunca o que o alimento contém em energia.
 *
 * Alimento fora desta lista continua registrável no diário, mas o gerador e as
 * substituições não o sugerem. É o lado seguro: na dúvida, não recomendar.
 *
 * ## Identificação
 *
 * `ids` são apelidos do mesmo alimento em bases diferentes: `taco:N` (seed
 * oficial), `forja:*` (catálogo local de emergência) e `name:<nome exato>` para
 * os 25 alimentos originais, que não têm `external_id`. A correspondência por
 * nome é **exata** e só vale para alimentos públicos — nunca por trecho.
 *
 * Marcadores são conservadores: aveia leva `gluten` (contaminação cruzada é a
 * regra no Brasil), macarrão leva `egg` (muitas marcas usam ovo).
 *
 * ⚠️ Porções e elegibilidade são uma proposta de produto e precisam de revisão
 * por nutricionista antes de serem tratadas como recomendação de saúde.
 */

export const CULINARY_ROLES = [
  /** Base de almoço/jantar: arroz, batata, mandioca, macarrão. */
  "starch",
  /** Base de café e lanche: pão, aveia, tapioca, cuscuz. */
  "bread",
  /** Proteína principal: carnes, aves, peixes, ovos. */
  "protein",
  /** Leguminosa: feijão, lentilha, grão-de-bico. */
  "legume",
  "dairy",
  "vegetable",
  "fruit",
  /** Gordura de tempero: azeite. */
  "fat",
  /** Castanhas, amendoim e pastas. */
  "nuts",
] as const;

export type CulinaryRole = (typeof CULINARY_ROLES)[number];

/** Marcadores de alérgenos e de origem. A geração exclui por eles, não por nome. */
export const FOOD_TAGS = [
  "meat",
  "fish",
  "seafood",
  "dairy",
  "egg",
  "honey",
  "gluten",
  "peanut",
  "nuts",
  "soy",
  /** Amido de base (arroz, pão, batata…). Usado pela opção "baixo carboidrato". */
  "starch",
] as const;

export type FoodTag = (typeof FOOD_TAGS)[number];

/** Estado em que os macros do alimento foram medidos — e em que a porção é pesada. */
export type PreparationState = "cooked" | "grilled" | "roasted" | "raw" | "dry" | "ready";

export interface PortionRule {
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface FoodProfile {
  /** Conceito do alimento, estável entre bases ("arroz-branco"). */
  key: string;
  ids: readonly string[];
  role: CulinaryRole;
  meals: readonly MealSlot[];
  state: PreparationState;
  tags: readonly FoodTag[];
  portion: PortionRule;
}

// ---------------------------------------------------------------- atalhos

const MAIN: MealSlot[] = ["lunch", "dinner"];
const SNACKS: MealSlot[] = ["morning_snack", "afternoon_snack"];
const BREAKFAST_LIKE: MealSlot[] = ["breakfast", ...SNACKS, "pre_workout", "post_workout"];
const LIGHT: MealSlot[] = ["breakfast", ...SNACKS, "pre_workout", "post_workout", "supper"];

const p = (min: number, max: number, step: number, def: number): PortionRule => ({
  min,
  max,
  step,
  default: def,
});

const RICE = p(60, 250, 10, 120);
const POTATO = p(100, 350, 10, 180);
const MEAT = p(60, 200, 10, 120);
const FISH = p(80, 220, 10, 130);
const EGG = p(50, 150, 50, 100);
const LEGUME = p(60, 200, 10, 100);
const VEG = p(40, 150, 10, 80);
const FRUIT = p(80, 200, 10, 120);
const NUTS = p(10, 30, 5, 15);

function food(
  key: string,
  ids: string[],
  role: CulinaryRole,
  meals: MealSlot[],
  state: PreparationState,
  tags: FoodTag[],
  portion: PortionRule,
): FoodProfile {
  return { key, ids, role, meals, state, tags, portion };
}

export const CURATED_FOODS: readonly FoodProfile[] = [
  // ------------------------------------------------------------- bases
  food(
    "arroz-branco",
    ["taco:3", "forja:arroz-branco", "name:Arroz branco cozido"],
    "starch",
    MAIN,
    "cooked",
    ["starch"],
    RICE,
  ),
  food(
    "arroz-integral",
    ["taco:1", "forja:arroz-integral", "name:Arroz integral cozido"],
    "starch",
    MAIN,
    "cooked",
    ["starch"],
    RICE,
  ),
  food(
    "batata-inglesa",
    ["taco:91", "forja:batata-inglesa", "name:Batata inglesa cozida"],
    "starch",
    MAIN,
    "cooked",
    ["starch"],
    POTATO,
  ),
  food(
    "batata-doce",
    ["taco:88", "forja:batata-doce", "name:Batata doce cozida"],
    "starch",
    [...MAIN, "pre_workout"],
    "cooked",
    ["starch"],
    p(80, 350, 10, 150),
  ),
  food(
    "mandioca",
    ["taco:129", "forja:mandioca", "name:Mandioca cozida"],
    "starch",
    MAIN,
    "cooked",
    ["starch"],
    p(60, 250, 10, 120),
  ),
  food(
    "macarrao",
    ["forja:macarrao"],
    "starch",
    MAIN,
    "cooked",
    ["starch", "gluten", "egg"],
    p(80, 250, 10, 140),
  ),

  food(
    "pao-frances",
    ["taco:53", "forja:pao-frances", "name:Pão francês"],
    "bread",
    BREAKFAST_LIKE,
    "ready",
    ["starch", "gluten"],
    p(50, 100, 25, 50),
  ),
  food(
    "pao-integral",
    ["taco:52", "forja:pao-integral"],
    "bread",
    BREAKFAST_LIKE,
    "ready",
    ["starch", "gluten"],
    p(50, 100, 25, 50),
  ),
  food(
    "aveia",
    ["taco:7", "forja:aveia", "name:Aveia em flocos"],
    "bread",
    LIGHT,
    "dry",
    ["gluten"],
    p(15, 60, 5, 30),
  ),
  // Goma hidratada (item local) e fécula seca (TACO) têm densidades diferentes:
  // são dois alimentos, cada um com a porção do seu estado.
  food(
    "tapioca",
    ["forja:tapioca"],
    "bread",
    ["breakfast", ...SNACKS, "pre_workout"],
    "ready",
    ["starch"],
    p(40, 100, 10, 60),
  ),
  food(
    "fecula-mandioca",
    ["taco:124"],
    "bread",
    ["breakfast", ...SNACKS, "pre_workout"],
    "dry",
    ["starch"],
    p(20, 60, 5, 40),
  ),
  food(
    "cuscuz",
    ["taco:533", "forja:cuscuz"],
    "bread",
    ["breakfast", "pre_workout", "dinner"],
    "cooked",
    ["starch"],
    p(80, 250, 10, 120),
  ),

  // ---------------------------------------------------------- proteínas
  food(
    "frango-grelhado",
    ["taco:410", "forja:frango-peito", "name:Frango peito grelhado"],
    "protein",
    [...MAIN, "post_workout", "afternoon_snack"],
    "grilled",
    ["meat"],
    MEAT,
  ),
  food(
    "frango-cozido",
    ["taco:408"],
    "protein",
    [...MAIN, "breakfast", "post_workout", "afternoon_snack"],
    "cooked",
    ["meat"],
    MEAT,
  ),
  food("frango-coxa", ["taco:398"], "protein", MAIN, "cooked", ["meat"], MEAT),
  food(
    "patinho",
    ["taco:377", "forja:patinho", "name:Patinho bovino cozido"],
    "protein",
    MAIN,
    "grilled",
    ["meat"],
    MEAT,
  ),
  food("carne-moida", ["taco:326"], "protein", MAIN, "cooked", ["meat"], MEAT),
  food("musculo", ["taco:371"], "protein", MAIN, "cooked", ["meat"], MEAT),
  food("contra-file", ["taco:346"], "protein", MAIN, "grilled", ["meat"], MEAT),
  food("coxao-mole", ["taco:351"], "protein", MAIN, "cooked", ["meat"], MEAT),
  food("tilapia", ["forja:tilapia"], "protein", MAIN, "grilled", ["fish"], FISH),
  food("merluza", ["taco:301"], "protein", MAIN, "roasted", ["fish"], FISH),
  food("sardinha", ["taco:318", "forja:sardinha"], "protein", MAIN, "roasted", ["fish"], FISH),
  food("salmao", ["taco:317"], "protein", MAIN, "grilled", ["fish"], FISH),
  food(
    "atum",
    ["forja:atum-agua", "taco:277"],
    "protein",
    [...MAIN, "afternoon_snack", "post_workout"],
    "ready",
    ["fish"],
    p(60, 150, 10, 80),
  ),
  food(
    "ovo-cozido",
    ["taco:488", "forja:ovo-cozido", "name:Ovo de galinha inteiro cozido"],
    "protein",
    [...MAIN, ...BREAKFAST_LIKE],
    "cooked",
    ["egg"],
    EGG,
  ),
  // Peso cru: é o ovo que vai para a frigideira (mexido, omelete).
  food(
    "ovo-mexido",
    ["taco:489"],
    "protein",
    ["breakfast", "dinner", "post_workout"],
    "raw",
    ["egg"],
    EGG,
  ),
  food(
    "clara",
    ["taco:486", "forja:clara-ovo"],
    "protein",
    ["breakfast", "post_workout"],
    "cooked",
    ["egg"],
    p(60, 180, 30, 90),
  ),
  food("tofu", ["taco:584"], "protein", MAIN, "ready", ["soy"], p(80, 200, 10, 120)),

  // ---------------------------------------------------------- laticínios
  // "Leite, de vaca, integral" da TACO (taco:458) tem macros zerados no seed: fica de fora.
  food("leite", ["name:Leite integral"], "dairy", LIGHT, "ready", ["dairy"], p(150, 300, 50, 200)),
  food(
    "leite-desnatado",
    ["forja:leite-desnatado"],
    "dairy",
    LIGHT,
    "ready",
    ["dairy"],
    p(150, 300, 50, 200),
  ),
  food(
    "iogurte",
    ["taco:448", "name:Iogurte natural"],
    "dairy",
    LIGHT,
    "ready",
    ["dairy"],
    p(100, 250, 10, 170),
  ),
  food(
    "iogurte-desnatado",
    ["taco:449", "forja:iogurte-natural"],
    "dairy",
    LIGHT,
    "ready",
    ["dairy"],
    p(100, 250, 10, 170),
  ),
  food(
    "queijo-minas",
    ["taco:461", "forja:queijo-minas", "name:Queijo minas frescal"],
    "dairy",
    LIGHT,
    "ready",
    ["dairy"],
    p(20, 60, 10, 30),
  ),
  food("ricota", ["taco:469"], "dairy", LIGHT, "ready", ["dairy"], p(30, 80, 10, 50)),
  food("mozarela", ["taco:463"], "dairy", BREAKFAST_LIKE, "ready", ["dairy"], p(15, 40, 5, 20)),
  food("cottage", ["forja:cottage"], "dairy", LIGHT, "ready", ["dairy"], p(30, 100, 10, 50)),
  // Alternativa vegetal ao leite: papel de laticínio no prato, sem leite.
  food("bebida-soja", ["taco:582"], "dairy", LIGHT, "ready", ["soy"], p(150, 300, 50, 200)),

  // ---------------------------------------------------------- leguminosas
  food(
    "feijao-carioca",
    ["taco:561", "forja:feijao-carioca", "name:Feijão carioca cozido"],
    "legume",
    MAIN,
    "cooked",
    [],
    LEGUME,
  ),
  food(
    "feijao-preto",
    ["taco:567", "name:Feijão preto cozido"],
    "legume",
    MAIN,
    "cooked",
    [],
    LEGUME,
  ),
  food("feijao-fradinho", ["taco:563"], "legume", MAIN, "cooked", [], LEGUME),
  food("feijao-roxo", ["taco:573"], "legume", MAIN, "cooked", [], LEGUME),
  food("feijao-rajado", ["taco:569"], "legume", MAIN, "cooked", [], LEGUME),
  food("lentilha", ["taco:577", "forja:lentilha"], "legume", MAIN, "cooked", [], LEGUME),
  // A TACO só tem grão-de-bico cru; o cozido vem do catálogo local.
  food("grao-de-bico", ["forja:grao-de-bico"], "legume", MAIN, "cooked", [], LEGUME),

  // ------------------------------------------------------------- vegetais
  food(
    "alface",
    ["taco:78", "forja:alface", "name:Alface"],
    "vegetable",
    MAIN,
    "raw",
    [],
    p(20, 60, 10, 30),
  ),
  food(
    "tomate",
    ["taco:157", "forja:tomate", "name:Tomate"],
    "vegetable",
    [...MAIN, "breakfast", "afternoon_snack"],
    "raw",
    [],
    p(40, 120, 10, 60),
  ),
  food("brocolis", ["taco:100", "forja:brocolis"], "vegetable", MAIN, "cooked", [], VEG),
  food("cenoura", ["taco:110", "forja:cenoura"], "vegetable", MAIN, "raw", [], p(30, 100, 10, 50)),
  food("cenoura-cozida", ["taco:109"], "vegetable", MAIN, "cooked", [], VEG),
  food("abobrinha", ["taco:70", "forja:abobrinha"], "vegetable", MAIN, "cooked", [], VEG),
  food("couve", ["taco:116", "forja:couve"], "vegetable", MAIN, "cooked", [], p(30, 80, 10, 50)),
  food("chuchu", ["taco:112"], "vegetable", MAIN, "cooked", [], VEG),
  food("beterraba", ["taco:97"], "vegetable", MAIN, "cooked", [], p(40, 120, 10, 60)),
  food("pepino", ["taco:142"], "vegetable", MAIN, "raw", [], p(40, 120, 10, 60)),
  food("repolho", ["taco:149"], "vegetable", MAIN, "raw", [], p(30, 100, 10, 50)),
  food("couve-flor", ["taco:118"], "vegetable", MAIN, "cooked", [], VEG),
  food("berinjela", ["taco:95"], "vegetable", MAIN, "cooked", [], VEG),
  food("abobora", ["taco:64"], "vegetable", MAIN, "cooked", [], VEG),

  // --------------------------------------------------------------- frutas
  food(
    "banana",
    ["taco:182", "forja:banana-prata", "name:Banana prata"],
    "fruit",
    LIGHT,
    "raw",
    [],
    p(60, 150, 10, 90),
  ),
  food("banana-nanica", ["taco:179"], "fruit", LIGHT, "raw", [], p(60, 150, 10, 90)),
  food(
    "maca",
    ["taco:222", "forja:maca", "name:Maçã fuji"],
    "fruit",
    LIGHT,
    "raw",
    [],
    p(100, 200, 10, 130),
  ),
  food(
    "mamao",
    ["taco:226", "forja:mamao", "name:Mamão papaia"],
    "fruit",
    LIGHT,
    "raw",
    [],
    p(100, 250, 10, 150),
  ),
  food(
    "laranja",
    ["taco:214", "forja:laranja", "name:Laranja pera"],
    "fruit",
    [...LIGHT, ...MAIN],
    "raw",
    [],
    p(100, 200, 10, 140),
  ),
  food("morango", ["taco:239", "forja:morango"], "fruit", LIGHT, "raw", [], FRUIT),
  food("manga", ["taco:231"], "fruit", LIGHT, "raw", [], FRUIT),
  food("melancia", ["taco:235"], "fruit", LIGHT, "raw", [], p(150, 300, 10, 200)),
  food("melao", ["taco:236"], "fruit", LIGHT, "raw", [], p(150, 300, 10, 200)),
  food("abacaxi", ["taco:164"], "fruit", LIGHT, "raw", [], FRUIT),
  food("goiaba", ["taco:200"], "fruit", LIGHT, "raw", [], FRUIT),
  food("kiwi", ["taco:207"], "fruit", LIGHT, "raw", [], p(70, 150, 10, 100)),
  food("tangerina", ["taco:251"], "fruit", LIGHT, "raw", [], p(100, 200, 10, 130)),
  food("uva", ["taco:256"], "fruit", LIGHT, "raw", [], FRUIT),
  food(
    "abacate",
    ["taco:163", "forja:abacate"],
    "fruit",
    ["breakfast", ...SNACKS],
    "raw",
    [],
    p(50, 150, 10, 80),
  ),

  // ------------------------------------------------- gorduras e castanhas
  food(
    "azeite",
    ["taco:260", "forja:azeite", "name:Azeite de oliva extra virgem"],
    "fat",
    MAIN,
    "ready",
    [],
    p(4, 12, 2, 6),
  ),
  food(
    "castanha-do-para",
    ["taco:589", "forja:castanha-para"],
    "nuts",
    [...SNACKS, "supper"],
    "ready",
    ["nuts"],
    NUTS,
  ),
  food("castanha-de-caju", ["taco:588"], "nuts", [...SNACKS, "supper"], "ready", ["nuts"], NUTS),
  food("amendoa", ["taco:587"], "nuts", [...SNACKS, "supper"], "ready", ["nuts"], NUTS),
  food(
    "amendoim",
    ["taco:558", "forja:amendoim"],
    "nuts",
    SNACKS,
    "ready",
    ["peanut"],
    p(10, 30, 5, 20),
  ),
  food(
    "pasta-amendoim",
    ["forja:pasta-amendoim", "receitas:pasta-amendoim"],
    "nuts",
    ["breakfast", ...SNACKS, "pre_workout"],
    "ready",
    ["peanut"],
    NUTS,
  ),
];

const BY_ID = new Map<string, FoodProfile>();
for (const f of CURATED_FOODS) for (const id of f.ids) BY_ID.set(id, f);

/**
 * Perfil curado de um alimento do banco, ou `undefined` (não prescritível).
 *
 * Só identifica alimento **público** (seed oficial) ou do catálogo local que o
 * próprio app grava (`forja:`): um alimento criado pelo usuário com o mesmo
 * nome ou código pode ter qualquer coisa dentro.
 */
export function profileFor(row: {
  externalId?: string | null | undefined;
  name: string;
  isPublic?: boolean | undefined;
}): FoodProfile | undefined {
  if (row.externalId) {
    const confiavel = row.isPublic || row.externalId.startsWith("forja:");
    return confiavel ? BY_ID.get(row.externalId) : undefined;
  }
  if (row.isPublic) return BY_ID.get(`name:${row.name}`);
  return undefined;
}

/** Todos os `external_id` curados — para a consulta ao banco. */
export const CURATED_EXTERNAL_IDS: readonly string[] = CURATED_FOODS.flatMap((f) =>
  f.ids.filter((id) => !id.startsWith("name:")),
);

/** Nomes exatos curados dos alimentos públicos sem `external_id`. */
export const CURATED_PUBLIC_NAMES: readonly string[] = CURATED_FOODS.flatMap((f) =>
  f.ids.filter((id) => id.startsWith("name:")).map((id) => id.slice(5)),
);
