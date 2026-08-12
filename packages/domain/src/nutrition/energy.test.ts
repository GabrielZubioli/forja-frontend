import { describe, expect, it } from "vitest";
import { bmrMifflin, goalCalories, macroTargets, tdee } from "./energy";

describe("bmrMifflin", () => {
  it("aplica o offset por sexo", () => {
    const base = { weightKg: 80, heightCm: 180, ageYears: 30 };
    expect(bmrMifflin({ ...base, sex: "male" })).toBeCloseTo(1780, 5);
    expect(bmrMifflin({ ...base, sex: "female" })).toBeCloseTo(1614, 5);
    expect(bmrMifflin({ ...base, sex: "other" })).toBeCloseTo(1697, 5);
  });
  it("nunca é negativo", () => {
    expect(bmrMifflin({ sex: "male", weightKg: 1, heightCm: 1, ageYears: 200 })).toBe(0);
  });
});

describe("tdee", () => {
  it("multiplica pelo fator de atividade", () => {
    expect(tdee(1800, "sedentary")).toBeCloseTo(2160, 5);
    expect(tdee(1800, "very_active")).toBeCloseTo(3420, 5);
  });
});

describe("goalCalories", () => {
  it("aplica déficit/superávit", () => {
    expect(goalCalories(2000, "lose")).toBe(1700);
    expect(goalCalories(2000, "gain")).toBe(2200);
    expect(goalCalories(2000, "maintain")).toBe(2000);
  });
});

describe("macroTargets", () => {
  it("proteína 2g/kg, gordura 25%, resto carbo", () => {
    const m = macroTargets(2000, 80);
    expect(m.protein_g).toBe(160);
    expect(m.fat_g).toBe(56); // 2000*0.25/9 ≈ 55.6
    expect(m.fiber_g).toBe(28); // 2000/1000*14
    // carbo = (2000 - 160*4 - 56*9)/4 = (2000-640-504)/4 = 214
    expect(m.carbs_g).toBe(214);
  });
});
