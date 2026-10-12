import { describe, expect, it } from "vitest";
import { diasSeguidos } from "./streak";

// Plano: treino de segunda a sexta (1–5), descanso no fim de semana.
const semana = (wd: number) => wd >= 1 && wd <= 5;

describe("diasSeguidos", () => {
  it("conta os dias treinados e atravessa o fim de semana de descanso", () => {
    // 2026-10-12 é segunda. Treinou sex 9, qui 8, e hoje.
    const t = new Set(["2026-10-08", "2026-10-09", "2026-10-12"]);
    // Quarta 7 era dia de treino e não treinou: a sequência para ali.
    expect(diasSeguidos(t, semana, "2026-10-12")).toBe(3);
  });

  it("hoje em aberto não quebra", () => {
    expect(diasSeguidos(new Set(["2026-10-09"]), semana, "2026-10-12")).toBe(1);
  });

  it("dia de treino perdido zera", () => {
    // Sexta 9 era treino e passou em branco.
    expect(diasSeguidos(new Set(["2026-10-08"]), semana, "2026-10-12")).toBe(0);
  });
});
