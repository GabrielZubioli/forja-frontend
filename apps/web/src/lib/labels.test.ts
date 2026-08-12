import { describe, expect, it } from "vitest";
import {
  ACTIVITY_LABELS,
  EQUIPMENT_LABELS,
  MEALS,
  MUSCLE_LABELS,
  SET_TYPE_LABELS,
  label,
} from "./labels";

describe("label", () => {
  it("traduz um valor conhecido", () => {
    expect(label(MUSCLE_LABELS, "chest")).toBe("Peito");
    expect(label(EQUIPMENT_LABELS, "barbell")).toBe("Barra");
  });

  it("devolve o valor cru quando o enum cresce no banco antes do mapa", () => {
    // Melhor exibir "novo_musculo" do que "—" ou quebrar a tela.
    expect(label(MUSCLE_LABELS, "novo_musculo")).toBe("novo_musculo");
  });

  it("usa o fallback para null e undefined", () => {
    expect(label(MUSCLE_LABELS, null)).toBe("—");
    expect(label(MUSCLE_LABELS, undefined)).toBe("—");
    expect(label(MUSCLE_LABELS, null, "sem músculo")).toBe("sem músculo");
  });

  it("usa o fallback para string vazia", () => {
    expect(label(MUSCLE_LABELS, "")).toBe("—");
  });
});

describe("cobertura dos enums do banco", () => {
  it("cobre todos os valores de muscle_t", () => {
    const doBanco = [
      "chest",
      "back",
      "lats",
      "traps",
      "shoulders",
      "front_delts",
      "side_delts",
      "rear_delts",
      "biceps",
      "triceps",
      "forearms",
      "core",
      "abs",
      "obliques",
      "quads",
      "hamstrings",
      "glutes",
      "calves",
      "adductors",
      "abductors",
      "cardio",
      "full_body",
    ];
    for (const value of doBanco) {
      expect(MUSCLE_LABELS).toHaveProperty(value);
    }
  });

  it("cobre todos os valores de equipment_t", () => {
    const doBanco = [
      "barbell",
      "dumbbell",
      "machine",
      "cable",
      "bodyweight",
      "kettlebell",
      "band",
      "other",
      "cardio",
    ];
    for (const value of doBanco) {
      expect(EQUIPMENT_LABELS).toHaveProperty(value);
    }
  });

  it("cobre todos os valores de set_type_t", () => {
    for (const value of ["warmup", "working", "drop", "failure"]) {
      expect(SET_TYPE_LABELS).toHaveProperty(value);
    }
  });

  it("cobre todos os valores de activity_level_t", () => {
    for (const value of ["sedentary", "light", "moderate", "active", "very_active"]) {
      expect(ACTIVITY_LABELS).toHaveProperty(value);
    }
  });
});

describe("MEALS", () => {
  it("lista as oito refeições na ordem cronológica do dia", () => {
    // Eram quatro, com pré e pós-treino amontoados em "snack" — o que impedia
    // tanto prescrever quanto ler o que a pessoa comeu em relação ao treino.
    expect(MEALS.map((m) => m.key)).toEqual([
      "breakfast",
      "morning_snack",
      "lunch",
      "afternoon_snack",
      "pre_workout",
      "post_workout",
      "dinner",
      "supper",
    ]);
  });

  it("tem rótulo em português para cada refeição", () => {
    for (const meal of MEALS) {
      expect(meal.label).toBeTruthy();
      expect(meal.label).not.toBe(meal.key);
    }
  });
});
