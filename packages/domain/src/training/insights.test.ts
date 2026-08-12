import { describe, expect, it } from "vitest";
import {
  analyzeAdherence,
  analyzeEnergyAlignment,
  analyzeStagnation,
  analyzeWeeklyVolume,
  type ExerciseSessionSummary,
} from "./insights";

/** Sessões com e1RM crescente, decrescente ou parado, conforme o passo. */
function series(
  pesos: readonly number[],
  reps = 8,
  rpes?: readonly number[],
): ExerciseSessionSummary[] {
  return pesos.map((w, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, "0")}`,
    bestWeightKg: w,
    bestReps: reps,
    volumeKg: w * reps * 3,
    ...(rpes ? { avgRpe: rpes[i] } : {}),
  }));
}

describe("analyzeStagnation", () => {
  it("recusa-se a concluir com poucas sessões e diz quantas faltam", () => {
    const v = analyzeStagnation(series([60, 62]));
    expect(v.kind).toBe("insufficient_data");
    if (v.kind === "insufficient_data") expect(v.sessionsNeeded).toBe(2);
  });

  it("reconhece progressão", () => {
    expect(analyzeStagnation(series([60, 62.5, 65, 67.5])).kind).toBe("progressing");
  });

  it("reconhece platô quando a carga não sai do lugar", () => {
    const v = analyzeStagnation(series([60, 60, 60, 60]));
    expect(v.kind).toBe("plateau");
  });

  it("enxerga progresso em repetições, não só em carga", () => {
    // Mesma carga, mais repetições: é exatamente como a dupla progressão avança.
    const sessions: ExerciseSessionSummary[] = [8, 9, 10, 12].map((reps, i) => ({
      date: `2026-07-0${i + 1}`,
      bestWeightKg: 60,
      bestReps: reps,
      volumeKg: 60 * reps * 3,
    }));
    expect(analyzeStagnation(sessions).kind).toBe("progressing");
  });

  it("reconhece regressão", () => {
    expect(analyzeStagnation(series([70, 68, 65, 62])).kind).toBe("regressing");
  });

  it("distingue fadiga acumulada de simples platô", () => {
    // Desempenho parado E esforço subindo: descarga, não mais volume.
    const v = analyzeStagnation(series([60, 60, 60, 60], 8, [7, 7.5, 8.5, 9]));
    expect(v.kind).toBe("overreaching");
    if (v.kind === "overreaching") expect(v.rpeIncrease).toBeCloseTo(2, 1);
  });

  it("não confunde progressão com fadiga, mesmo com RPE subindo", () => {
    const v = analyzeStagnation(series([60, 63, 66, 70], 8, [7, 7.5, 8, 8.5]));
    expect(v.kind).toBe("progressing");
  });

  it("tolera uma sessão ruim isolada no fim", () => {
    // Três sessões subindo e uma queda pontual não são regressão.
    const v = analyzeStagnation(series([60, 64, 68, 66]));
    expect(v.kind).not.toBe("regressing");
  });

  it("aceita sessões fora de ordem", () => {
    const desordenadas = [...series([60, 62.5, 65, 67.5])].reverse();
    expect(analyzeStagnation(desordenadas).kind).toBe("progressing");
  });
});

describe("analyzeWeeklyVolume", () => {
  it("classifica em abaixo, produtivo e acima", () => {
    const r = analyzeWeeklyVolume([
      { muscle: "chest", sets: 4 },
      { muscle: "back", sets: 15 },
      { muscle: "quads", sets: 28 },
    ]);
    expect(r.map((x) => x.status)).toEqual(["low", "productive", "high"]);
  });

  it("ignora grupos que recebem muito volume indireto", () => {
    // Contar bíceps isoladamente geraria alerta falso: toda remada o estimula.
    expect(analyzeWeeklyVolume([{ muscle: "biceps", sets: 2 }])).toEqual([]);
    expect(analyzeWeeklyVolume([{ muscle: "calves", sets: 1 }])).toEqual([]);
  });

  it("devolve a faixa junto do veredito, para a UI explicar o número", () => {
    const [r] = analyzeWeeklyVolume([{ muscle: "chest", sets: 4 }]);
    expect(r!.range).toEqual({ min: 10, max: 20 });
  });
});

describe("analyzeAdherence", () => {
  const base = {
    workoutsLast7: 4,
    plannedPerWeek: 4,
    loggedDaysLast7: 7,
    daysSinceWeighIn: 2,
  };

  it("diz que está em dia quando está", () => {
    expect(analyzeAdherence(base)).toEqual([{ kind: "on_track" }]);
  });

  it("tolera uma falta — cobrar por uma é pressão sem informação", () => {
    expect(analyzeAdherence({ ...base, workoutsLast7: 3 })).toEqual([{ kind: "on_track" }]);
  });

  it("sinaliza a partir de duas faltas", () => {
    const flags = analyzeAdherence({ ...base, workoutsLast7: 2 });
    expect(flags[0]).toEqual({ kind: "workouts_behind", missing: 2 });
  });

  it("sinaliza diário abandonado", () => {
    const flags = analyzeAdherence({ ...base, loggedDaysLast7: 1 });
    expect(flags.some((f) => f.kind === "diet_untracked")).toBe(true);
  });

  it("sinaliza pesagem atrasada", () => {
    const flags = analyzeAdherence({ ...base, daysSinceWeighIn: 14 });
    expect(flags.some((f) => f.kind === "weigh_in_overdue")).toBe(true);
  });

  it("não cobra pesagem de quem nunca pesou", () => {
    // Quem nunca pesou está no onboarding, não atrasado.
    const flags = analyzeAdherence({ ...base, daysSinceWeighIn: null });
    expect(flags.some((f) => f.kind === "weigh_in_overdue")).toBe(false);
  });

  it("ordena por impacto: treino antes de dieta", () => {
    const flags = analyzeAdherence({ ...base, workoutsLast7: 0, loggedDaysLast7: 0 });
    expect(flags[0]!.kind).toBe("workouts_behind");
  });
});

describe("analyzeEnergyAlignment", () => {
  const base = { currentKcalTarget: 2400, loggedDays: 21 };

  it("recusa-se a concluir com menos de duas semanas", () => {
    const v = analyzeEnergyAlignment({
      ...base,
      loggedDays: 5,
      weeklyWeightChangeKg: -1,
      goal: "lose",
    });
    expect(v.kind).toBe("insufficient_data");
    if (v.kind === "insufficient_data") expect(v.daysNeeded).toBe(9);
  });

  it("aprova um ritmo de perda sustentável", () => {
    expect(analyzeEnergyAlignment({ ...base, weeklyWeightChangeKg: -0.5, goal: "lose" }).kind).toBe(
      "aligned",
    );
  });

  it("manda comer MAIS quando a perda está rápida demais", () => {
    const v = analyzeEnergyAlignment({ ...base, weeklyWeightChangeKg: -1.5, goal: "lose" });
    expect(v.kind).toBe("too_fast");
    if (v.kind === "too_fast") expect(v.suggestedKcal).toBeGreaterThan(base.currentKcalTarget);
  });

  it("manda comer MENOS quando a perda travou", () => {
    const v = analyzeEnergyAlignment({ ...base, weeklyWeightChangeKg: 0, goal: "lose" });
    expect(v.kind).toBe("too_slow");
    if (v.kind === "too_slow") expect(v.suggestedKcal).toBeLessThan(base.currentKcalTarget);
  });

  it("trata ganho rápido demais como excesso, não como sucesso", () => {
    const v = analyzeEnergyAlignment({ ...base, weeklyWeightChangeKg: 0.9, goal: "gain" });
    expect(v.kind).toBe("too_fast");
    if (v.kind === "too_fast") expect(v.suggestedKcal).toBeLessThan(base.currentKcalTarget);
  });

  it("aceita oscilação pequena em manutenção", () => {
    expect(
      analyzeEnergyAlignment({ ...base, weeklyWeightChangeKg: 0.1, goal: "maintain" }).kind,
    ).toBe("aligned");
  });

  it("ajusta em passos modestos, para não perseguir a balança", () => {
    const v = analyzeEnergyAlignment({ ...base, weeklyWeightChangeKg: -1.5, goal: "lose" });
    if (v.kind === "too_fast") {
      const variacao = Math.abs(v.suggestedKcal - base.currentKcalTarget) / base.currentKcalTarget;
      expect(variacao).toBeLessThanOrEqual(0.12);
    }
  });
});
