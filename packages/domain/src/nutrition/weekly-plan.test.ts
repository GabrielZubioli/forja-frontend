import { describe, expect, it } from "vitest";
import { byKey, rowFor, TEST_CATALOG } from "./catalog.fixture";
import { CURATED_FOODS } from "./curated-foods";
import {
  excludedTags,
  RESTRICTION_TAGS,
  safePool,
  UnknownRestrictionError,
} from "./dietary-filters";
import { assessEnergy, macroTargets } from "./energy";
import { buildCatalog } from "./food-catalog";
import {
  generateWeeklyPlan,
  KCAL_TOLERANCE,
  sizeMealPortions,
  toleranceStatus,
  type WeeklyPlan,
  type WeeklyPlanInput,
} from "./meal-plan";
import { selectMealSlots, type MealSlot } from "./meal-slots";
import { MEAL_RECIPES, recipeNutrition } from "./recipes";
import { findSubstitutions } from "./substitutions";
import { nutritionTotals } from "./totals";

const PROFILE_KEY = new Map(TEST_CATALOG.map((f) => [f.id, f]));
const profileOf = (foodId: string) => PROFILE_KEY.get(foodId)!.profile;

function targetsFor(kcal: number, weightKg: number) {
  const m = macroTargets(kcal, weightKg);
  return { kcal, proteinG: m.protein_g, carbsG: m.carbs_g, fatG: m.fat_g };
}

function input(overrides: Partial<WeeklyPlanInput> = {}): WeeklyPlanInput {
  return {
    targets: targetsFor(2300, 80),
    slots: selectMealSlots({ mealsPerDay: 5 }),
    foods: TEST_CATALOG,
    seed: 0,
    ...overrides,
  };
}

function plan(overrides: Partial<WeeklyPlanInput> = {}): WeeklyPlan {
  const r = generateWeeklyPlan(input(overrides));
  if (!r.ok) throw new Error(r.reason);
  return r.plan;
}

const allItems = (p: WeeklyPlan) => p.days.flatMap((d) => d.meals.flatMap((m) => m.items));

describe("catálogo curado", () => {
  it("todo conceito é único e tem porção coerente", () => {
    const keys = CURATED_FOODS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const f of CURATED_FOODS) {
      expect(f.portion.min).toBeLessThanOrEqual(f.portion.default);
      expect(f.portion.default).toBeLessThanOrEqual(f.portion.max);
      expect(f.portion.step).toBeGreaterThan(0);
      expect(f.meals.length).toBeGreaterThan(0);
    }
  });

  it("um id pertence a um único conceito", () => {
    const ids = CURATED_FOODS.flatMap((f) => f.ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("as receitas só citam conceitos que existem", () => {
    const keys = new Set(CURATED_FOODS.map((f) => f.key));
    for (const r of MEAL_RECIPES)
      for (const c of r.components) for (const k of c.only ?? []) expect(keys).toContain(k);
  });

  it("toda receita tem uma base que fecha as calorias", () => {
    for (const r of MEAL_RECIPES)
      expect(r.components.some((c) => c.sizing === "energy")).toBe(true);
  });

  it("rejeita alimento curado com macros ausentes ou incoerentes", () => {
    const zerado = { ...rowFor("leite"), kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
    const trocado = { ...rowFor("arroz-branco"), kcal: 400 };
    const { foods, rejected } = buildCatalog([zerado, trocado]);
    expect(foods).toHaveLength(0);
    expect(rejected.map((r) => r.reason)).toEqual([
      "sem calorias declaradas",
      "calorias incoerentes com os macros",
    ]);
  });

  it("ignora alimento fora da curadoria e nome igual criado pelo usuário", () => {
    const biscoito = { ...rowFor("arroz-branco"), externalId: "taco:9", name: "Biscoito recheado" };
    const doUsuario = { ...rowFor("leite"), isPublic: false };
    expect(buildCatalog([biscoito, doUsuario]).foods).toHaveLength(0);
  });

  it("um conceito com dois apelidos vira um alimento só", () => {
    const taco = rowFor("arroz-branco");
    const local = { ...taco, id: "local", externalId: "forja:arroz-branco" };
    const { foods } = buildCatalog([local, taco]);
    expect(foods.map((f) => f.id)).toEqual(["arroz-branco"]);
  });
});

describe("metas", () => {
  it("as sete metas diárias são idênticas", () => {
    const p = plan();
    for (const slot of p.days[0]!.meals.map((m) => m.slot)) {
      const alvos = p.days.map((d) => d.meals.find((m) => m.slot === slot)!.kcalTarget);
      expect(new Set(alvos).size).toBe(1);
    }
    const somaDoDia = p.days[0]!.meals.reduce((s, m) => s + m.kcalTarget, 0);
    expect(Math.abs(somaDoDia - 2300)).toBeLessThanOrEqual(p.days[0]!.meals.length);
  });

  it("macros nunca negativos ou NaN, inclusive para pessoas muito pesadas", () => {
    for (const [kcal, peso] of [
      [1200, 45],
      [1500, 250],
      [2300, 80],
      [5000, 140],
    ] as const) {
      const m = macroTargets(kcal, peso);
      for (const v of Object.values(m)) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
      const atwater = m.protein_g * 4 + m.carbs_g * 4 + m.fat_g * 9;
      expect(Math.abs(atwater - kcal)).toBeLessThan(15);
    }
  });

  it("rejeita entrada inválida em vez de cair em valores padrão", () => {
    expect(() => macroTargets(Number.NaN, 80)).toThrow();
    const r = assessEnergy({
      sex: "male",
      weightKg: undefined,
      heightCm: 178,
      ageYears: 30,
      activity: "moderate",
      goal: "lose",
    });
    expect(r).toMatchObject({ ok: false, reason: "incomplete_profile" });
  });

  it("calcula a meta pelo exemplo documentado", () => {
    const r = assessEnergy({
      sex: "male",
      weightKg: 80,
      heightCm: 178,
      ageYears: 30,
      activity: "moderate",
      goal: "lose",
    });
    expect(r).toMatchObject({ ok: true, kcal: 2329, macros: { protein_g: 160, fat_g: 65 } });
  });

  it("bloqueia menores, perda de peso com baixo peso e metas fora dos limites", () => {
    const base = {
      sex: "female",
      weightKg: 60,
      heightCm: 165,
      ageYears: 30,
      activity: "light",
      goal: "maintain",
    } as const;
    expect(assessEnergy({ ...base, ageYears: 16 })).toMatchObject({
      ok: false,
      reason: "under_age",
    });
    expect(assessEnergy({ ...base, weightKg: 48, goal: "lose" })).toMatchObject({
      ok: false,
      reason: "underweight_weight_loss",
    });
    expect(
      assessEnergy({
        ...base,
        weightKg: 38,
        heightCm: 150,
        ageYears: 80,
        goal: "maintain",
        activity: "light",
      }),
    ).toMatchObject({
      ok: false,
      reason: "kcal_out_of_range",
    });
  });
});

describe("segurança", () => {
  const restricoes = Object.keys(RESTRICTION_TAGS).filter((r) => r !== "low_carb");

  it.each(restricoes)("nenhum alimento proibido por '%s' entra no plano", (r) => {
    const ehDieta = ["vegetarian", "vegan", "lactose_free", "gluten_free"].includes(r);
    const res = generateWeeklyPlan(
      input({ restrictions: ehDieta ? { diets: [r] } : { allergies: [r] } }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const proibidos = excludedTags(
      ehDieta ? { diets: [r], allergies: [] } : { diets: [], allergies: [r] },
    );
    for (const item of allItems(res.plan)) {
      expect(profileOf(item.foodId).tags.some((t) => proibidos.has(t))).toBe(false);
    }
  });

  it("vegano não recebe carne, peixe, ovo, laticínio nem mel — inclusive nos ingredientes das receitas", () => {
    const p = plan({ restrictions: { diets: ["vegan"] } });
    const proibidos = ["meat", "fish", "seafood", "egg", "dairy", "honey"];
    for (const item of allItems(p)) {
      expect(profileOf(item.foodId).tags.filter((t) => proibidos.includes(t))).toEqual([]);
    }
  });

  it("pool insuficiente falha com motivo, sem afrouxar a restrição", () => {
    const soCarne = TEST_CATALOG.filter((f) => f.profile.tags.includes("meat"));
    const res = generateWeeklyPlan(
      input({ foods: soCarne, restrictions: { diets: ["vegetarian"] } }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/nenhuma alergia ou dieta foi ignorada/);
  });

  it("restrição desconhecida é erro, não é ignorada", () => {
    expect(() => safePool(TEST_CATALOG, { diets: ["paleo"], allergies: [] })).toThrow(
      UnknownRestrictionError,
    );
  });

  it("'não gosto' tira o alimento da geração", () => {
    const p = plan({ restrictions: { dislikedFoods: ["frango", "banana"] } });
    for (const item of allItems(p)) {
      expect(item.foodKey).not.toMatch(/frango|banana/);
    }
  });

  it("só prescreve alimentos curados — o que vem de fora não entra", () => {
    const intruso = { ...TEST_CATALOG[0]!, id: "biscoito", name: "Biscoito recheado" };
    const res = generateWeeklyPlan(
      input({
        foods: [...TEST_CATALOG, { ...intruso, profile: { ...intruso.profile, meals: [] } }],
      }),
    );
    expect(res.ok && allItems(res.plan).some((i) => i.foodId === "biscoito")).toBe(false);
  });
});

describe("refeições e porções", () => {
  const p = plan({ slots: selectMealSlots({ mealsPerDay: 8 }) });

  it("cada alimento é elegível para a refeição em que aparece", () => {
    for (const d of p.days)
      for (const m of d.meals)
        for (const i of m.items) expect(profileOf(i.foodId).meals).toContain(m.slot);
  });

  it("café da manhã nunca leva arroz, batata ou feijão", () => {
    for (const d of p.days) {
      const cafe = d.meals.find((m) => m.slot === "breakfast")!;
      expect(cafe.items.some((i) => ["starch", "legume"].includes(i.role))).toBe(false);
    }
  });

  it("almoço e jantar são refeições completas: base, proteína e vegetal", () => {
    for (const d of p.days)
      for (const slot of ["lunch", "dinner"] as MealSlot[]) {
        const roles = d.meals.find((m) => m.slot === slot)!.items.map((i) => i.role);
        expect(roles.some((r) => r === "starch" || r === "bread")).toBe(true);
        expect(roles).toContain("protein");
        expect(roles).toContain("vegetable");
      }
  });

  it("nenhum alimento se repete na mesma refeição", () => {
    for (const d of p.days)
      for (const m of d.meals) {
        const ids = m.items.map((i) => i.foodId);
        expect(new Set(ids).size).toBe(ids.length);
      }
  });

  it("nenhuma porção sai dos limites do alimento nem do passo", () => {
    for (const i of allItems(p)) {
      const { min, max, step } = profileOf(i.foodId).portion;
      expect(i.grams).toBeGreaterThanOrEqual(min);
      expect(i.grams).toBeLessThanOrEqual(max);
      expect(i.grams % step).toBe(0);
    }
  });

  it("a proteína da refeição desconta a que os outros ingredientes já trazem", () => {
    const itens = [
      { food: byKey("pao-integral"), sizing: "energy" as const },
      { food: byKey("frango-cozido"), sizing: "protein" as const },
      { food: byKey("queijo-minas"), sizing: "fixed" as const },
    ];
    const alvo = { kcal: 500, proteinG: 35, carbsG: 50, fatG: 15 };
    const gramas = sizeMealPortions(itens, alvo);
    const foods = itens.map((x, i) => ({
      food: { servingSizeG: 100, ...x.food },
      grams: gramas[i]!,
    }));
    const total = nutritionTotals(foods);
    // Se o pão e o queijo fossem ignorados, o frango sozinho daria os 35 g e o
    // total passaria de 50 g.
    expect(Math.abs(total.proteinG - 35)).toBeLessThan(4);
    // Pão anda de meia unidade (25 g ≈ 63 kcal): a refeição isolada erra até um
    // passo; quem fecha o ±50 é o ajuste do dia.
    expect(Math.abs(total.kcal - 500)).toBeLessThan(80);
  });

  it("receitas calculam macros pelos ingredientes e pelo rendimento", () => {
    const arroz = byKey("arroz-branco");
    const feijao = byKey("feijao-carioca");
    const r = recipeNutrition(
      [
        { food: { servingSizeG: 100, ...arroz }, grams: 400 },
        { food: { servingSizeG: 100, ...feijao }, grams: 200 },
      ],
      4,
    );
    expect(r.total.kcal).toBeCloseTo(arroz.kcal * 4 + feijao.kcal * 2, 6);
    expect(r.perServing.kcal).toBeCloseTo(r.total.kcal / 4, 6);
    expect(r.servingGrams).toBe(150);
  });
});

describe("tolerância e consistência", () => {
  const perfis = [
    { kcal: 1500, peso: 60, refeicoes: 4 },
    { kcal: 1900, peso: 65, refeicoes: 5 },
    { kcal: 2329, peso: 80, refeicoes: 5 },
    { kcal: 2800, peso: 85, refeicoes: 6 },
    { kcal: 3400, peso: 95, refeicoes: 8 },
  ];

  it.each(perfis)(
    "fecha ±50 kcal em todos os dias ($kcal kcal, $refeicoes refeições)",
    ({ kcal, peso, refeicoes }) => {
      const p = plan({
        targets: targetsFor(kcal, peso),
        slots: selectMealSlots({ mealsPerDay: refeicoes }),
      });
      for (const d of p.days) {
        expect(Math.abs(d.kcalDeviation)).toBeLessThanOrEqual(KCAL_TOLERANCE.ideal);
        expect(d.status).toBe("ideal");
      }
    },
  );

  it("a proteína fica perto da meta (dia a dia ±15%, média ±10%)", () => {
    const p = plan();
    for (const d of p.days)
      expect(Math.abs(d.proteinDeviationG)).toBeLessThanOrEqual(p.targets.proteinG * 0.15);
    const media = p.days.reduce((s, d) => s + d.proteinDeviationG, 0) / 7;
    expect(Math.abs(media)).toBeLessThanOrEqual(p.targets.proteinG * 0.1);
  });

  it("meta inalcançável com porções plausíveis: informa o desvio e não muda a meta", () => {
    const p = plan({ targets: targetsFor(4800, 90), slots: selectMealSlots({ mealsPerDay: 3 }) });
    expect(p.targets.kcal).toBe(4800);
    expect(p.days.some((d) => d.status === "outside")).toBe(true);
    expect(p.warnings.join(" ")).toMatch(/fora de ±50 kcal.*A meta não foi alterada/);
  });

  it("o total do dia é a soma dos itens pela mesma função do diário", () => {
    const p = plan();
    for (const d of p.days) {
      const diario = nutritionTotals(
        d.meals.flatMap((m) =>
          m.items.map((i) => ({
            food: { servingSizeG: 100, ...PROFILE_KEY.get(i.foodId)! },
            grams: i.grams,
          })),
        ),
      );
      expect(diario.kcal).toBeCloseTo(d.totals.kcal, 6);
      expect(diario.proteinG).toBeCloseTo(d.totals.proteinG, 6);
    }
  });

  it("toleranceStatus segue ±50 / ±100", () => {
    expect(toleranceStatus(2050, 2000)).toBe("ideal");
    expect(toleranceStatus(1901, 2000)).toBe("acceptable");
    expect(toleranceStatus(2101, 2000)).toBe("outside");
  });

  it("substituição recalcula energia e macros da porção inteira", () => {
    const frango = byKey("frango-grelhado");
    const pool = safePool(TEST_CATALOG, { diets: [], allergies: [] });
    const [sub] = findSubstitutions(frango, 150, pool);
    expect(sub).toBeDefined();
    const kcalSub = (sub!.food.kcal * sub!.grams) / 100;
    expect(sub!.delta.kcal).toBe(Math.round(kcalSub - frango.kcal * 1.5));
    const { min, max } = (sub!.food as typeof frango).profile.portion;
    expect(sub!.grams).toBeGreaterThanOrEqual(min);
    expect(sub!.grams).toBeLessThanOrEqual(max);
  });

  it("substituição troca arroz por base de almoço, não por pão", () => {
    const subs = findSubstitutions(byKey("arroz-branco"), 150, TEST_CATALOG, { limit: 20 });
    for (const s of subs)
      expect((s.food as (typeof TEST_CATALOG)[number]).profile.role).toBe("starch");
  });
});

describe("semana e determinismo", () => {
  it("mesma entrada e semente produzem o mesmo plano", () => {
    expect(plan({ seed: 7 })).toEqual(plan({ seed: 7 }));
  });

  it("sementes diferentes produzem cardápios diferentes", () => {
    const a = allItems(plan({ seed: 1 })).map((i) => i.foodId);
    const b = allItems(plan({ seed: 2 })).map((i) => i.foodId);
    expect(a).not.toEqual(b);
  });

  it("varia receitas e proteínas na semana, sem repetir o almoço em dias seguidos", () => {
    const p = plan();
    const almocos = p.days.map((d) => d.meals.find((m) => m.slot === "lunch")!);
    expect(new Set(almocos.map((m) => m.recipeId)).size).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < 7; i++) expect(almocos[i]!.recipeId).not.toBe(almocos[i - 1]!.recipeId);
    const proteinas = new Set(
      p.days.flatMap((d) =>
        d.meals.flatMap((m) => m.items.filter((i) => i.role === "protein").map((i) => i.foodKey)),
      ),
    );
    expect(proteinas.size).toBeGreaterThanOrEqual(5);
  });

  it("não repete a mesma proteína no almoço e no jantar do mesmo dia", () => {
    const p = plan();
    for (const d of p.days) {
      const prot = (slot: MealSlot) =>
        d.meals.find((m) => m.slot === slot)!.items.find((i) => i.role === "protein")?.foodKey;
      expect(prot("lunch")).not.toBe(prot("dinner"));
    }
  });

  it("pool limitado: sinaliza a repetição em vez de esconder", () => {
    const limitado = TEST_CATALOG.filter(
      (f) => f.profile.role !== "protein" || f.profile.key === "frango-grelhado",
    );
    const p = plan({ foods: limitado });
    expect(p.warnings.join(" ")).toMatch(/Poucas fontes de proteína/);
  });

  it("gosto pessoal pesa na escolha sem virar obrigação", () => {
    const contar = (p: WeeklyPlan) =>
      allItems(p).filter((i) => i.foodKey.startsWith("frango")).length;
    expect(contar(plan({ preferred: ["frango"] }))).toBeGreaterThan(contar(plan()));
  });
});
