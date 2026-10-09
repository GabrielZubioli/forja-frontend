import type { PlanInput } from "./plan-generator";

/**
 * Programas prontos: respostas pré-escolhidas para o gerador de plano.
 *
 * Um programa não é uma ficha fixa — é um conjunto de entradas curado. Começar
 * um programa passa pelo mesmo `generatePlan` do assistente, então a ficha
 * respeita o catálogo de exercícios e o equipamento como qualquer outra.
 */
export interface TrainingProgram {
  slug: string;
  name: string;
  description: string;
  /** Sugestão de quanto tempo seguir antes de reavaliar. */
  weeks: number;
  input: PlanInput;
}

export const TRAINING_PROGRAMS: readonly TrainingProgram[] = [
  {
    slug: "primeiros-passos",
    name: "Primeiros passos",
    description: "Corpo inteiro, três vezes por semana, para aprender os movimentos básicos.",
    weeks: 8,
    input: { level: "beginner", goal: "hypertrophy", equipment: "full_gym", daysPerWeek: 3 },
  },
  {
    slug: "hipertrofia-4x",
    name: "Hipertrofia 4×",
    description: "Divisão superior/inferior com volume moderado para ganhar massa.",
    weeks: 10,
    input: { level: "intermediate", goal: "hypertrophy", equipment: "full_gym", daysPerWeek: 4 },
  },
  {
    slug: "forca-base",
    name: "Força de base",
    description: "Poucas repetições e descanso longo nos multiarticulares.",
    weeks: 8,
    input: { level: "intermediate", goal: "strength", equipment: "full_gym", daysPerWeek: 4 },
  },
  {
    slug: "condicionamento",
    name: "Condicionamento",
    description: "Mais repetições, descanso curto e sessões ágeis para gastar energia.",
    weeks: 6,
    input: {
      level: "beginner",
      goal: "endurance",
      equipment: "full_gym",
      daysPerWeek: 3,
      duration: "short",
    },
  },
  {
    slug: "casa-halteres",
    name: "Em casa com halteres",
    description: "Para quem treina em casa com halteres e banco.",
    weeks: 8,
    input: { level: "beginner", goal: "hypertrophy", equipment: "home_basic", daysPerWeek: 3 },
  },
  {
    slug: "peso-do-corpo",
    name: "Só peso do corpo",
    description: "Nenhum equipamento: dá para fazer na sala ou no hotel.",
    weeks: 6,
    input: { level: "beginner", goal: "endurance", equipment: "bodyweight", daysPerWeek: 3 },
  },
  {
    slug: "gluteos-pernas",
    name: "Glúteos e pernas",
    description: "Ênfase em membros inferiores sem largar o tronco.",
    weeks: 8,
    input: {
      level: "intermediate",
      goal: "hypertrophy",
      equipment: "full_gym",
      daysPerWeek: 4,
      focus: "glutes",
    },
  },
];

export function findProgram(slug: string | undefined): TrainingProgram | undefined {
  return TRAINING_PROGRAMS.find((p) => p.slug === slug);
}
