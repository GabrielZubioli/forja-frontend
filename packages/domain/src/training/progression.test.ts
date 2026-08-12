import { describe, expect, it } from "vitest";
import { nextDoubleProgression, type DoubleProgressionConfig } from "./progression";

const config: DoubleProgressionConfig = {
  minReps: 8,
  maxReps: 12,
  incrementKg: 2.5,
  workingSets: 3,
};

describe("nextDoubleProgression", () => {
  it("gradua o peso quando todas as séries batem o topo da faixa", () => {
    const res = nextDoubleProgression(
      [
        { weightKg: 50, reps: 12 },
        { weightKg: 50, reps: 12 },
        { weightKg: 50, reps: 12 },
      ],
      config,
    );
    expect(res).toEqual({ weightKg: 52.5, targetReps: 8, advanced: true });
  });

  it("mantém o peso e mira uma rep a mais quando não bateu o topo", () => {
    const res = nextDoubleProgression(
      [
        { weightKg: 50, reps: 10 },
        { weightKg: 50, reps: 9 },
        { weightKg: 50, reps: 8 },
      ],
      config,
    );
    expect(res.advanced).toBe(false);
    expect(res.weightKg).toBe(50);
    expect(res.targetReps).toBe(11); // melhor foi 10 → mira 11
  });

  it("não gradua se apenas algumas séries bateram o topo", () => {
    const res = nextDoubleProgression(
      [
        { weightKg: 50, reps: 12 },
        { weightKg: 50, reps: 12 },
        { weightKg: 50, reps: 10 },
      ],
      config,
    );
    expect(res.advanced).toBe(false);
    expect(res.weightKg).toBe(50);
  });

  it("ignora séries de aquecimento e usa o maior peso de trabalho", () => {
    const res = nextDoubleProgression(
      [
        { weightKg: 20, reps: 15, isWarmup: true },
        { weightKg: 50, reps: 12 },
        { weightKg: 50, reps: 12 },
        { weightKg: 50, reps: 12 },
      ],
      config,
    );
    expect(res.advanced).toBe(true);
  });

  it("sem séries de trabalho, sugere o piso da faixa", () => {
    const res = nextDoubleProgression([{ weightKg: 20, reps: 10, isWarmup: true }], config);
    expect(res).toEqual({ weightKg: 0, targetReps: 8, advanced: false });
  });
});
