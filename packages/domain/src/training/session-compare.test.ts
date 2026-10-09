import { describe, expect, it } from "vitest";
import { compareWithLastSession } from "./session-compare";

const hoje = (sets: { weightKg: number | null; reps: number | null }[]) => [
  { exerciseId: "supino", name: "Supino", sets },
];

describe("compareWithLastSession", () => {
  it("subiu quando a melhor série tem 1RM estimado maior", () => {
    const r = compareWithLastSession(
      hoje([{ weightKg: 62.5, reps: 8 }]),
      new Map([["supino", [{ weightKg: 60, reps: 8 }]]]),
    );
    expect(r[0]!.trend).toBe("up");
    expect(r[0]!.previousBest).toEqual({ weightKg: 60, reps: 8 });
  });

  it("caiu quando piorou e igual dentro de 1%", () => {
    const anterior = new Map([["supino", [{ weightKg: 60, reps: 8 }]]]);
    expect(compareWithLastSession(hoje([{ weightKg: 55, reps: 8 }]), anterior)[0]!.trend).toBe(
      "down",
    );
    expect(compareWithLastSession(hoje([{ weightKg: 60, reps: 8 }]), anterior)[0]!.trend).toBe(
      "same",
    );
  });

  it("primeira vez no exercício é 'new'", () => {
    expect(compareWithLastSession(hoje([{ weightKg: 40, reps: 10 }]), new Map())[0]!.trend).toBe(
      "new",
    );
  });

  it("peso corporal compara repetições", () => {
    const r = compareWithLastSession(
      hoje([{ weightKg: null, reps: 12 }]),
      new Map([["supino", [{ weightKg: null, reps: 10 }]]]),
    );
    expect(r[0]!.trend).toBe("up");
  });

  it("ignora séries sem repetição ao escolher a melhor", () => {
    const r = compareWithLastSession(
      hoje([
        { weightKg: 100, reps: 0 },
        { weightKg: 50, reps: 5 },
      ]),
      new Map(),
    );
    expect(r[0]!.best).toEqual({ weightKg: 50, reps: 5 });
  });
});
