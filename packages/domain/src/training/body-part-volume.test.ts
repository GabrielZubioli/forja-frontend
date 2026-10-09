import { describe, expect, it } from "vitest";
import { weeklySetsByBodyPart } from "./body-part-volume";

const HOJE = "2026-10-08"; // quinta; semana atual começa 05/10

describe("weeklySetsByBodyPart", () => {
  it("devolve todas as partes com zeros quando não há treino", () => {
    const r = weeklySetsByBodyPart([], HOJE, 4);
    expect(r.map((p) => p.part)).toEqual(["peito", "costas", "ombros", "bracos", "pernas", "core"]);
    expect(r.every((p) => p.weekly.length === 4 && p.weekly.every((v) => v === 0))).toBe(true);
  });

  it("soma por semana e agrupa músculos na parte do corpo", () => {
    const r = weeklySetsByBodyPart(
      [
        { muscle: "chest", day: "2026-10-06", sets: 4 },
        { muscle: "triceps", day: "2026-10-06", sets: 0.5 },
        { muscle: "quads", day: "2026-09-29", sets: 3 },
        { muscle: "glutes", day: "2026-10-04", sets: 2 }, // domingo da semana anterior
      ],
      HOJE,
      2,
    );
    const de = (p: string) => r.find((x) => x.part === p)!.weekly;
    expect(de("peito")).toEqual([0, 4]);
    expect(de("bracos")).toEqual([0, 0.5]);
    expect(de("pernas")).toEqual([5, 0]);
  });

  it("ignora treinos fora da janela e músculos sem parte", () => {
    const r = weeklySetsByBodyPart(
      [
        { muscle: "chest", day: "2026-01-01", sets: 9 },
        { muscle: "cardio", day: "2026-10-06", sets: 1 },
      ],
      HOJE,
      2,
    );
    expect(r.flatMap((p) => p.weekly).reduce((a, b) => a + b, 0)).toBe(0);
  });
});
