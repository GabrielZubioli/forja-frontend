import { describe, expect, it } from "vitest";
import {
  guessEquipment,
  matchExercise,
  parseCsv,
  parseDateTime,
  parseDuration,
  parseWorkoutCsv,
} from "./import-csv";

describe("parseCsv", () => {
  it("lida com aspas, vírgula dentro de aspas e CRLF", () => {
    expect(parseCsv('a,b\r\n"x, y","diz ""oi"""\r\n')).toEqual([
      ["a", "b"],
      ["x, y", 'diz "oi"'],
    ]);
  });

  it("detecta ponto e vírgula", () => {
    expect(parseCsv("a;b\n1;2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseDateTime / parseDuration", () => {
  it("entende os formatos comuns", () => {
    expect(parseDateTime("2024-01-05 18:30:00")).toBe("2024-01-05T18:30:00");
    expect(parseDateTime("2024-01-05")).toBe("2024-01-05T12:00:00");
    expect(parseDateTime("5 Jan 2024, 18:30")).toBe("2024-01-05T18:30:00");
    expect(parseDateTime("ontem")).toBeNull();
    expect(parseDuration("1h 5m")).toBe(3900);
    expect(parseDuration("45:10")).toBe(2710);
    expect(parseDuration("90")).toBe(90);
  });
});

describe("parseWorkoutCsv", () => {
  it("Strong: agrupa séries em treinos e exercícios", () => {
    const csv = [
      "Date;Workout Name;Duration;Exercise Name;Set Order;Weight;Reps;Distance;Seconds;Notes;Workout Notes;RPE",
      "2024-01-05 18:30:00;Peito;1h 5m;Bench Press (Barbell);1;60;10;0;0;;;",
      "2024-01-05 18:30:00;Peito;1h 5m;Bench Press (Barbell);2;65;8;0;0;;;8",
      "2024-01-05 18:30:00;Peito;1h 5m;Triceps Pushdown (Cable);1;25;12;0;0;;;",
      "2024-01-07 09:00:00;Pernas;50m;Squat (Barbell);1;100;5;0;0;;;",
    ].join("\n");
    const r = parseWorkoutCsv(csv);
    expect(r.workouts).toHaveLength(2);
    expect(r.workouts[0]!.name).toBe("Peito");
    expect(r.workouts[0]!.durationSeconds).toBe(3900);
    expect(r.workouts[0]!.exercises.map((e) => e.name)).toEqual([
      "Bench Press (Barbell)",
      "Triceps Pushdown (Cable)",
    ]);
    expect(r.workouts[0]!.exercises[0]!.sets[1]).toMatchObject({ weightKg: 65, reps: 8, rpe: 8 });
  });

  it("Hevy: weight_kg, set_type de aquecimento e fim do treino", () => {
    const csv = [
      '"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"',
      '"Push","5 Jan 2024, 18:00","5 Jan 2024, 19:00","","Bench Press (Barbell)","","","0","warmup","40","10","","",""',
      '"Push","5 Jan 2024, 18:00","5 Jan 2024, 19:00","","Bench Press (Barbell)","","","1","normal","80","5","","",""',
    ].join("\n");
    const r = parseWorkoutCsv(csv);
    expect(r.workouts[0]!.durationSeconds).toBe(3600);
    expect(r.workouts[0]!.exercises[0]!.sets.map((s) => s.warmup)).toEqual([true, false]);
  });

  it("libras viram kg; FitNotes só com data vira um treino ao meio-dia", () => {
    const csv = ["Date,Exercise,Category,Weight (lbs),Reps", "2024-02-01,Deadlift,Back,225,5"].join(
      "\n",
    );
    const r = parseWorkoutCsv(csv);
    expect(r.workouts[0]!.startedAt).toBe("2024-02-01T12:00:00");
    expect(r.workouts[0]!.exercises[0]!.sets[0]!.weightKg).toBeCloseTo(102.06, 1);
  });

  it("coluna weight sem unidade usa a unidade escolhida", () => {
    const csv = "Date,Exercise Name,Weight,Reps\n2024-02-01,Curl,50,10";
    expect(parseWorkoutCsv(csv, "lb").workouts[0]!.exercises[0]!.sets[0]!.weightKg).toBeCloseTo(
      22.68,
      1,
    );
  });

  it("aponta linhas puladas e rejeita arquivo sem cabeçalho reconhecível", () => {
    const r = parseWorkoutCsv("Date,Exercise\nnão-é-data,Supino\n2024-01-01,");
    expect(r.skipped.map((s) => s.reason)).toEqual(["data não reconhecida", "sem exercício"]);
    expect(parseWorkoutCsv("foo,bar\n1,2").skipped[0]!.line).toBe(1);
  });
});

describe("matchExercise", () => {
  const catalogo = [
    { id: "1", names: ["Supino Reto com Barra", "Barbell Bench Press - Medium Grip"] },
    { id: "2", names: ["Supino Reto com Halteres", "Dumbbell Bench Press"] },
    { id: "3", names: ["Agachamento Livre", "Barbell Squat"] },
  ];

  it("casa o formato do Strong/Hevy com o nome do catálogo", () => {
    expect(matchExercise("Bench Press (Barbell)", catalogo)?.id).toBe("1");
    expect(matchExercise("Bench Press (Dumbbell)", catalogo)?.id).toBe("2");
    expect(matchExercise("Squat (Barbell)", catalogo)?.id).toBe("3");
  });

  it("não casa equipamento diferente nem nome distante", () => {
    expect(matchExercise("Squat (Dumbbell)", catalogo)).toBeNull();
    expect(matchExercise("Hip Thrust (Barbell)", catalogo)).toBeNull();
  });

  it("ignora hífen e pegada; equipamento pode vir do catálogo", () => {
    const puxada = [
      {
        id: "4",
        names: ["Puxada Aberta", "Wide-Grip Lat Pulldown", "cable Wide-Grip Lat Pulldown"],
      },
    ];
    expect(matchExercise("Lat Pulldown (Cable)", puxada)?.id).toBe("4");
  });

  it("casa o próprio nome em português (reimportação)", () => {
    expect(matchExercise("Agachamento Livre", catalogo)?.id).toBe("3");
  });
});

describe("guessEquipment", () => {
  it("lê o equipamento do nome", () => {
    expect(guessEquipment("Triceps Pushdown (Cable)")).toBe("cable");
    expect(guessEquipment("Pull Up (Assisted)")).toBe("bodyweight");
    expect(guessEquipment("Plank")).toBe("other");
  });
});

describe("BOM", () => {
  it("ignora o BOM que o Excel coloca no início do arquivo", () => {
    const r = parseWorkoutCsv("\uFEFFDate,Exercise,Reps\n2024-01-01,Plank,1");
    expect(r.workouts).toHaveLength(1);
  });
});
