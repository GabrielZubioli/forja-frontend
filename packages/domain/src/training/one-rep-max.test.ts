import { describe, expect, it } from "vitest";
import { epley1RM } from "./one-rep-max";

describe("epley1RM", () => {
  it("retorna o próprio peso para 1 rep", () => {
    expect(epley1RM(100, 1)).toBe(100);
  });

  it("aplica a fórmula de Epley", () => {
    expect(epley1RM(100, 10)).toBeCloseTo(133.333, 3);
    expect(epley1RM(60, 5)).toBeCloseTo(70, 5);
  });

  it("retorna 0 para entradas não-positivas", () => {
    expect(epley1RM(0, 5)).toBe(0);
    expect(epley1RM(100, 0)).toBe(0);
    expect(epley1RM(-10, 5)).toBe(0);
  });
});
