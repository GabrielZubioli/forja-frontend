import { describe, expect, it } from "vitest";
import { generatePlan, planInputSchema } from "./plan-generator";
import { TRAINING_PROGRAMS, findProgram } from "./programs";

describe("TRAINING_PROGRAMS", () => {
  it.each(TRAINING_PROGRAMS.map((p) => [p.slug, p] as const))(
    "%s gera um plano válido",
    (_slug, program) => {
      expect(() => planInputSchema.parse(program.input)).not.toThrow();
      expect(generatePlan(program.input).splits.length).toBeGreaterThan(0);
    },
  );

  it("slugs são únicos", () => {
    const slugs = TRAINING_PROGRAMS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("findProgram tolera slug desconhecido", () => {
    expect(findProgram("nao-existe")).toBeUndefined();
    expect(findProgram(undefined)).toBeUndefined();
  });
});
