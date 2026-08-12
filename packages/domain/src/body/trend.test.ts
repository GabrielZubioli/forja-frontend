import { describe, expect, it } from "vitest";
import { ema } from "./trend";

describe("ema", () => {
  it("o primeiro ponto é o próprio valor", () => {
    expect(ema([10, 20, 30])[0]).toBe(10);
  });

  it("suaviza em direção aos novos valores", () => {
    const out = ema([10, 20, 30], 0.5);
    expect(out[1]).toBeCloseTo(15, 5);
    expect(out[2]).toBeCloseTo(22.5, 5);
  });

  it("série constante permanece constante", () => {
    expect(ema([5, 5, 5, 5], 0.3)).toEqual([5, 5, 5, 5]);
  });

  it("rejeita alpha fora de (0,1]", () => {
    expect(() => ema([1], 0)).toThrow(RangeError);
    expect(() => ema([1], 1.5)).toThrow(RangeError);
  });
});
