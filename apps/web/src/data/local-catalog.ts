import { supabase } from "@/integrations/supabase/client";
import { assertOk, unwrapList } from "@/data/supabase-helpers";
import type { FoodCategory } from "@forja/domain";

/**
 * Base local de alimentos — a rede de segurança do gerador de dieta.
 *
 * ## Por que existe
 *
 * O cardápio é montado a partir do catálogo do banco, e o catálogo depende de
 * migrations de *dados* terem sido aplicadas no projeto Supabase. Quando não
 * foram — projeto novo, restauração de backup, seed que falhou no meio —, a
 * consulta volta vazia, o gerador não tem o que prescrever, e o usuário chega
 * à aba Alimentação e encontra oito caixas vazias. O plano "existe" e não vale
 * nada.
 *
 * Depender de o banco ter sido semeado corretamente é uma premissa que o app
 * não controla. Esta lista, que viaja dentro do bundle, é a garantia de que ele
 * controla: se o catálogo estiver ausente ou raso demais para compor uma dieta,
 * estes alimentos são **gravados no banco** e passam a ser catálogo de verdade
 * — referenciáveis por `meal_plan_items`, buscáveis, substituíveis.
 *
 * ## Por que gravar em vez de usar só em memória
 *
 * Porque um item de plano é uma chave estrangeira para `foods`. Um alimento que
 * só existe no JavaScript não pode ser prescrito, nem marcado como consumido,
 * nem entrar no histórico. A gravação é o que transforma o fallback em dado.
 *
 * ## Os valores
 *
 * Por 100 g, da TACO (Tabela Brasileira de Composição de Alimentos, NEPA/
 * Unicamp) — a mesma fonte do seed oficial, para que os dois não se
 * contradigam quando conviverem.
 */

export interface LocalFood {
  /** Chave de idempotência. Prefixo `forja:` distingue do seed oficial (`taco:`). */
  externalId: string;
  name: string;
  category: FoodCategory;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  /** Medida caseira executável na cozinha, com o peso correspondente. */
  measure: string;
  measureG: number;
  /** 0–100. Ordena a escolha entre alimentos igualmente adequados. */
  popularity: number;
}

export const LOCAL_FOODS: readonly LocalFood[] = [
  // ------------------------------------------------------------- proteínas
  {
    externalId: "forja:frango-peito",
    name: "Frango, peito grelhado",
    category: "protein_meat",
    kcal: 159,
    proteinG: 32,
    carbsG: 0,
    fatG: 3.5,
    fiberG: 0,
    measure: "1 filé médio",
    measureG: 120,
    popularity: 98,
  },
  {
    externalId: "forja:patinho",
    name: "Carne bovina, patinho grelhado",
    category: "protein_meat",
    kcal: 219,
    proteinG: 35.9,
    carbsG: 0,
    fatG: 7.3,
    fiberG: 0,
    measure: "1 bife médio",
    measureG: 100,
    popularity: 92,
  },
  {
    externalId: "forja:tilapia",
    name: "Tilápia, filé grelhado",
    category: "protein_meat",
    kcal: 128,
    proteinG: 26.2,
    carbsG: 0,
    fatG: 2.7,
    fiberG: 0,
    measure: "1 filé",
    measureG: 130,
    popularity: 82,
  },
  {
    externalId: "forja:atum-agua",
    name: "Atum em conserva, em água",
    category: "protein_meat",
    kcal: 116,
    proteinG: 25.5,
    carbsG: 0,
    fatG: 1,
    fiberG: 0,
    measure: "1 lata escorrida",
    measureG: 120,
    popularity: 85,
  },
  {
    externalId: "forja:sardinha",
    name: "Sardinha, assada",
    category: "protein_meat",
    kcal: 164,
    proteinG: 32.2,
    carbsG: 0,
    fatG: 3.4,
    fiberG: 0,
    measure: "2 unidades",
    measureG: 100,
    popularity: 62,
  },
  {
    externalId: "forja:peito-peru",
    name: "Peito de peru defumado",
    category: "protein_meat",
    kcal: 96,
    proteinG: 17.5,
    carbsG: 2.5,
    fatG: 1.8,
    fiberG: 0,
    measure: "4 fatias",
    measureG: 60,
    popularity: 70,
  },
  {
    externalId: "forja:ovo-cozido",
    name: "Ovo de galinha, cozido",
    category: "protein_egg",
    kcal: 146,
    proteinG: 13.3,
    carbsG: 0.6,
    fatG: 9.5,
    fiberG: 0,
    measure: "2 unidades",
    measureG: 100,
    popularity: 96,
  },
  {
    externalId: "forja:clara-ovo",
    name: "Clara de ovo, cozida",
    category: "protein_egg",
    kcal: 52,
    proteinG: 10.9,
    carbsG: 0.7,
    fatG: 0.2,
    fiberG: 0,
    measure: "3 claras",
    measureG: 100,
    popularity: 68,
  },
  {
    externalId: "forja:iogurte-natural",
    name: "Iogurte natural desnatado",
    category: "dairy",
    kcal: 41,
    proteinG: 4.5,
    carbsG: 5.2,
    fatG: 0.3,
    fiberG: 0,
    measure: "1 pote",
    measureG: 170,
    popularity: 88,
  },
  {
    externalId: "forja:queijo-minas",
    name: "Queijo minas frescal",
    category: "dairy",
    kcal: 264,
    proteinG: 17.4,
    carbsG: 3.2,
    fatG: 20.2,
    fiberG: 0,
    measure: "1 fatia grossa",
    measureG: 50,
    popularity: 75,
  },
  {
    externalId: "forja:cottage",
    name: "Queijo cottage",
    category: "dairy",
    kcal: 98,
    proteinG: 11.1,
    carbsG: 3.4,
    fatG: 4.3,
    fiberG: 0,
    measure: "3 colheres de sopa",
    measureG: 60,
    popularity: 66,
  },
  {
    externalId: "forja:leite-desnatado",
    name: "Leite desnatado",
    category: "dairy",
    kcal: 35,
    proteinG: 3.4,
    carbsG: 4.9,
    fatG: 0.2,
    fiberG: 0,
    measure: "1 copo",
    measureG: 200,
    popularity: 80,
  },
  {
    externalId: "forja:whey",
    name: "Whey protein concentrado",
    category: "supplement",
    kcal: 400,
    proteinG: 80,
    carbsG: 10,
    fatG: 5,
    fiberG: 0,
    measure: "1 scoop",
    measureG: 30,
    popularity: 84,
  },

  // ---------------------------------------------------------- carboidratos
  {
    externalId: "forja:arroz-branco",
    name: "Arroz branco, cozido",
    category: "grain",
    kcal: 128,
    proteinG: 2.5,
    carbsG: 28.1,
    fatG: 0.2,
    fiberG: 1.6,
    measure: "4 colheres de sopa",
    measureG: 100,
    popularity: 99,
  },
  {
    externalId: "forja:arroz-integral",
    name: "Arroz integral, cozido",
    category: "grain",
    kcal: 124,
    proteinG: 2.6,
    carbsG: 25.8,
    fatG: 1,
    fiberG: 2.7,
    measure: "4 colheres de sopa",
    measureG: 100,
    popularity: 88,
  },
  {
    externalId: "forja:feijao-carioca",
    name: "Feijão carioca, cozido",
    category: "legume",
    kcal: 76,
    proteinG: 4.8,
    carbsG: 13.6,
    fatG: 0.5,
    fiberG: 8.5,
    measure: "1 concha média",
    measureG: 90,
    popularity: 95,
  },
  {
    externalId: "forja:lentilha",
    name: "Lentilha, cozida",
    category: "legume",
    kcal: 93,
    proteinG: 6.3,
    carbsG: 16.3,
    fatG: 0.5,
    fiberG: 7.9,
    measure: "1 concha média",
    measureG: 90,
    popularity: 64,
  },
  {
    externalId: "forja:grao-de-bico",
    name: "Grão-de-bico, cozido",
    category: "legume",
    kcal: 164,
    proteinG: 8.9,
    carbsG: 27.4,
    fatG: 2.6,
    fiberG: 7.6,
    measure: "1 concha média",
    measureG: 90,
    popularity: 66,
  },
  {
    externalId: "forja:batata-inglesa",
    name: "Batata inglesa, cozida",
    category: "tuber",
    kcal: 52,
    proteinG: 1.2,
    carbsG: 11.9,
    fatG: 0.1,
    fiberG: 1.3,
    measure: "1 unidade média",
    measureG: 150,
    popularity: 90,
  },
  {
    externalId: "forja:batata-doce",
    name: "Batata doce, cozida",
    category: "tuber",
    kcal: 77,
    proteinG: 0.6,
    carbsG: 18.4,
    fatG: 0.1,
    fiberG: 2.2,
    measure: "1 unidade média",
    measureG: 150,
    popularity: 92,
  },
  {
    externalId: "forja:mandioca",
    name: "Mandioca, cozida",
    category: "tuber",
    kcal: 125,
    proteinG: 0.6,
    carbsG: 30.1,
    fatG: 0.3,
    fiberG: 1.6,
    measure: "1 pedaço médio",
    measureG: 100,
    popularity: 72,
  },
  {
    externalId: "forja:macarrao",
    name: "Macarrão, cozido",
    category: "grain",
    kcal: 158,
    proteinG: 5.8,
    carbsG: 30.9,
    fatG: 0.9,
    fiberG: 1.8,
    measure: "1 pegador",
    measureG: 110,
    popularity: 86,
  },
  {
    externalId: "forja:pao-integral",
    name: "Pão de forma integral",
    category: "grain",
    kcal: 253,
    proteinG: 9.4,
    carbsG: 43.9,
    fatG: 3.7,
    fiberG: 6.9,
    measure: "2 fatias",
    measureG: 50,
    popularity: 88,
  },
  {
    externalId: "forja:pao-frances",
    name: "Pão francês",
    category: "grain",
    kcal: 300,
    proteinG: 8,
    carbsG: 58.6,
    fatG: 3.1,
    fiberG: 2.3,
    measure: "1 unidade",
    measureG: 50,
    popularity: 90,
  },
  {
    externalId: "forja:aveia",
    name: "Aveia em flocos",
    category: "grain",
    kcal: 394,
    proteinG: 13.9,
    carbsG: 66.6,
    fatG: 8.5,
    fiberG: 9.1,
    measure: "3 colheres de sopa",
    measureG: 40,
    popularity: 89,
  },
  {
    externalId: "forja:tapioca",
    name: "Tapioca, goma hidratada",
    category: "grain",
    kcal: 240,
    proteinG: 0.1,
    carbsG: 59.4,
    fatG: 0,
    fiberG: 0.6,
    measure: "1 disco médio",
    measureG: 60,
    popularity: 84,
  },
  {
    externalId: "forja:cuscuz",
    name: "Cuscuz de milho, cozido",
    category: "grain",
    kcal: 113,
    proteinG: 2.2,
    carbsG: 25.3,
    fatG: 0.5,
    fiberG: 1.4,
    measure: "1 fatia",
    measureG: 100,
    popularity: 70,
  },

  // -------------------------------------------------------------- gorduras
  {
    externalId: "forja:azeite",
    name: "Azeite de oliva extra virgem",
    category: "fat",
    kcal: 884,
    proteinG: 0,
    carbsG: 0,
    fatG: 100,
    fiberG: 0,
    measure: "1 colher de sopa",
    measureG: 13,
    popularity: 86,
  },
  {
    externalId: "forja:castanha-para",
    name: "Castanha-do-pará",
    category: "fat",
    kcal: 643,
    proteinG: 14.5,
    carbsG: 15.1,
    fatG: 63.5,
    fiberG: 7.9,
    measure: "3 unidades",
    measureG: 15,
    popularity: 68,
  },
  {
    externalId: "forja:amendoim",
    name: "Amendoim, torrado",
    category: "fat",
    kcal: 544,
    proteinG: 27.2,
    carbsG: 20.3,
    fatG: 43.9,
    fiberG: 8,
    measure: "1 punhado",
    measureG: 30,
    popularity: 74,
  },
  {
    externalId: "forja:pasta-amendoim",
    name: "Pasta de amendoim integral",
    category: "fat",
    kcal: 588,
    proteinG: 25,
    carbsG: 20,
    fatG: 50,
    fiberG: 6,
    measure: "1 colher de sopa",
    measureG: 20,
    popularity: 76,
  },
  {
    externalId: "forja:abacate",
    name: "Abacate",
    category: "fat",
    kcal: 96,
    proteinG: 1.2,
    carbsG: 6,
    fatG: 8.4,
    fiberG: 6.3,
    measure: "1/2 unidade pequena",
    measureG: 100,
    popularity: 70,
  },

  // ------------------------------------------------------ frutas e legumes
  {
    externalId: "forja:banana-prata",
    name: "Banana prata",
    category: "fruit",
    kcal: 98,
    proteinG: 1.3,
    carbsG: 26,
    fatG: 0.1,
    fiberG: 2,
    measure: "1 unidade média",
    measureG: 70,
    popularity: 98,
  },
  {
    externalId: "forja:maca",
    name: "Maçã fuji",
    category: "fruit",
    kcal: 56,
    proteinG: 0.3,
    carbsG: 15.2,
    fatG: 0.1,
    fiberG: 1.3,
    measure: "1 unidade média",
    measureG: 130,
    popularity: 92,
  },
  {
    externalId: "forja:mamao",
    name: "Mamão papaia",
    category: "fruit",
    kcal: 40,
    proteinG: 0.5,
    carbsG: 10.4,
    fatG: 0.1,
    fiberG: 1,
    measure: "1/2 unidade",
    measureG: 150,
    popularity: 84,
  },
  {
    externalId: "forja:laranja",
    name: "Laranja pera",
    category: "fruit",
    kcal: 37,
    proteinG: 1,
    carbsG: 8.9,
    fatG: 0.1,
    fiberG: 4,
    measure: "1 unidade média",
    measureG: 130,
    popularity: 86,
  },
  {
    externalId: "forja:morango",
    name: "Morango",
    category: "fruit",
    kcal: 30,
    proteinG: 0.9,
    carbsG: 6.8,
    fatG: 0.3,
    fiberG: 1.7,
    measure: "1 xícara",
    measureG: 150,
    popularity: 72,
  },
  {
    externalId: "forja:brocolis",
    name: "Brócolis, cozido",
    category: "vegetable",
    kcal: 25,
    proteinG: 2.1,
    carbsG: 4.4,
    fatG: 0.5,
    fiberG: 3.4,
    measure: "1 xícara",
    measureG: 90,
    popularity: 82,
  },
  {
    externalId: "forja:alface",
    name: "Alface crespa",
    category: "vegetable",
    kcal: 11,
    proteinG: 1.4,
    carbsG: 1.7,
    fatG: 0.1,
    fiberG: 2,
    measure: "1 prato de sobremesa",
    measureG: 60,
    popularity: 80,
  },
  {
    externalId: "forja:tomate",
    name: "Tomate",
    category: "vegetable",
    kcal: 15,
    proteinG: 1.1,
    carbsG: 3.1,
    fatG: 0.2,
    fiberG: 1.2,
    measure: "1 unidade média",
    measureG: 90,
    popularity: 84,
  },
  {
    externalId: "forja:cenoura",
    name: "Cenoura, crua",
    category: "vegetable",
    kcal: 34,
    proteinG: 1.3,
    carbsG: 7.7,
    fatG: 0.2,
    fiberG: 3.2,
    measure: "1 unidade média",
    measureG: 80,
    popularity: 78,
  },
  {
    externalId: "forja:abobrinha",
    name: "Abobrinha, refogada",
    category: "vegetable",
    kcal: 20,
    proteinG: 1.1,
    carbsG: 3,
    fatG: 0.6,
    fiberG: 1.5,
    measure: "1 escumadeira",
    measureG: 100,
    popularity: 68,
  },
  {
    externalId: "forja:couve",
    name: "Couve manteiga, refogada",
    category: "vegetable",
    kcal: 90,
    proteinG: 3.4,
    carbsG: 8.7,
    fatG: 4.7,
    fiberG: 5.7,
    measure: "2 colheres de sopa",
    measureG: 60,
    popularity: 66,
  },
];

/** Quantos alimentos prescritíveis o gerador precisa para montar um dia decente. */
const POOL_MINIMO = 24;

/**
 * Garante que exista catálogo suficiente para montar uma dieta.
 *
 * Grava os alimentos locais que ainda não existem e devolve quantos há
 * disponíveis ao final. Idempotente: rodar de novo não duplica nada, porque a
 * inserção é filtrada pelos `external_id` já presentes.
 *
 * Os alimentos entram como **públicos** quando o banco os aceita — são dados de
 * tabela nutricional, não do usuário. Se a policy recusar (o que acontece
 * porque `insert own food` exige `owner_id = auth.uid()`), entram como do
 * próprio usuário: privados, mas funcionais.
 */
export async function ensureFoodCatalog(userId: string): Promise<number> {
  const prescritiveis = await contarPrescritiveis();
  if (prescritiveis >= POOL_MINIMO) return prescritiveis;

  const existentes = new Set(
    unwrapList(
      "verificar catálogo local de alimentos",
      await supabase
        .from("foods")
        .select("external_id")
        .in(
          "external_id",
          LOCAL_FOODS.map((f) => f.externalId),
        ),
    ).map((r) => r.external_id),
  );

  const faltantes = LOCAL_FOODS.filter((f) => !existentes.has(f.externalId));

  if (faltantes.length > 0) {
    // 23505 aqui significa que outra aba semeou primeiro — resultado desejado,
    // não erro. Qualquer outro código é falha real e precisa subir.
    const resultado = await supabase.from("foods").insert(
      faltantes.map((f) => ({
        owner_id: userId,
        external_id: f.externalId,
        name: f.name,
        source: "forja",
        category: f.category,
        serving_size_g: 100,
        serving_unit: "g",
        kcal: f.kcal,
        protein_g: f.proteinG,
        carbs_g: f.carbsG,
        fat_g: f.fatG,
        fiber_g: f.fiberG,
        household_measure: f.measure,
        household_grams: f.measureG,
        popularity: f.popularity,
        is_staple: true,
        is_public: false,
      })),
    );

    if (resultado.error && resultado.error.code !== "23505") {
      assertOk("gravar catálogo local de alimentos", resultado);
    }
  }

  return contarPrescritiveis();
}

async function contarPrescritiveis(): Promise<number> {
  const resultado = await supabase
    .from("foods")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .eq("is_staple", true);

  assertOk("contar alimentos prescritíveis", resultado);
  return resultado.count ?? 0;
}
