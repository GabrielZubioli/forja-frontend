import { describe, expect, it } from "vitest";
import { addUtcDays } from "../shared/dates";
import {
  adaptiveCalorieTarget,
  estimateTdeeSeries,
  latestEstimate,
  type DailyObservation,
} from "./adaptive-macros";

const K = 7700;

/** Gera observações diárias coerentes com o modelo de balanço energético. */
function simulate(opts: {
  trueTdee: number;
  intake: number;
  days: number;
  startWeight: number;
  start?: string;
}): DailyObservation[] {
  const { trueTdee, intake, days, startWeight, start = "2026-01-01" } = opts;
  const obs: DailyObservation[] = [];
  for (let i = 0; i < days; i++) {
    const weightKg = startWeight + (i * (intake - trueTdee)) / K;
    obs.push({ date: addUtcDays(start, i), weightKg, intakeKcal: intake });
  }
  return obs;
}

describe("estimateTdeeSeries", () => {
  it("converge para o TDEE real em manutenção (peso estável)", () => {
    const obs = simulate({ trueTdee: 2500, intake: 2500, days: 120, startWeight: 80 });
    const est = latestEstimate(estimateTdeeSeries(obs, { weightKg: 80, tdeeKcal: 2000 }));
    expect(est).not.toBeNull();
    expect(est!.tdeeKcal).toBeCloseTo(2500, -2); // dentro de ~50 kcal
    expect(est!.weightKg).toBeCloseTo(80, 0); // dentro de ~0,5 kg
  });

  it("recupera o TDEE real a partir da inclinação do peso em superávit", () => {
    const obs = simulate({ trueTdee: 2500, intake: 3000, days: 180, startWeight: 80 });
    const est = latestEstimate(estimateTdeeSeries(obs, { weightKg: 80, tdeeKcal: 2200 }));
    expect(est!.tdeeKcal).toBeGreaterThan(2400);
    expect(est!.tdeeKcal).toBeLessThan(2600);
  });

  it("apenas prediz (sem divergir) em dias sem pesagem", () => {
    const obs = simulate({ trueTdee: 2500, intake: 2500, days: 30, startWeight: 80 }).map((o, i) =>
      i % 3 === 0 ? o : { ...o, weightKg: null },
    );
    const series = estimateTdeeSeries(obs, { weightKg: 80, tdeeKcal: 2400 });
    expect(series).toHaveLength(30);
    expect(Number.isFinite(series[29]!.tdeeKcal)).toBe(true);
  });

  it("é robusto a ruído de balança (não explode)", () => {
    const base = simulate({ trueTdee: 2600, intake: 2600, days: 100, startWeight: 75 });
    // ruído determinístico ±0.6 kg
    const noisy = base.map((o, i) => ({
      ...o,
      weightKg: (o.weightKg ?? 0) + (i % 2 === 0 ? 0.6 : -0.6),
    }));
    const est = latestEstimate(estimateTdeeSeries(noisy, { weightKg: 75, tdeeKcal: 2600 }));
    expect(est!.tdeeKcal).toBeGreaterThan(2450);
    expect(est!.tdeeKcal).toBeLessThan(2750);
  });
});

describe("adaptiveCalorieTarget", () => {
  it("desconta o déficit para a perda semanal desejada", () => {
    // -0,5 kg/semana ⇒ -550 kcal/dia
    expect(adaptiveCalorieTarget(2500, -0.5)).toBe(1950);
    expect(adaptiveCalorieTarget(2500, 0)).toBe(2500);
    expect(adaptiveCalorieTarget(2500, 0.25)).toBe(2500 + Math.round((0.25 * 7700) / 7));
  });
});
