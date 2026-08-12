import { describe, expect, it } from "vitest";
import { describeSubstitution, findSubstitutions } from "./substitutions";
import { waterTargetMl } from "./hydration";
import type { FoodCandidate } from "./food-catalog";

const POOL: FoodCandidate[] = [
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
    id: "tilapia",
    name: "Tilápia, filé, grelhado",
    category: "protein_meat",
    kcal: 128,
    proteinG: 26,
    carbsG: 0,
    fatG: 2.6,
    fiberG: 0,
    popularity: 70,
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
    id: "picanha",
    name: "Carne, picanha, grelhada",
    category: "protein_meat",
    kcal: 289,
    proteinG: 26,
    carbsG: 0,
    fatG: 20,
    fiberG: 0,
    popularity: 60,
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
    id: "arroz",
    name: "Arroz, branco, cozido",
    category: "grain",
    kcal: 128,
    proteinG: 2.5,
    carbsG: 28.1,
    fatG: 0.2,
    fiberG: 1.6,
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
    id: "macarrao",
    name: "Macarrão, cozido",
    category: "grain",
    kcal: 111,
    proteinG: 3.7,
    carbsG: 23,
    fatG: 0.6,
    fiberG: 1.6,
    popularity: 85,
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
];

const byId = (id: string) => POOL.find((f) => f.id === id)!;

describe("findSubstitutions", () => {
  it("nunca sugere o próprio alimento", () => {
    const subs = findSubstitutions(byId("frango"), 150, POOL);
    expect(subs.every((s) => s.food.id !== "frango")).toBe(true);
  });

  it("não atravessa papéis: proteína não vira azeite nem arroz", () => {
    const subs = findSubstitutions(byId("frango"), 150, POOL);
    const ids = subs.map((s) => s.food.id);
    expect(ids).not.toContain("azeite");
    expect(ids).not.toContain("arroz");
  });

  it("ajusta a quantidade para preservar o macro dominante", () => {
    // 150 g de frango = 48 g de proteína. Tilápia tem 26 g/100 g,
    // então precisa de ~185 g para entregar o mesmo.
    const sub = findSubstitutions(byId("frango"), 150, POOL).find((s) => s.food.id === "tilapia")!;
    const proteinaEntregue = (byId("tilapia").proteinG * sub.grams) / 100;
    expect(proteinaEntregue).toBeCloseTo(48, 0);
    expect(sub.grams).toBeGreaterThan(150);
  });

  it("prefere o corte magro ao gordo quando o original é magro", () => {
    const subs = findSubstitutions(byId("frango"), 150, POOL);
    const tilapia = subs.findIndex((s) => s.food.id === "tilapia");
    const picanha = subs.findIndex((s) => s.food.id === "picanha");
    expect(tilapia).toBeLessThan(picanha);
  });

  it("ordena do mais próximo ao mais distante", () => {
    const subs = findSubstitutions(byId("arroz"), 100, POOL);
    for (let i = 1; i < subs.length; i++) {
      expect(subs[i]!.distance).toBeGreaterThanOrEqual(subs[i - 1]!.distance);
    }
  });

  it("respeita a escolha anterior do usuário acima da proximidade teórica", () => {
    const semPref = findSubstitutions(byId("frango"), 150, POOL);
    const comPref = findSubstitutions(byId("frango"), 150, POOL, { preferredIds: ["picanha"] });
    expect(comPref[0]!.food.id).toBe("picanha");
    expect(semPref[0]!.food.id).not.toBe("picanha");
  });

  it("informa o custo da troca em macros", () => {
    const sub = findSubstitutions(byId("frango"), 150, POOL).find((s) => s.food.id === "picanha")!;
    // Picanha na quantidade isoproteica carrega muito mais gordura.
    expect(sub.delta.fatG).toBeGreaterThan(10);
  });

  it("respeita o limite de resultados", () => {
    expect(findSubstitutions(byId("frango"), 150, POOL, { limit: 2 })).toHaveLength(2);
  });

  it("permite atravessar papéis quando pedido explicitamente", () => {
    const subs = findSubstitutions(byId("frango"), 150, POOL, { sameRoleOnly: false });
    expect(subs.some((s) => s.food.id === "arroz" || s.food.id === "azeite")).toBe(true);
  });

  it("mantém as gramas executáveis na cozinha", () => {
    for (const sub of findSubstitutions(byId("arroz"), 130, POOL)) {
      expect(sub.grams % 5).toBe(0);
    }
  });

  it("devolve lista vazia quando não há alternativa no papel", () => {
    expect(findSubstitutions(byId("azeite"), 10, [byId("azeite")])).toEqual([]);
  });
});

describe("describeSubstitution", () => {
  it("traduz a distância para a pergunta que o usuário faz", () => {
    expect(describeSubstitution({ distance: 0.05 } as never)).toBe("Praticamente equivalente");
    expect(describeSubstitution({ distance: 0.9 } as never)).toContain("Aproximado");
  });
});

describe("waterTargetMl", () => {
  it("acompanha o peso, em vez de fixar 2 litros para todo mundo", () => {
    expect(waterTargetMl({ weightKg: 50 })).toBeLessThan(waterTargetMl({ weightKg: 100 }));
  });

  it("soma a perda do treino", () => {
    const parado = waterTargetMl({ weightKg: 80 });
    const treinando = waterTargetMl({ weightKg: 80, trainingMinutes: 60 });
    expect(treinando - parado).toBeCloseTo(500, -2);
  });

  it("aumenta no calor", () => {
    expect(waterTargetMl({ weightKg: 80, hotClimate: true })).toBeGreaterThan(
      waterTargetMl({ weightKg: 80 }),
    );
  });

  it("arredonda para 100 ml — precisão de mililitro numa estimativa é ruído", () => {
    expect(waterTargetMl({ weightKg: 73 }) % 100).toBe(0);
  });
});
