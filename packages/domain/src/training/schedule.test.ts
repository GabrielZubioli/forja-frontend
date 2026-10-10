import { describe, expect, it } from "vitest";
import {
  projectSchedule,
  suggestWeekdays,
  todaysWorkout,
  weekdayOf,
  type ScheduleInput,
} from "./schedule";

/** Semana de 27/07/2026 (segunda) a 02/08/2026 (domingo). */
const SEMANA = [
  "2026-07-27", // seg
  "2026-07-28", // ter
  "2026-07-29", // qua
  "2026-07-30", // qui
  "2026-07-31", // sex
  "2026-08-01", // sáb
  "2026-08-02", // dom
];

/** Segunda, quarta e sexta — 3 divisões (A/B/C), começando na A. */
const BASE: ScheduleInput = { weekdays: [1, 3, 5], splitCount: 3, currentIndex: 0 };

describe("weekdayOf", () => {
  it("identifica o dia da semana sem deslocar por fuso", () => {
    expect(weekdayOf("2026-07-27")).toBe(1); // segunda
    expect(weekdayOf("2026-08-02")).toBe(0); // domingo
    expect(weekdayOf("2026-08-01")).toBe(6); // sábado
  });
});

describe("projectSchedule", () => {
  it("marca como descanso os dias fora da agenda", () => {
    const dias = projectSchedule(SEMANA, "2026-07-27", BASE);
    const descanso = dias.filter((d) => d.status === "rest").map((d) => d.weekday);
    expect(descanso).toEqual([2, 4, 6, 0]); // ter, qui, sáb, dom
  });

  it("distribui as divisões na ordem da sequência a partir de hoje", () => {
    const dias = projectSchedule(SEMANA, "2026-07-27", BASE);
    const treinos = dias.filter((d) => d.splitIndex !== null);
    expect(treinos.map((d) => d.splitIndex)).toEqual([0, 1, 2]); // A, B, C
  });

  it("respeita a posição atual da sequência", () => {
    // Já fez A e B; a próxima é C.
    const dias = projectSchedule(SEMANA, "2026-07-27", { ...BASE, currentIndex: 2 });
    const treinos = dias.filter((d) => d.splitIndex !== null);
    expect(treinos.map((d) => d.splitIndex)).toEqual([2, 0, 1]); // C, A, B
  });

  it("circula de volta ao início quando a sequência acaba", () => {
    const dias = projectSchedule(SEMANA, "2026-07-27", {
      weekdays: [1, 2, 3, 4, 5],
      splitCount: 2,
      currentIndex: 0,
    });
    const treinos = dias.filter((d) => d.splitIndex !== null);
    expect(treinos.map((d) => d.splitIndex)).toEqual([0, 1, 0, 1, 0]);
  });

  it("marca hoje com status próprio", () => {
    const dias = projectSchedule(SEMANA, "2026-07-29", BASE);
    const hoje = dias.find((d) => d.isToday)!;
    expect(hoje.date).toBe("2026-07-29");
    expect(hoje.status).toBe("today");
  });

  it("dia de treino que passou em branco fica como perdido, sem divisão", () => {
    // Hoje é sexta; segunda e quarta eram treino e não foram feitos.
    const dias = projectSchedule(SEMANA, "2026-07-31", BASE);
    const perdidos = dias.filter((d) => d.status === "missed");
    expect(perdidos.map((d) => d.date)).toEqual(["2026-07-27", "2026-07-29"]);
    // Não recebem divisão: a sequência não vira dívida.
    expect(perdidos.every((d) => d.splitIndex === null)).toBe(true);
  });

  it("a sequência não é consumida por dias perdidos", () => {
    // Mesmo tendo faltado seg e qua, a sexta ainda recebe a divisão A.
    const dias = projectSchedule(SEMANA, "2026-07-31", BASE);
    const sexta = dias.find((d) => d.date === "2026-07-31")!;
    expect(sexta.splitIndex).toBe(0);
  });

  it("marca dias com treino registrado como concluídos", () => {
    const dias = projectSchedule(SEMANA, "2026-07-31", BASE, [
      { date: "2026-07-27", splitIndex: 0 },
    ]);
    const segunda = dias.find((d) => d.date === "2026-07-27")!;
    expect(segunda.status).toBe("done");
    expect(segunda.completedSplitIndex).toBe(0);
  });

  it("reconhece treino feito fora da agenda", () => {
    // Treinou na terça, que não era dia planejado.
    const dias = projectSchedule(SEMANA, "2026-07-31", BASE, [{ date: "2026-07-28" }]);
    const terca = dias.find((d) => d.date === "2026-07-28")!;
    expect(terca.status).toBe("done");
  });

  it("rejeita entrada inválida", () => {
    expect(() => projectSchedule(SEMANA, "2026-07-27", { ...BASE, weekdays: [] })).toThrow();
    expect(() => projectSchedule(SEMANA, "2026-07-27", { ...BASE, splitCount: 0 })).toThrow();
    expect(() => projectSchedule(SEMANA, "2026-07-27", { ...BASE, weekdays: [9] })).toThrow();
  });

  it("devolve um item por dia informado", () => {
    expect(projectSchedule(SEMANA, "2026-07-27", BASE)).toHaveLength(7);
    expect(projectSchedule([], "2026-07-27", BASE)).toHaveLength(0);
  });
});

describe("todaysWorkout", () => {
  it("indica a próxima divisão da sequência", () => {
    expect(todaysWorkout("2026-07-27", BASE).splitIndex).toBe(0);
    expect(todaysWorkout("2026-07-27", { ...BASE, currentIndex: 5 }).splitIndex).toBe(2);
  });

  it("diz se hoje estava no plano", () => {
    expect(todaysWorkout("2026-07-27", BASE).isPlannedDay).toBe(true); // segunda
    expect(todaysWorkout("2026-07-28", BASE).isPlannedDay).toBe(false); // terça
  });

  it("sugere treino mesmo fora do dia planejado", () => {
    // Quem quer treinar numa terça deve poder — a divisão certa é a próxima.
    const fora = todaysWorkout("2026-07-28", BASE);
    expect(fora.isPlannedDay).toBe(false);
    expect(fora.splitIndex).toBe(0);
  });

  it("sinaliza quando já treinou hoje", () => {
    expect(todaysWorkout("2026-07-27", BASE, [{ date: "2026-07-27" }]).alreadyDone).toBe(true);
    expect(todaysWorkout("2026-07-27", BASE, []).alreadyDone).toBe(false);
  });
});

describe("suggestWeekdays", () => {
  it("sugere a quantidade pedida de dias", () => {
    for (const dias of [2, 3, 4, 5, 6]) {
      expect(suggestWeekdays(dias)).toHaveLength(dias);
    }
  });

  it("espalha os treinos em vez de amontoá-los", () => {
    // 3×/semana: segunda, quarta, sexta — um dia de folga entre cada.
    expect(suggestWeekdays(3)).toEqual([1, 3, 5]);
  });

  it("não repete dias", () => {
    for (const dias of [2, 3, 4, 5, 6, 7]) {
      const sugestao = suggestWeekdays(dias);
      expect(new Set(sugestao).size).toBe(sugestao.length);
    }
  });

  it("cai num padrão sensato para valores inesperados", () => {
    expect(suggestWeekdays(99)).toEqual([1, 3, 5]);
  });
});

describe("semana fixa", () => {
  // A na segunda e na quinta, B na quarta, A + C (duas rotinas) no sábado.
  const fixed = [[], [0], [], [1], [0], [], [0, 2]];
  const FIXA: ScheduleInput = { weekdays: [], splitCount: 3, currentIndex: 1, fixed };

  it("cada dia recebe a divisão do dia, sem sequência", () => {
    const dias = projectSchedule(SEMANA, "2026-07-27", FIXA);
    expect(dias.map((d) => d.splitIndex)).toEqual([0, null, 1, 0, null, 0, null]);
    expect(dias[5]!.splitIndices).toEqual([0, 2]);
    expect(dias[1]!.status).toBe("rest");
  });

  it("treino de hoje é o do dia; fora da agenda sugere a sequência", () => {
    expect(todaysWorkout("2026-07-29", FIXA)).toMatchObject({ splitIndex: 1, isPlannedDay: true });
    expect(todaysWorkout("2026-07-28", FIXA)).toMatchObject({ splitIndex: 1, isPlannedDay: false });
  });

  it("semana fixa vazia é válida (tudo descanso)", () => {
    const vazia = { ...FIXA, fixed: [[], [], [], [], [], [], []] };
    expect(projectSchedule(SEMANA, "2026-07-27", vazia).every((d) => d.status === "rest")).toBe(
      true,
    );
  });

  it("rotação continua preenchendo splitIndices com a divisão do dia", () => {
    const dias = projectSchedule(SEMANA, "2026-07-27", BASE);
    expect(dias[0]!.splitIndices).toEqual([0]);
    expect(dias[1]!.splitIndices).toEqual([]);
  });
});
