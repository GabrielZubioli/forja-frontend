import { describe, expect, it } from "vitest";
import { exportFilename, toCsv } from "./export";

describe("toCsv", () => {
  it("retorna vazio para lista vazia", () => {
    expect(toCsv([])).toBe("");
  });

  it("gera cabeçalho e linhas a partir das chaves", () => {
    const csv = toCsv([
      { data: "2026-07-29", peso: 78.4 },
      { data: "2026-07-30", peso: 78.1 },
    ]);
    const linhas = stripBom(csv).split("\n");
    expect(linhas[0]).toBe("data,peso");
    expect(linhas[1]).toBe("2026-07-29,78.4");
    expect(linhas[2]).toBe("2026-07-30,78.1");
  });

  it("escapa vírgulas envolvendo o campo em aspas", () => {
    const csv = toCsv([{ nome: "Arroz, integral" }]);
    expect(stripBom(csv)).toContain('"Arroz, integral"');
  });

  it("escapa aspas duplicando-as", () => {
    const csv = toCsv([{ nome: 'Whey "premium"' }]);
    expect(stripBom(csv)).toContain('"Whey ""premium"""');
  });

  it("escapa quebras de linha", () => {
    const csv = toCsv([{ notas: "linha 1\nlinha 2" }]);
    expect(stripBom(csv)).toContain('"linha 1\nlinha 2"');
  });

  it("achata objetos aninhados com notação de ponto", () => {
    // Embeds do PostgREST chegam assim: { grams: 100, foods: { name: "Arroz" } }
    const csv = toCsv([{ grams: 100, foods: { name: "Arroz", brand: null } }]);
    const linhas = stripBom(csv).split("\n");
    expect(linhas[0]).toBe("grams,foods.name,foods.brand");
    expect(linhas[1]).toBe("100,Arroz,");
  });

  it("serializa arrays como JSON em vez de achatá-los", () => {
    const csv = toCsv([{ musculos: ["chest", "triceps"] }]);
    expect(stripBom(csv)).toContain('"[""chest"",""triceps""]"');
  });

  it("une colunas de linhas com formatos diferentes", () => {
    const csv = toCsv([{ a: 1 }, { b: 2 }]);
    const linhas = stripBom(csv).split("\n");
    expect(linhas[0]).toBe("a,b");
    expect(linhas[1]).toBe("1,");
    expect(linhas[2]).toBe(",2");
  });

  it("trata null e undefined como célula vazia", () => {
    const csv = toCsv([{ a: null, b: undefined, c: 0 }]);
    const linhas = stripBom(csv).split("\n");
    expect(linhas[1]).toBe(",,0");
  });

  it("começa com BOM para o Excel reconhecer UTF-8", () => {
    const csv = toCsv([{ nome: "Feijão" }]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });
});

describe("exportFilename", () => {
  it("inclui escopo, data e extensão", () => {
    expect(exportFilename("dados", "json")).toMatch(/^forja-dados-\d{4}-\d{2}-\d{2}\.json$/);
    expect(exportFilename("dados", "csv")).toMatch(/^forja-dados-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "");
}
