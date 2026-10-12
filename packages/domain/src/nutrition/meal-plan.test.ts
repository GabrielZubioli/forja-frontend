import { describe, expect, it } from "vitest";
import { generateMealPlan } from "./meal-plan";
import { distributeMeals, selectMealSlots, minutesToTime, timeToMinutes } from "./meal-slots";
import { foodRole, type FoodCandidate } from "./food-catalog";
import type { MealSlot } from "./meal-slots";

/** Catálogo mínimo com um representante forte de cada papel. */
const FOODS: FoodCandidate[] = [
  {
    id: "frango",
    name: "Frango, peito, grelhado",
    category: "protein_meat",
    kcal: 159,
    proteinG: 32,
    carbsG: 0,
    fatG: 2.5,
    fiberG: 0,
    popularity: 90,
  },
  {
    id: "patinho",
    name: "Carne, patinho, grelhado",
    category: "protein_meat",
    kcal: 219,
    proteinG: 35,
    carbsG: 0,
    fatG: 7.3,
    fiberG: 0,
    popularity: 80,
  },
  {
    id: "ovo",
    name: "Ovo, cozido",
    category: "protein_egg",
    kcal: 146,
    proteinG: 13,
    carbsG: 0.6,
    fatG: 9.5,
    fiberG: 0,
    popularity: 85,
  },
  {
    id: "iogurte",
    name: "Iogurte natural",
    category: "dairy",
    kcal: 51,
    proteinG: 4.1,
    carbsG: 4.7,
    fatG: 1.9,
    fiberG: 0,
    popularity: 70,
  },
  {
    id: "arroz",
    name: "Arroz, integral, cozido",
    category: "grain",
    kcal: 124,
    proteinG: 2.6,
    carbsG: 25.8,
    fatG: 1,
    fiberG: 2.7,
    popularity: 95,
  },
  {
    id: "batata",
    name: "Batata, cozida",
    category: "tuber",
    kcal: 52,
    proteinG: 1.2,
    carbsG: 11.9,
    fatG: 0,
    fiberG: 1.3,
    popularity: 80,
  },
  {
    id: "feijao",
    name: "Feijão, carioca, cozido",
    category: "legume",
    kcal: 76,
    proteinG: 4.8,
    carbsG: 13.6,
    fatG: 0.5,
    fiberG: 8.5,
    popularity: 90,
  },
  {
    id: "aveia",
    name: "Aveia, flocos",
    category: "grain",
    kcal: 394,
    proteinG: 13.9,
    carbsG: 66.6,
    fatG: 8.5,
    fiberG: 9.1,
    popularity: 75,
  },
  {
    id: "azeite",
    name: "Azeite, de oliva",
    category: "fat",
    kcal: 884,
    proteinG: 0,
    carbsG: 0,
    fatG: 100,
    fiberG: 0,
    popularity: 70,
  },
  {
    id: "castanha",
    name: "Castanha-do-pará",
    category: "fat",
    kcal: 643,
    proteinG: 14.5,
    carbsG: 15.1,
    fatG: 63.5,
    fiberG: 7.9,
    popularity: 60,
  },
  {
    id: "brocolis",
    name: "Brócolis, cozido",
    category: "vegetable",
    kcal: 25,
    proteinG: 2.1,
    carbsG: 4.4,
    fatG: 0.5,
    fiberG: 3.4,
    popularity: 70,
  },
  {
    id: "banana",
    name: "Banana, prata",
    category: "fruit",
    kcal: 98,
    proteinG: 1.3,
    carbsG: 26,
    fatG: 0.1,
    fiberG: 2,
    popularity: 95,
  },
  {
    id: "maca",
    name: "Maçã, Fuji",
    category: "fruit",
    kcal: 56,
    proteinG: 0.3,
    carbsG: 15.2,
    fatG: 0,
    fiberG: 1.3,
    popularity: 90,
  },
  {
    id: "alface",
    name: "Alface, crespa",
    category: "vegetable",
    kcal: 11,
    proteinG: 1.3,
    carbsG: 1.7,
    fatG: 0.2,
    fiberG: 1.8,
    popularity: 65,
  },
];

const BASE = {
  kcalTarget: 2400,
  proteinTarget: 160,
  carbsTarget: 260,
  fatTarget: 67,
  // Anotado em vez de `as const`: a tupla readonly que o `as const` produz não é
  // atribuível ao `MealSlot[]` que o schema espera, e o erro aparecia em cada
  // um dos 15 usos deste fixture.
  slots: ["breakfast", "lunch", "afternoon_snack", "dinner"] as MealSlot[],
  foods: FOODS,
};

describe("foodRole", () => {
  it("classifica pelo papel no prato, não só pela categoria", () => {
    expect(foodRole(FOODS[0]!)).toBe("protein");
    expect(foodRole(FOODS[4]!)).toBe("carb");
    expect(foodRole(FOODS[8]!)).toBe("fat");
    expect(foodRole(FOODS[11]!)).toBe("produce");
  });

  it("corrige a categoria quando um macro domina — laticínio gorduroso é gordura", () => {
    const requeijao: FoodCandidate = {
      id: "req",
      name: "Requeijão cremoso",
      category: "dairy",
      kcal: 257,
      proteinG: 9.6,
      carbsG: 3,
      fatG: 23,
      fiberG: 0,
      popularity: 50,
    };
    expect(foodRole(requeijao)).toBe("fat");
  });

  it("mantém a categoria quando nenhum macro domina", () => {
    // Feijão é legume e distribui entre carboidrato e proteína: continua 'carb'.
    expect(foodRole(FOODS[6]!)).toBe("carb");
  });
});

describe("selectMealSlots", () => {
  it("prioriza refeições principais quando há poucas", () => {
    expect(selectMealSlots({ mealsPerDay: 3 })).toEqual(["breakfast", "lunch", "dinner"]);
  });

  it("o dia completo tem as oito refeições, inclusive pré e pós-treino", () => {
    const slots = selectMealSlots({ mealsPerDay: 8 });
    expect(slots).toEqual([
      "breakfast",
      "morning_snack",
      "lunch",
      "afternoon_snack",
      "pre_workout",
      "post_workout",
      "dinner",
      "supper",
    ]);
  });

  it("sem nenhum parâmetro, entrega o dia completo", () => {
    expect(selectMealSlots()).toHaveLength(8);
  });

  it("inclui pós-treino antes dos lanches secundários", () => {
    const slots = selectMealSlots({ mealsPerDay: 5 });
    expect(slots).toContain("post_workout");
  });

  it("devolve em ordem cronológica, não de prioridade", () => {
    const slots = selectMealSlots({ mealsPerDay: 5 });
    expect(slots.indexOf("breakfast")).toBeLessThan(slots.indexOf("lunch"));
    expect(slots.indexOf("lunch")).toBeLessThan(slots.indexOf("dinner"));
  });

  it("aceita no mínimo 3 refeições mesmo pedindo menos", () => {
    expect(selectMealSlots({ mealsPerDay: 1 })).toHaveLength(3);
  });
});

describe("distributeMeals", () => {
  it("as frações somam 1, independentemente de quantas refeições", () => {
    for (const n of [3, 4, 5, 6]) {
      const slots = selectMealSlots({ mealsPerDay: n, workoutMinutes: 18 * 60 });
      const soma = distributeMeals({ slots }).reduce((s, m) => s + m.share, 0);
      expect(soma).toBeCloseTo(1, 5);
    }
  });

  it("desloca os horários para quem acorda tarde", () => {
    const slots = ["breakfast", "lunch", "dinner"] as const;
    const normal = distributeMeals({ slots });
    const tarde = distributeMeals({ slots, wakeMinutes: 11 * 60 });
    expect(tarde[0]!.minutes).toBeGreaterThan(normal[0]!.minutes);
  });

  it("ancora pré e pós-treino no horário do treino, não no relógio", () => {
    const treino = 19 * 60;
    const meals = distributeMeals({
      slots: ["pre_workout", "post_workout"],
      workoutMinutes: treino,
    });
    expect(meals.find((m) => m.slot === "pre_workout")!.minutes).toBe(treino - 60);
    expect(meals.find((m) => m.slot === "post_workout")!.minutes).toBe(treino + 45);
  });

  it("quem dorme depois da meia-noite não tem as refeições espremidas", () => {
    const slots = ["breakfast", "lunch", "afternoon_snack", "dinner"] as const;
    const m = distributeMeals({ slots, wakeMinutes: 7 * 60, sleepMinutes: 30 });
    const min = m.map((x) => x.minutes);
    for (let i = 1; i < min.length; i++) expect(min[i]! - min[i - 1]!).toBeGreaterThanOrEqual(90);
    expect(min[1]).toBeGreaterThanOrEqual(11 * 60 + 30); // almoço no horário de almoço
  });

  it("cada refeição fica no seu período e com folga entre elas", () => {
    const slots = ["breakfast", "morning_snack", "lunch", "afternoon_snack", "dinner", "supper"] as const;
    const m = distributeMeals({ slots, wakeMinutes: 6 * 60, sleepMinutes: 22 * 60 + 30 });
    const por = Object.fromEntries(m.map((x) => [x.slot, x.minutes]));
    expect(por.lunch).toBeGreaterThanOrEqual(11 * 60 + 30);
    expect(por.lunch).toBeLessThanOrEqual(14 * 60 + 30);
    expect(por.dinner).toBeGreaterThanOrEqual(18 * 60 + 30);
    expect(por.supper).toBeLessThanOrEqual(22 * 60 + 30 - 60); // 1h antes de dormir
    const min = m.map((x) => x.minutes);
    for (let i = 1; i < min.length; i++) expect(min[i]! - min[i - 1]!).toBeGreaterThanOrEqual(90);
  });

  it("o café vem depois de acordar", () => {
    const m = distributeMeals({ slots: ["breakfast", "lunch", "dinner"], wakeMinutes: 9 * 60 });
    expect(m[0]!.minutes).toBeGreaterThanOrEqual(9 * 60 + 30);
  });

  it("mantém os horários dentro do dia", () => {
    const meals = distributeMeals({
      slots: ["pre_workout", "post_workout"],
      workoutMinutes: 23 * 60 + 50,
    });
    for (const m of meals) {
      expect(m.minutes).toBeGreaterThanOrEqual(0);
      expect(m.minutes).toBeLessThan(24 * 60);
    }
  });
});

describe("minutesToTime / timeToMinutes", () => {
  it("faz a ida e volta", () => {
    expect(minutesToTime(510)).toBe("08:30");
    expect(timeToMinutes("08:30")).toBe(510);
    expect(timeToMinutes("08:30:00")).toBe(510);
  });

  it("rejeita entrada inválida em vez de devolver lixo", () => {
    expect(timeToMinutes("")).toBeUndefined();
    expect(timeToMinutes(null)).toBeUndefined();
    expect(timeToMinutes("25:00")).toBeUndefined();
    expect(timeToMinutes("abc")).toBeUndefined();
  });
});

describe("generateMealPlan", () => {
  it("gera uma refeição por slot pedido", () => {
    const plan = generateMealPlan(BASE);
    expect(plan.meals.map((m) => m.slot)).toEqual([
      "breakfast",
      "lunch",
      "afternoon_snack",
      "dinner",
    ]);
  });

  it("nenhuma refeição sai vazia", () => {
    const plan = generateMealPlan(BASE);
    for (const meal of plan.meals) expect(meal.items.length).toBeGreaterThan(0);
  });

  it("nenhuma refeição sai vazia nem com o dia completo de oito", () => {
    const plan = generateMealPlan({ ...BASE, slots: selectMealSlots({ mealsPerDay: 8 }) });
    expect(plan.meals).toHaveLength(8);
    for (const meal of plan.meals) expect(meal.items.length).toBeGreaterThan(0);
  });

  it("nenhuma refeição sai vazia com um catálogo mínimo de um papel só", () => {
    // O caso que produzia "Nada planejado" na tela: pool sem carboidrato, sem
    // gordura e sem vegetal. Cada refeição ainda tem de sair com comida.
    const soProteina = FOODS.filter((f) => foodRole(f) === "protein").slice(0, 2);
    const plan = generateMealPlan({
      ...BASE,
      slots: selectMealSlots({ mealsPerDay: 8 }),
      foods: soProteina,
    });

    for (const meal of plan.meals) expect(meal.items.length).toBeGreaterThan(0);
  });

  it("chega perto da meta calórica", () => {
    const plan = generateMealPlan(BASE);
    const desvio = Math.abs(plan.totals.kcal - BASE.kcalTarget) / BASE.kcalTarget;
    expect(desvio).toBeLessThan(0.25);
  });

  it("entrega a maior parte da proteína alvo — é o macro que não se compensa", () => {
    const plan = generateMealPlan(BASE);
    expect(plan.totals.proteinG).toBeGreaterThan(BASE.proteinTarget * 0.75);
  });

  it("é determinístico: mesma entrada, mesmo plano", () => {
    const a = generateMealPlan(BASE);
    const b = generateMealPlan(BASE);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("sementes diferentes produzem cardápios diferentes", () => {
    const a = generateMealPlan({ ...BASE, seed: 0 });
    const b = generateMealPlan({ ...BASE, seed: 3 });
    expect(JSON.stringify(a.meals)).not.toBe(JSON.stringify(b.meals));
  });

  it("respeita os limites de porção — nada de 700 g de azeite", () => {
    const plan = generateMealPlan(BASE);
    for (const meal of plan.meals) {
      for (const item of meal.items) {
        expect(item.grams).toBeGreaterThan(0);
        if (item.role === "fat") expect(item.grams).toBeLessThanOrEqual(60);
        else expect(item.grams).toBeLessThanOrEqual(400);
      }
    }
  });

  it("prioriza alimentos que o usuário disse gostar", () => {
    const semPref = generateMealPlan(BASE);
    const comPref = generateMealPlan({ ...BASE, preferred: ["batata"] });
    const usaBatata = (p: typeof comPref) =>
      p.meals.some((m) => m.items.some((i) => i.foodId === "batata"));
    expect(usaBatata(comPref)).toBe(true);
    expect(usaBatata(semPref)).toBe(false);
  });

  it("avisa quando o catálogo é pequeno demais para variar", () => {
    const plan = generateMealPlan({ ...BASE, foods: FOODS.slice(0, 4) });
    expect(plan.warnings.some((w) => w.includes("Poucos alimentos"))).toBe(true);
  });

  it("varia os alimentos dentro do mesmo dia", () => {
    const plan = generateMealPlan(BASE);
    const proteinas = plan.meals
      .flatMap((m) => m.items)
      .filter((i) => i.role === "protein")
      .map((i) => i.foodId);
    expect(new Set(proteinas).size).toBeGreaterThan(1);
  });

  it("pré-treino não leva gordura", () => {
    const plan = generateMealPlan({
      ...BASE,
      slots: ["breakfast", "lunch", "pre_workout", "dinner"],
      workoutMinutes: 18 * 60,
    });
    const pre = plan.meals.find((m) => m.slot === "pre_workout")!;
    expect(pre.items.every((i) => i.role !== "fat")).toBe(true);
  });

  it("os alvos das refeições somam o alvo do dia", () => {
    const plan = generateMealPlan(BASE);
    const soma = plan.meals.reduce((s, m) => s + m.kcalTarget, 0);
    // Tolerância de arredondamento: cada alvo é arredondado para inteiro.
    expect(Math.abs(soma - BASE.kcalTarget)).toBeLessThan(plan.meals.length);
  });

  it("rejeita entrada inválida em vez de gerar plano sem sentido", () => {
    expect(() => generateMealPlan({ ...BASE, kcalTarget: -100 })).toThrow();
    expect(() => generateMealPlan({ ...BASE, foods: [] })).toThrow();
  });
});
