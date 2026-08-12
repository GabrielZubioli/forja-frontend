import { describe, expect, it } from "vitest";
import { bmi, goalProgress, navyBodyFat, weeklyRate } from "./composition";

describe("bmi", () => {
  it("calcula e classifica", () => {
    expect(bmi(70, 175)).toEqual({ bmi: 22.9, category: "normal" });
    expect(bmi(50, 175).category).toBe("underweight");
    expect(bmi(85, 175).category).toBe("overweight");
    expect(bmi(95, 175).category).toBe("obese_1");
  });

  it("não quebra com altura inválida", () => {
    expect(bmi(70, 0).bmi).toBe(0);
  });

  it("classifica um praticante musculoso como obeso — a limitação que a UI declara", () => {
    // 90 kg e 1,75 m com gordura baixa cai em "obeso grau I". O IMC não
    // distingue músculo de gordura, e o teste registra isso como conhecido.
    expect(bmi(92, 175).category).toBe("obese_1");
  });
});

describe("navyBodyFat", () => {
  it("estima para homens", () => {
    const r = navyBodyFat({ sex: "male", heightCm: 178, neckCm: 39, waistCm: 85 });
    expect(r).toBeGreaterThan(10);
    expect(r).toBeLessThan(25);
  });

  it("estima para mulheres, exigindo o quadril", () => {
    const comQuadril = navyBodyFat({
      sex: "female",
      heightCm: 165,
      neckCm: 32,
      waistCm: 72,
      hipCm: 96,
    });
    expect(comQuadril).toBeGreaterThan(15);

    // Sem quadril a fórmula feminina não existe: devolver um número seria pior
    // que devolver nada.
    expect(navyBodyFat({ sex: "female", heightCm: 165, neckCm: 32, waistCm: 72 })).toBeNull();
  });

  it("recusa medidas impossíveis em vez de devolver lixo", () => {
    // Cintura menor que o pescoço é erro de medição, não um corpo.
    expect(navyBodyFat({ sex: "male", heightCm: 178, neckCm: 40, waistCm: 38 })).toBeNull();
    expect(navyBodyFat({ sex: "male", heightCm: 0, neckCm: 39, waistCm: 85 })).toBeNull();
  });

  it("responde à mudança de cintura, que é o ponto do acompanhamento", () => {
    const antes = navyBodyFat({ sex: "male", heightCm: 178, neckCm: 39, waistCm: 95 })!;
    const depois = navyBodyFat({ sex: "male", heightCm: 178, neckCm: 39, waistCm: 85 })!;
    expect(depois).toBeLessThan(antes);
  });

  it("usa a fórmula masculina para 'other', por falta de alternativa validada", () => {
    const other = navyBodyFat({ sex: "other", heightCm: 178, neckCm: 39, waistCm: 85 });
    const male = navyBodyFat({ sex: "male", heightCm: 178, neckCm: 39, waistCm: 85 });
    expect(other).toBe(male);
  });
});

describe("goalProgress", () => {
  it("mede a partir do início, não do zero", () => {
    // 100 → 90 com meta 85 é 66% do caminho, não 94%.
    const p = goalProgress(100, 90, 85);
    expect(p.ratio).toBeCloseTo(0.667, 2);
    expect(p.remaining).toBe(5);
    expect(p.achieved).toBe(false);
  });

  it("funciona nas duas direções", () => {
    const ganho = goalProgress(70, 74, 78);
    expect(ganho.ratio).toBeCloseTo(0.5, 2);
    expect(ganho.achieved).toBe(false);

    expect(goalProgress(70, 80, 78).achieved).toBe(true);
    expect(goalProgress(100, 84, 85).achieved).toBe(true);
  });

  it("não devolve progresso negativo quando a pessoa vai para o lado errado", () => {
    expect(goalProgress(100, 103, 85).ratio).toBe(0);
  });

  it("trata meta igual ao início como já cumprida", () => {
    expect(goalProgress(80, 80, 80)).toEqual({ ratio: 1, remaining: 0, achieved: true });
  });
});

describe("weeklyRate", () => {
  const serie = (pesos: readonly number[]) =>
    pesos.map((weightKg, dayIndex) => ({ dayIndex, weightKg }));

  it("recusa-se a estimar com poucos pontos", () => {
    expect(weeklyRate(serie([80, 79.8, 79.6]))).toBeNull();
  });

  it("estima a inclinação semanal", () => {
    // −0,1 kg/dia = −0,7 kg/semana.
    expect(weeklyRate(serie([80, 79.9, 79.8, 79.7, 79.6, 79.5, 79.4, 79.3]))).toBeCloseTo(-0.7, 1);
  });

  it("resiste ao ruído diário — é o motivo de usar regressão", () => {
    // Mesma tendência de queda, com oscilação de água entre as pesagens.
    const comRuido = weeklyRate(serie([80, 80.6, 79.4, 79.9, 79.2, 79.7, 78.9, 79.2]))!;
    expect(comRuido).toBeLessThan(0);
    expect(comRuido).toBeGreaterThan(-2);
  });

  it("devolve ~0 para peso estável", () => {
    expect(Math.abs(weeklyRate(serie([80, 80, 80, 80, 80, 80]))!)).toBeLessThan(0.05);
  });

  it("não quebra quando todas as pesagens são do mesmo dia", () => {
    const mesmoDia = [80, 80.2, 80.1, 79.9].map((weightKg) => ({ dayIndex: 0, weightKg }));
    expect(weeklyRate(mesmoDia)).toBeNull();
  });
});
