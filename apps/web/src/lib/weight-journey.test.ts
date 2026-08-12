import { describe, expect, it } from "vitest";
import { weightJourney } from "./weight-journey";

describe("weightJourney", () => {
  it("mede o progresso a partir do peso inicial, não de zero", () => {
    // O erro que este teste existe para impedir: `67 / 75` daria 89% para quem
    // acabou de sair de 65 e ainda tem 8 kg pela frente.
    const j = weightJourney({ startKg: 65, currentKg: 67, goalKg: 75 })!;
    expect(j.percent).toBe(20);
    expect(j.remainingKg).toBe(8);
    expect(j.reached).toBe(false);
  });

  it("funciona no sentido de emagrecer, onde os dois deltas são negativos", () => {
    const j = weightJourney({ startKg: 80, currentKg: 75, goalKg: 60 })!;
    expect(j.percent).toBe(25);
    expect(j.remainingKg).toBe(15);
  });

  it("marca a meta como alcançada ao chegar exatamente nela", () => {
    const j = weightJourney({ startKg: 65, currentKg: 75, goalKg: 75 })!;
    expect(j.percent).toBe(100);
    expect(j.remainingKg).toBe(0);
    expect(j.reached).toBe(true);
  });

  it("limita a 100% quem passou da meta, sem estourar a barra", () => {
    const j = weightJourney({ startKg: 65, currentKg: 80, goalKg: 75 })!;
    expect(j.percent).toBe(100);
    expect(j.reached).toBe(true);
    // O quanto passou continua sendo informação verdadeira, mesmo com a barra cheia.
    expect(j.remainingKg).toBe(5);
  });

  it("limita a 0% quem andou para o lado contrário", () => {
    // Meta é emagrecer, mas a pessoa engordou: sem o limite, a razão seria
    // negativa e a barra apareceria deslocada para fora do trilho.
    const j = weightJourney({ startKg: 80, currentKg: 83, goalKg: 70 })!;
    expect(j.percent).toBe(0);
    expect(j.remainingKg).toBe(13);
  });

  it("não devolve jornada quando falta algum dos três pesos", () => {
    expect(weightJourney({ startKg: null, currentKg: 70, goalKg: 75 })).toBeNull();
    expect(weightJourney({ startKg: 65, currentKg: null, goalKg: 75 })).toBeNull();
    expect(weightJourney({ startKg: 65, currentKg: 70, goalKg: null })).toBeNull();
    expect(weightJourney({ startKg: 65, currentKg: 70, goalKg: undefined })).toBeNull();
  });

  it("não devolve jornada quando a meta é o próprio ponto de partida", () => {
    // Divisão por zero: sem esta guarda o percentual seria `Infinity` ou `NaN`.
    expect(weightJourney({ startKg: 70, currentKg: 70, goalKg: 70 })).toBeNull();
  });

  it("não deixa erro de ponto flutuante vazar para o texto", () => {
    // 70.1 - 67.2 dá 2.9000000000000057 em ponto flutuante binário.
    const j = weightJourney({ startKg: 65, currentKg: 67.2, goalKg: 70.1 })!;
    expect(j.remainingKg).toBe(2.9);
  });

  it("nunca devolve -0, que apareceria como '-0 kg' na tela", () => {
    const j = weightJourney({ startKg: 80, currentKg: 70, goalKg: 70 })!;
    expect(Object.is(j.remainingKg, -0)).toBe(false);
    expect(j.remainingKg).toBe(0);
  });
});
