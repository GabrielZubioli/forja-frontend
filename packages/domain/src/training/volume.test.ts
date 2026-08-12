import { describe, expect, it } from "vitest";
import {
  aggregateMuscleVolume,
  countWorkingSets,
  distributeToMuscles,
  sessionVolume,
  setVolume,
  type ExerciseSetInput,
  type MuscleContribution,
} from "./volume";

describe("setVolume", () => {
  it("multiplica peso por reps", () => {
    expect(setVolume(100, 5)).toBe(500);
  });
  it("retorna 0 quando falta peso ou reps (ex.: cardio)", () => {
    expect(setVolume(null, 10)).toBe(0);
    expect(setVolume(50, null)).toBe(0);
    expect(setVolume(0, 10)).toBe(0);
  });
});

describe("distributeToMuscles", () => {
  it("distribui a métrica pelos pesos de contribuição", () => {
    const contributions: MuscleContribution[] = [
      { muscle: "chest", weight: 1 },
      { muscle: "triceps", weight: 0.5 },
    ];
    expect(distributeToMuscles(500, contributions)).toEqual({ chest: 500, triceps: 250 });
  });
});

describe("aggregateMuscleVolume", () => {
  it("soma tonelagem e séries efetivas por músculo, ignorando aquecimento", () => {
    const bench: MuscleContribution[] = [
      { muscle: "chest", weight: 1 },
      { muscle: "triceps", weight: 0.5 },
    ];
    const sets: ExerciseSetInput[] = [
      { contributions: bench, weightKg: 60, reps: 10, isWarmup: true },
      { contributions: bench, weightKg: 100, reps: 5 },
      { contributions: bench, weightKg: 100, reps: 5 },
    ];
    const { tonnage, workingSets } = aggregateMuscleVolume(sets);
    // 2 séries válidas × 500 kg = 1000 no peito; metade no tríceps
    expect(tonnage.chest).toBe(1000);
    expect(tonnage.triceps).toBe(500);
    expect(workingSets.chest).toBe(2);
    expect(workingSets.triceps).toBe(1);
  });
});

describe("sessionVolume / countWorkingSets", () => {
  it("ignora aquecimento e séries não concluídas", () => {
    const sets = [
      { weightKg: 60, reps: 10, setType: "warmup", completed: true }, // aquecimento
      { weightKg: 100, reps: 5, setType: "working", completed: true }, // 500
      { weightKg: 100, reps: 5, setType: "working", completed: false }, // planejada
      { weightKg: 90, reps: 8, setType: "drop", completed: true }, // 720
    ];
    expect(sessionVolume(sets)).toBe(1220);
    expect(countWorkingSets(sets)).toBe(2);
  });

  it("converte NUMERIC vindo como string do Postgres", () => {
    const sets = [{ weightKg: "80.5", reps: "10", setType: "working", completed: true }];
    expect(sessionVolume(sets)).toBeCloseTo(805);
  });

  it("trata cardio (sem peso/reps) como volume zero", () => {
    const sets = [{ weightKg: null, reps: null, setType: "working", completed: true }];
    expect(sessionVolume(sets)).toBe(0);
    expect(countWorkingSets(sets)).toBe(1);
  });

  it("conta séries sem flag de completed (padrão do banco é true)", () => {
    const sets = [{ weightKg: 50, reps: 10 }];
    expect(sessionVolume(sets)).toBe(500);
  });
});
