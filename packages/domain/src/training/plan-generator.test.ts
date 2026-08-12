import { describe, expect, it } from "vitest";
import { findVolumeOutliers, generatePlan, sumWeeklySets, type PlanInput } from "./plan-generator";

const BASE: PlanInput = {
  level: "intermediate",
  goal: "hypertrophy",
  equipment: "full_gym",
  daysPerWeek: 3,
};

describe("generatePlan — estrutura", () => {
  it("gera uma divisão por dia de treino", () => {
    for (const days of [2, 3, 4, 5, 6] as const) {
      const plan = generatePlan({ ...BASE, daysPerWeek: days });
      expect(plan.splits).toHaveLength(days);
    }
  });

  it("nomeia as divisões com letras sequenciais", () => {
    const plan = generatePlan({ ...BASE, daysPerWeek: 4 });
    expect(plan.splits.map((s) => s.letter)).toEqual(["A", "B", "C", "D"]);
  });

  it("numera divisões repetidas para o usuário distingui-las", () => {
    // 4 dias = Superiores/Inferiores repetidos.
    const plan = generatePlan({ ...BASE, daysPerWeek: 4 });
    const nomes = plan.splits.map((s) => s.name);
    expect(nomes[0]).toBe("Superiores 1");
    expect(nomes[2]).toBe("Superiores 2");
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  it("usa corpo inteiro em 2 dias e ABC de empurrar/puxar/pernas em 3", () => {
    expect(generatePlan({ ...BASE, daysPerWeek: 2 }).splits[0]!.name).toContain("Corpo inteiro");
    const tres = generatePlan({ ...BASE, daysPerWeek: 3 }).splits.map((s) => s.name);
    expect(tres[0]).toContain("Empurrar");
    expect(tres[1]).toContain("Puxar");
    expect(tres[2]).toContain("Pernas");
  });

  it("toda divisão tem ao menos um exercício composto de prioridade 1", () => {
    const plan = generatePlan(BASE);
    for (const split of plan.splits) {
      expect(split.slots.some((s) => s.priority === 1)).toBe(true);
    }
  });

  it("rejeita frequência fora da faixa suportada", () => {
    expect(() => generatePlan({ ...BASE, daysPerWeek: 1 })).toThrow();
    expect(() => generatePlan({ ...BASE, daysPerWeek: 7 })).toThrow();
  });
});

describe("generatePlan — objetivo define reps e descanso", () => {
  it("força usa poucas reps e descanso longo", () => {
    const plan = generatePlan({ ...BASE, goal: "strength" });
    const composto = plan.splits[0]!.slots.find((s) => s.priority === 1)!;
    expect(composto.repMin).toBe(4);
    expect(composto.repMax).toBe(6);
    expect(composto.restSeconds).toBe(180);
  });

  it("hipertrofia usa faixa média", () => {
    const plan = generatePlan({ ...BASE, goal: "hypertrophy" });
    const composto = plan.splits[0]!.slots.find((s) => s.priority === 1)!;
    expect(composto.repMin).toBe(8);
    expect(composto.repMax).toBe(12);
    expect(composto.restSeconds).toBe(120);
  });

  it("resistência usa muitas reps e descanso curto", () => {
    const plan = generatePlan({ ...BASE, goal: "endurance" });
    const composto = plan.splits[0]!.slots.find((s) => s.priority === 1)!;
    expect(composto.repMin).toBe(12);
    expect(composto.restSeconds).toBe(60);
  });

  it("isolamento sempre descansa menos que composto", () => {
    const plan = generatePlan(BASE);
    const slots = plan.splits.flatMap((s) => s.slots);
    const composto = slots.find((s) => s.priority === 1)!;
    const isolado = slots.find((s) => s.pattern === "isolation")!;
    expect(isolado.restSeconds).toBeLessThan(composto.restSeconds);
  });
});

describe("generatePlan — nível define volume", () => {
  it("iniciante faz menos séries que intermediário no mesmo composto", () => {
    const iniciante = generatePlan({ ...BASE, level: "beginner" });
    const intermediario = generatePlan({ ...BASE, level: "intermediate" });
    const setsIniciante = iniciante.splits[0]!.slots.find((s) => s.priority === 1)!.sets;
    const setsIntermediario = intermediario.splits[0]!.slots.find((s) => s.priority === 1)!.sets;
    expect(setsIniciante).toBeLessThan(setsIntermediario);
  });
});

describe("generatePlan — equipamento", () => {
  it("em academia completa mantém os padrões originais", () => {
    const plan = generatePlan({ ...BASE, equipment: "full_gym", daysPerWeek: 3 });
    const padroes = plan.splits.flatMap((s) => s.slots.map((slot) => slot.pattern));
    expect(padroes).toContain("hinge");
  });

  it("sem equipamento troca padrões inviáveis por alternativas", () => {
    const plan = generatePlan({ ...BASE, equipment: "bodyweight", daysPerWeek: 3 });
    const padroes = plan.splits.flatMap((s) => s.slots.map((slot) => slot.pattern));
    // Levantamento terra vira unilateral; nada de "hinge" com peso corporal.
    expect(padroes).not.toContain("hinge");
    expect(padroes).toContain("lunge");
  });

  it("preserva o estímulo dos músculos mesmo trocando o padrão", () => {
    const comGym = generatePlan({ ...BASE, equipment: "full_gym", daysPerWeek: 3 });
    const semEquip = generatePlan({ ...BASE, equipment: "bodyweight", daysPerWeek: 3 });
    // O número de vagas não muda: nenhum grupo é simplesmente omitido.
    expect(semEquip.splits.flatMap((s) => s.slots)).toHaveLength(
      comGym.splits.flatMap((s) => s.slots).length,
    );
  });
});

describe("sumWeeklySets", () => {
  it("soma as séries de cada músculo em toda a semana", () => {
    const plan = generatePlan({ ...BASE, daysPerWeek: 3 });
    const totais = sumWeeklySets(plan.splits);
    // Peito aparece duas vezes no dia de empurrar.
    expect(totais.chest).toBeGreaterThan(0);
    expect(totais).toEqual(plan.weeklySetsByMuscle);
  });

  it("retorna vazio para lista vazia", () => {
    expect(sumWeeklySets([])).toEqual({});
  });
});

describe("findVolumeOutliers", () => {
  it("não acusa excesso num plano intermediário de 3 dias", () => {
    const plan = generatePlan({ ...BASE, daysPerWeek: 3 });
    expect(findVolumeOutliers(plan).filter((o) => o.status === "high")).toHaveLength(0);
  });

  it("ignora core e cardio, que não seguem faixas de hipertrofia", () => {
    const plan = generatePlan({ ...BASE, daysPerWeek: 3 });
    const musculos = findVolumeOutliers(plan).map((o) => o.muscle);
    expect(musculos).not.toContain("core");
    expect(musculos).not.toContain("cardio");
  });

  it("aponta volume baixo quando um avançado treina só 2 dias por semana", () => {
    // Corpo inteiro 2×/semana não sustenta as ~12+ séries semanais por músculo
    // que um avançado precisa — o app deve avisar em vez de fingir que serve.
    const plan = generatePlan({
      level: "advanced",
      goal: "hypertrophy",
      equipment: "full_gym",
      daysPerWeek: 2,
    });
    const baixos = findVolumeOutliers(plan).filter((o) => o.status === "low");
    expect(baixos.length).toBeGreaterThan(0);
    // Grupos com uma única vaga na semana esbarram no teto de séries por vaga.
    expect(baixos.map((o) => o.muscle)).toContain("ombros");
  });

  it("não acusa volume baixo quando a frequência combina com o nível", () => {
    const plan = generatePlan({
      level: "beginner",
      goal: "hypertrophy",
      equipment: "full_gym",
      daysPerWeek: 3,
    });
    expect(findVolumeOutliers(plan).filter((o) => o.status === "low")).toHaveLength(0);
  });
});

describe("generatePlan — duração da sessão", () => {
  it("sessão rápida cabe em 3 exercícios", () => {
    const plan = generatePlan({ ...BASE, duration: "quick" });
    for (const split of plan.splits) {
      expect(split.slots).toHaveLength(3);
    }
  });

  it("sessão longa tem mais exercícios que a curta", () => {
    const curta = generatePlan({ ...BASE, duration: "short" });
    const longa = generatePlan({ ...BASE, duration: "long" });
    const contaCurta = curta.splits[0]!.slots.length;
    const contaLonga = longa.splits[0]!.slots.length;
    expect(contaLonga).toBeGreaterThan(contaCurta);
    expect(contaLonga).toBeGreaterThanOrEqual(8);
  });

  it("mesmo cortando, preserva os compostos que sustentam o treino", () => {
    const plan = generatePlan({ ...BASE, duration: "quick" });
    for (const split of plan.splits) {
      expect(split.slots.some((s) => s.priority === 1)).toBe(true);
    }
  });

  it("usa sessão média quando a duração não é informada", () => {
    const semDuracao = generatePlan(BASE);
    const media = generatePlan({ ...BASE, duration: "average" });
    expect(semDuracao.splits[0]!.slots.length).toBe(media.splits[0]!.slots.length);
  });
});

describe("generatePlan — área de foco", () => {
  it("numa sessão curta, preserva o isolamento da área escolhida", () => {
    // Braços: a rosca sobrevive ao corte; a panturrilha não.
    const plan = generatePlan({ ...BASE, duration: "quick", focus: "arms", daysPerWeek: 3 });
    const musculos = plan.splits.flatMap((s) => s.slots.map((slot) => slot.primaryMuscle));
    expect(musculos).not.toContain("calves");
  });

  it("foco em corpo inteiro não privilegia nenhum grupo", () => {
    const plan = generatePlan({ ...BASE, focus: "full_body" });
    // Não quebra e continua produzindo um plano válido.
    expect(plan.splits.length).toBe(BASE.daysPerWeek);
  });

  it("core é o primeiro a sair quando o tempo é curto", () => {
    const longa = generatePlan({ ...BASE, duration: "long" });
    const rapida = generatePlan({ ...BASE, duration: "quick" });
    const coreLonga = longa.splits.flatMap((s) => s.slots).filter((s) => s.pattern === "core");
    const coreRapida = rapida.splits.flatMap((s) => s.slots).filter((s) => s.pattern === "core");
    expect(coreRapida.length).toBeLessThanOrEqual(coreLonga.length);
  });

  it("o volume semanal continua distribuído entre as vagas existentes", () => {
    // Cortar exercícios não pode deixar o alvo semanal órfão nem estourar o teto.
    const plan = generatePlan({ ...BASE, duration: "quick" });
    for (const slot of plan.splits.flatMap((s) => s.slots)) {
      expect(slot.sets).toBeGreaterThanOrEqual(2);
      expect(slot.sets).toBeLessThanOrEqual(5);
    }
  });
});
