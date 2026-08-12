import { describe, expect, it } from "vitest";
import {
  computeMuscleRecovery,
  overallReadiness,
  rankSplitsByRecovery,
  type MuscleStimulus,
} from "./recovery";

const AGORA = new Date("2026-07-29T12:00:00Z");

/** Data a N horas atrás de `AGORA`. */
function horasAtras(horas: number): string {
  return new Date(AGORA.getTime() - horas * 3_600_000).toISOString();
}

describe("computeMuscleRecovery", () => {
  it("retorna vazio quando não há estímulo", () => {
    expect(computeMuscleRecovery([], AGORA)).toEqual([]);
  });

  it("músculo recém-treinado está fatigado", () => {
    const r = computeMuscleRecovery([{ muscle: "chest", at: horasAtras(2), sets: 10 }], AGORA);
    expect(r[0]!.status).toBe("fatigued");
    expect(r[0]!.percent).toBeLessThan(20);
  });

  it("músculo treinado há muito tempo está recuperado", () => {
    const r = computeMuscleRecovery([{ muscle: "chest", at: horasAtras(200), sets: 10 }], AGORA);
    expect(r[0]!.status).toBe("recovered");
    expect(r[0]!.percent).toBe(100);
  });

  it("mais volume exige mais tempo de recuperação", () => {
    const leve = computeMuscleRecovery([{ muscle: "chest", at: horasAtras(40), sets: 3 }], AGORA);
    const pesado = computeMuscleRecovery(
      [{ muscle: "chest", at: horasAtras(40), sets: 12 }],
      AGORA,
    );
    expect(leve[0]!.hoursNeeded).toBeLessThan(pesado[0]!.hoursNeeded);
    expect(leve[0]!.ratio).toBeGreaterThan(pesado[0]!.ratio);
  });

  it("respeita o teto de horas necessárias", () => {
    const r = computeMuscleRecovery([{ muscle: "chest", at: horasAtras(1), sets: 100 }], AGORA);
    expect(r[0]!.hoursNeeded).toBeLessThanOrEqual(96);
  });

  it("usa apenas o estímulo mais recente de cada músculo", () => {
    // Um treino antigo e pesado não pode mascarar um recente e leve.
    const r = computeMuscleRecovery(
      [
        { muscle: "chest", at: horasAtras(150), sets: 20 },
        { muscle: "chest", at: horasAtras(3), sets: 4 },
      ],
      AGORA,
    );
    expect(r).toHaveLength(1);
    expect(r[0]!.lastSets).toBe(4);
    expect(r[0]!.hoursSince).toBe(3);
  });

  it("acumula séries do mesmo instante (uma sessão, vários exercícios)", () => {
    const mesmaHora = horasAtras(10);
    const r = computeMuscleRecovery(
      [
        { muscle: "chest", at: mesmaHora, sets: 4 },
        { muscle: "chest", at: mesmaHora, sets: 4 },
      ],
      AGORA,
    );
    expect(r[0]!.lastSets).toBe(8);
  });

  it("ignora registros com data no futuro", () => {
    const futuro = new Date(AGORA.getTime() + 3_600_000).toISOString();
    expect(computeMuscleRecovery([{ muscle: "chest", at: futuro, sets: 5 }], AGORA)).toEqual([]);
  });

  it("ignora datas inválidas em vez de quebrar", () => {
    const r = computeMuscleRecovery(
      [
        { muscle: "chest", at: "data-invalida", sets: 5 },
        { muscle: "back", at: horasAtras(10), sets: 5 },
      ],
      AGORA,
    );
    expect(r.map((x) => x.muscle)).toEqual(["back"]);
  });

  it("ordena do menos para o mais recuperado", () => {
    const r = computeMuscleRecovery(
      [
        { muscle: "back", at: horasAtras(100), sets: 5 },
        { muscle: "chest", at: horasAtras(2), sets: 10 },
        { muscle: "quads", at: horasAtras(30), sets: 6 },
      ],
      AGORA,
    );
    expect(r.map((x) => x.muscle)).toEqual(["chest", "quads", "back"]);
  });

  it("nunca produz razão acima de 1 nem negativa", () => {
    const r = computeMuscleRecovery(
      [
        { muscle: "chest", at: horasAtras(1000), sets: 1 },
        { muscle: "back", at: horasAtras(0), sets: 10 },
      ],
      AGORA,
    );
    for (const item of r) {
      expect(item.ratio).toBeGreaterThanOrEqual(0);
      expect(item.ratio).toBeLessThanOrEqual(1);
    }
  });

  it("trata séries negativas como zero", () => {
    const r = computeMuscleRecovery([{ muscle: "chest", at: horasAtras(30), sets: -5 }], AGORA);
    expect(r[0]!.lastSets).toBe(0);
    expect(r[0]!.hoursNeeded).toBe(24);
  });
});

describe("rankSplitsByRecovery", () => {
  const recovery = computeMuscleRecovery(
    [
      { muscle: "chest", at: horasAtras(2), sets: 12 }, // peito acabou de treinar
      { muscle: "quads", at: horasAtras(120), sets: 10 }, // pernas descansadas
    ],
    AGORA,
  );

  it("coloca primeiro a divisão com músculos mais recuperados", () => {
    const ranked = rankSplitsByRecovery(
      [
        { split: "push", muscles: ["chest"] },
        { split: "legs", muscles: ["quads"] },
      ],
      recovery,
    );
    expect(ranked[0]!.split).toBe("legs");
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score);
  });

  it("lista os músculos fatigados de cada divisão", () => {
    const ranked = rankSplitsByRecovery([{ split: "push", muscles: ["chest"] }], recovery);
    expect(ranked[0]!.fatigued.map((f) => f.muscle)).toEqual(["chest"]);
  });

  it("trata músculo sem estímulo recente como pronto", () => {
    const ranked = rankSplitsByRecovery([{ split: "pull", muscles: ["lats"] }], recovery);
    expect(ranked[0]!.score).toBe(1);
    expect(ranked[0]!.fatigued).toHaveLength(0);
  });

  it("divisão sem músculos declarados não é penalizada", () => {
    const ranked = rankSplitsByRecovery([{ split: "vazio", muscles: [] }], recovery);
    expect(ranked[0]!.score).toBe(1);
  });
});

describe("overallReadiness", () => {
  it("é 1 quando não há nada registrado", () => {
    expect(overallReadiness([])).toBe(1);
  });

  it("é a média das razões de recuperação", () => {
    const recovery = computeMuscleRecovery(
      [
        { muscle: "chest", at: horasAtras(200), sets: 5 }, // 1.0
        { muscle: "quads", at: horasAtras(0), sets: 5 }, // 0.0
      ],
      AGORA,
    );
    expect(overallReadiness(recovery)).toBeCloseTo(0.5);
  });
});

/** Cenário realista: PPL, com o dia de empurrar feito ontem. */
describe("cenário — rotina PPL", () => {
  it("recomenda pernas quando peito e costas ainda estão em recuperação", () => {
    const stimuli: MuscleStimulus[] = [
      { muscle: "chest", at: horasAtras(20), sets: 10 },
      { muscle: "shoulders", at: horasAtras(20), sets: 5 },
      { muscle: "lats", at: horasAtras(44), sets: 9 },
      { muscle: "quads", at: horasAtras(140), sets: 10 },
    ];
    const recovery = computeMuscleRecovery(stimuli, AGORA);
    const ranked = rankSplitsByRecovery(
      [
        { split: "A", muscles: ["chest", "shoulders"] },
        { split: "B", muscles: ["lats"] },
        { split: "C", muscles: ["quads"] },
      ],
      recovery,
    );
    expect(ranked[0]!.split).toBe("C");
  });
});
