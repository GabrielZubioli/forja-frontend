import { describe, expect, it } from "vitest";
import {
  nutritionTotals,
  perServing,
  portionFactor,
  portionGrams,
  portionMacros,
  type Portion,
} from "./totals";

/** Arroz cozido: valores por 100 g. */
const arroz = {
  servingSizeG: 100,
  kcal: 128,
  proteinG: 2.5,
  carbsG: 28.1,
  fatG: 0.2,
  fiberG: 1.6,
};

describe("portionGrams", () => {
  it("usa gramas explícitas quando informadas", () => {
    expect(portionGrams({ food: arroz, grams: 150 })).toBe(150);
  });

  it("deriva de servings quando não há gramas", () => {
    expect(portionGrams({ food: arroz, servings: 2 })).toBe(200);
  });

  it("aceita zero gramas como valor explícito válido", () => {
    expect(portionGrams({ food: arroz, grams: 0 })).toBe(0);
  });

  it("assume 1 porção quando faltam gramas e servings", () => {
    expect(portionGrams({ food: arroz })).toBe(100);
  });
});

describe("portionFactor", () => {
  it("converte gramas na proporção da porção de referência", () => {
    expect(portionFactor({ food: arroz, grams: 250 })).toBe(2.5);
  });

  it("respeita porções de referência diferentes de 100 g", () => {
    const whey = { ...arroz, servingSizeG: 30 };
    expect(portionFactor({ food: whey, grams: 60 })).toBe(2);
  });

  it("não divide por zero quando serving_size_g é inválido", () => {
    const quebrado = { ...arroz, servingSizeG: 0 };
    expect(portionFactor({ food: quebrado, grams: 100 })).toBe(1);
  });
});

describe("portionMacros", () => {
  it("escala todos os macros pelo fator da porção", () => {
    const m = portionMacros({ food: arroz, grams: 200 });
    expect(m.kcal).toBeCloseTo(256);
    expect(m.proteinG).toBeCloseTo(5);
    expect(m.carbsG).toBeCloseTo(56.2);
    expect(m.fatG).toBeCloseTo(0.4);
    expect(m.fiberG).toBeCloseTo(3.2);
  });

  it("converte campos NUMERIC que chegam como string do Postgres", () => {
    const doBanco = {
      servingSizeG: "100",
      kcal: "128",
      proteinG: "2.5",
      carbsG: "28.1",
      fatG: "0.2",
      fiberG: "1.6",
    };
    const m = portionMacros({ food: doBanco, grams: "200" });
    expect(m.kcal).toBeCloseTo(256);
    expect(m.proteinG).toBeCloseTo(5);
  });

  it("trata macros nulos como zero em vez de NaN", () => {
    const semFibra = { ...arroz, fiberG: null, fatG: null };
    const m = portionMacros({ food: semFibra, grams: 100 });
    expect(m.fiberG).toBe(0);
    expect(m.fatG).toBe(0);
    expect(Number.isNaN(m.kcal)).toBe(false);
  });
});

describe("nutritionTotals", () => {
  it("retorna zeros para lista vazia", () => {
    expect(nutritionTotals([])).toEqual({
      kcal: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      fiberG: 0,
    });
  });

  it("soma múltiplas porções", () => {
    const frango = {
      servingSizeG: 100,
      kcal: 165,
      proteinG: 31,
      carbsG: 0,
      fatG: 3.6,
      fiberG: 0,
    };
    const refeicao: Portion[] = [
      { food: arroz, grams: 150 },
      { food: frango, grams: 200 },
    ];
    const t = nutritionTotals(refeicao);
    expect(t.kcal).toBeCloseTo(128 * 1.5 + 165 * 2);
    expect(t.proteinG).toBeCloseTo(2.5 * 1.5 + 31 * 2);
  });

  it("não muta o objeto de zeros compartilhado entre chamadas", () => {
    nutritionTotals([{ food: arroz, grams: 100 }]);
    expect(nutritionTotals([])).toEqual({
      kcal: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      fiberG: 0,
    });
  });
});

describe("perServing", () => {
  it("divide os totais pelo número de porções", () => {
    const totais = nutritionTotals([{ food: arroz, grams: 400 }]);
    const porPorcao = perServing(totais, 4);
    expect(porPorcao.kcal).toBeCloseTo(128);
  });

  it("trata 0 porções como 1 em vez de gerar Infinity", () => {
    const totais = nutritionTotals([{ food: arroz, grams: 100 }]);
    expect(perServing(totais, 0).kcal).toBeCloseTo(128);
  });
});
