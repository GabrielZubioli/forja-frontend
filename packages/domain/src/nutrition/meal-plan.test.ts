import { describe, expect, it } from "vitest";
import { distributeMeals, selectMealSlots, minutesToTime, timeToMinutes } from "./meal-slots";
import { foodRole, type FoodCandidate } from "./food-catalog";

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

  it("sem nenhum parâmetro, entrega o padrão de cinco refeições", () => {
    expect(selectMealSlots()).toEqual([
      "breakfast",
      "lunch",
      "afternoon_snack",
      "post_workout",
      "dinner",
    ]);
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
    const slots = [
      "breakfast",
      "morning_snack",
      "lunch",
      "afternoon_snack",
      "dinner",
      "supper",
    ] as const;
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
