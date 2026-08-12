import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatClock,
  formatDate,
  formatDayMonth,
  formatDuration,
  formatShortDate,
  formatWeekday,
  fromISODate,
  toISODate,
  todayISO,
} from "./date";

afterEach(() => {
  vi.useRealTimers();
});

describe("todayISO", () => {
  it("usa a data local, não a UTC", () => {
    // 29/07/2026 às 22h no horário de Brasília (UTC−3) já é dia 30 em UTC.
    // O bug original (`toISOString().slice(0,10)`) registrava o jantar no dia
    // seguinte; `todayISO` precisa devolver o dia do usuário.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T22:30:00-03:00"));

    const utcSeria = new Date().toISOString().slice(0, 10);
    expect(utcSeria).toBe("2026-07-30");
    expect(todayISO()).toBe("2026-07-29");
  });

  it("é estável durante o dia", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T03:00:00-03:00"));
    expect(todayISO()).toBe("2026-07-29");
  });
});

describe("fromISODate", () => {
  it("interpreta a chave como data local, sem deslocar o dia", () => {
    // `new Date("2026-07-29")` é meia-noite UTC — dia 28 às 21h no Brasil.
    const parsed = fromISODate("2026-07-29");
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(6); // julho (0-indexado)
    expect(parsed.getDate()).toBe(29);
  });

  it("faz ida e volta com toISODate sem perder o dia", () => {
    expect(toISODate(fromISODate("2026-01-01"))).toBe("2026-01-01");
    expect(toISODate(fromISODate("2026-12-31"))).toBe("2026-12-31");
  });
});

describe("formatação em pt-BR", () => {
  it("formata o dia da semana e o mês em português", () => {
    // O bug original produzia "Tuesday, 29 de July" — mistura de idiomas.
    const texto = formatWeekday("2026-07-29");
    expect(texto).toMatch(/quarta-feira/i);
    expect(texto).toContain("julho");
    expect(texto).not.toMatch(/wednesday|july/i);
  });

  it("formata data curta e dia/mês", () => {
    expect(formatShortDate("2026-07-29")).toBe("29/07/2026");
    expect(formatDayMonth("2026-07-29")).toBe("29/07");
  });

  it("aceita tanto chave ISO quanto timestamp completo", () => {
    expect(formatDayMonth("2026-07-29")).toBe("29/07");
    expect(formatDayMonth(new Date(2026, 6, 29, 14, 0))).toBe("29/07");
  });

  it("usa o locale pt-BR também em formatDate direto", () => {
    expect(formatDate("2026-03-01", "MMMM")).toBe("março");
  });
});

describe("formatDuration", () => {
  it("mostra segundos abaixo de um minuto", () => {
    expect(formatDuration(45)).toBe("45s");
  });

  it("mostra minutos abaixo de uma hora", () => {
    expect(formatDuration(45 * 60)).toBe("45min");
  });

  it("mostra horas e minutos acima de uma hora", () => {
    expect(formatDuration(72 * 60)).toBe("1h 12min");
  });

  it("omite os minutos quando a duração é exata em horas", () => {
    expect(formatDuration(7200)).toBe("2h");
  });

  it("trata null, undefined e negativos sem quebrar", () => {
    expect(formatDuration(null)).toBe("0s");
    expect(formatDuration(undefined)).toBe("0s");
    expect(formatDuration(-30)).toBe("0s");
  });
});

describe("formatClock", () => {
  it("formata como mm:ss com dois dígitos nos segundos", () => {
    expect(formatClock(90)).toBe("1:30");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(9)).toBe("0:09");
  });

  it("não produz tempo negativo", () => {
    expect(formatClock(-5)).toBe("0:00");
  });
});
