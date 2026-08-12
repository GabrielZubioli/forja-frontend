import { describe, expect, it } from "vitest";
import { addUtcDays, daysBetweenUtc, parseUtcDayKey, utcDayKey, yearsBetween } from "./dates";

describe("utcDayKey / parseUtcDayKey", () => {
  it("faz round-trip de uma chave de dia", () => {
    expect(utcDayKey(parseUtcDayKey("2026-07-25"))).toBe("2026-07-25");
  });

  it("rejeita formato inválido", () => {
    expect(() => parseUtcDayKey("25/07/2026")).toThrow(RangeError);
  });
});

describe("addUtcDays", () => {
  it("soma e subtrai dias cruzando mês", () => {
    expect(addUtcDays("2026-07-31", 1)).toBe("2026-08-01");
    expect(addUtcDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("daysBetweenUtc", () => {
  it("conta dias inteiros", () => {
    expect(daysBetweenUtc("2026-01-01", "2026-01-08")).toBe(7);
    expect(daysBetweenUtc("2026-01-08", "2026-01-01")).toBe(-7);
  });
});

describe("yearsBetween", () => {
  it("calcula idade em anos completos", () => {
    const ref = new Date("2026-07-25T00:00:00.000Z");
    expect(yearsBetween("2000-07-25", ref)).toBe(26);
    expect(yearsBetween("2000-07-26", ref)).toBe(25);
  });
});
