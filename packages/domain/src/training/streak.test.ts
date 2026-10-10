import { describe, expect, it } from "vitest";
import { weekStart, weeklyStreak } from "./streak";

// Quinta, 08/10/2026. Semana atual começa na segunda 05/10.
const HOJE = "2026-10-08";

describe("weekStart", () => {
  it("volta para a segunda, inclusive a partir do domingo", () => {
    expect(weekStart("2026-10-08")).toBe("2026-10-05");
    expect(weekStart("2026-10-05")).toBe("2026-10-05");
    expect(weekStart("2026-10-11")).toBe("2026-10-05"); // domingo
  });
});

describe("weeklyStreak", () => {
  it("é zero sem treinos", () => {
    expect(weeklyStreak([], 3, HOJE)).toBe(0);
  });

  it("semana atual em aberto não zera a sequência", () => {
    const passadas = [
      "2026-09-28",
      "2026-09-30",
      "2026-10-02",
      "2026-09-21",
      "2026-09-23",
      "2026-09-25",
    ];
    expect(weeklyStreak([...passadas, "2026-10-05"], 3, HOJE)).toBe(2);
  });

  it("semana atual entra quando a meta já foi batida", () => {
    const dias = [
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
    ];
    expect(weeklyStreak(dias, 3, HOJE)).toBe(2);
  });

  it("dois treinos no mesmo dia contam dois", () => {
    expect(weeklyStreak(["2026-10-06", "2026-10-06"], 2, HOJE)).toBe(1);
  });

  it("uma semana abaixo da meta interrompe", () => {
    const dias = ["2026-09-28", "2026-09-29", "2026-09-21", "2026-09-14", "2026-09-15"];
    expect(weeklyStreak(dias, 2, HOJE)).toBe(1);
  });
});
