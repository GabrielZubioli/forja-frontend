import { describe, expect, it } from "vitest";
import { platesFor } from "./plates";

describe("platesFor", () => {
  it("monta 100 kg na barra de 20", () => {
    expect(platesFor(100)).toEqual({ perSide: [25, 15], loadedKg: 100, missingKg: 0 });
  });

  it("usa as frações pequenas", () => {
    expect(platesFor(67.5).perSide).toEqual([20, 2.5, 1.25]);
  });

  it("só a barra quando a carga é a barra ou menos", () => {
    expect(platesFor(20)).toEqual({ perSide: [], loadedKg: 20, missingKg: 0 });
    expect(platesFor(15).perSide).toEqual([]);
  });

  it("diz quanto faltou quando não fecha", () => {
    const r = platesFor(61);
    expect(r.loadedKg).toBe(60);
    expect(r.missingKg).toBe(1);
  });

  it("respeita a barra e as anilhas que a pessoa tem", () => {
    expect(platesFor(50, 10, [10, 5]).perSide).toEqual([10, 10]);
  });
});
