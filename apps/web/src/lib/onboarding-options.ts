/**
 * Opções do questionário de entrada.
 *
 * Separadas da tela porque o mapeamento resposta → domínio é a parte que tem
 * regra e merece ficar legível. O usuário responde em linguagem dele
 * ("Definir o corpo"), e aqui isso vira o que o gerador entende
 * (`goal: "hypertrophy"`).
 */
import type {
  EquipmentProfile,
  FocusArea,
  SessionDuration,
  TrainingGoal,
  TrainingLevel,
} from "@forja/domain";

export type Sex = "male" | "female" | "other";

export const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: "male", label: "Masculino" },
  { value: "female", label: "Feminino" },
  { value: "other", label: "Outro" },
];

/**
 * Experiência em quatro faixas, como o usuário pensa — mas o gerador só
 * distingue três níveis de volume. "Expert" e "Avançado" recebem a mesma
 * prescrição: acima de ~2 anos o que muda é a individualização, não o volume
 * base, e fingir uma quarta faixa seria precisão falsa.
 */
export const EXPERIENCE_OPTIONS: {
  value: string;
  label: string;
  hint: string;
  level: TrainingLevel;
}[] = [
  { value: "beginner", label: "Iniciante", hint: "Menos de 1 ano", level: "beginner" },
  { value: "intermediate", label: "Intermediário", hint: "1 a 2 anos", level: "intermediate" },
  { value: "advanced", label: "Avançado", hint: "2 a 4 anos", level: "advanced" },
  { value: "expert", label: "Experiente", hint: "Mais de 4 anos", level: "advanced" },
];

/**
 * Consistência atual.
 *
 * Quem nunca treinou ou está parado há meses começa como iniciante,
 * independentemente do que respondeu antes — a força some, a técnica enferruja,
 * e um volume de intermediário machuca.
 */
export const CONSISTENCY_OPTIONS: {
  value: string;
  label: string;
  hint: string;
  forcesBeginner: boolean;
}[] = [
  {
    value: "regularly",
    label: "Com regularidade",
    hint: "Pelo menos duas vezes por semana",
    forcesBeginner: false,
  },
  {
    value: "inconsistently",
    label: "De forma irregular",
    hint: "Algumas semanas sim, outras não",
    forcesBeginner: false,
  },
  {
    value: "never",
    label: "Não treino",
    hint: "Nunca treinei ou estou parado há mais de 6 meses",
    forcesBeginner: true,
  },
];

export const GOAL_OPTIONS: {
  value: string;
  label: string;
  hint: string;
  goal: TrainingGoal;
  /** Direção de peso pretendida, gravada no perfil. */
  weightGoal: "lose" | "maintain" | "gain";
}[] = [
  {
    value: "fitness",
    label: "Melhorar o condicionamento",
    hint: "Saúde e disposição no dia a dia",
    goal: "endurance",
    weightGoal: "maintain",
  },
  {
    value: "stronger",
    label: "Ficar mais forte",
    hint: "Cargas altas, poucas repetições",
    goal: "strength",
    weightGoal: "maintain",
  },
  {
    value: "definition",
    label: "Definir o corpo",
    hint: "Manter músculo perdendo gordura",
    goal: "hypertrophy",
    weightGoal: "lose",
  },
  {
    value: "bulk",
    label: "Ganhar massa",
    hint: "Aumentar músculo e peso",
    goal: "hypertrophy",
    weightGoal: "gain",
  },
];

export const PLACE_OPTIONS: {
  value: string;
  label: string;
  hint: string;
  equipment: EquipmentProfile;
}[] = [
  {
    value: "commercial",
    label: "Academia completa",
    hint: "Máquinas, polias, barras e halteres",
    equipment: "full_gym",
  },
  {
    value: "small",
    label: "Academia pequena",
    hint: "Pesos livres e equipamento básico",
    equipment: "full_gym",
  },
  {
    value: "home",
    label: "Em casa com pesos",
    hint: "Halteres, elásticos e peso corporal",
    equipment: "home_basic",
  },
  {
    value: "bodyweight",
    label: "Sem equipamento",
    hint: "Só peso corporal",
    equipment: "bodyweight",
  },
];

export const FOCUS_OPTIONS: { value: FocusArea; label: string }[] = [
  { value: "full_body", label: "Corpo inteiro" },
  { value: "shoulders", label: "Ombros" },
  { value: "arms", label: "Braços" },
  { value: "chest", label: "Peito" },
  { value: "abs", label: "Abdômen" },
  { value: "back", label: "Costas" },
  { value: "glutes", label: "Glúteos" },
  { value: "legs", label: "Pernas" },
];

export const DURATION_OPTIONS: {
  value: SessionDuration;
  label: string;
  minutes: string;
  exercises: string;
  recommended?: boolean;
}[] = [
  { value: "quick", label: "Rápido", minutes: "até 20 min", exercises: "3 exercícios" },
  { value: "short", label: "Curto", minutes: "20–40 min", exercises: "4 a 6 exercícios" },
  {
    value: "average",
    label: "Médio",
    minutes: "40–60 min",
    exercises: "5 a 7 exercícios",
    recommended: true,
  },
  { value: "long", label: "Longo", minutes: "60+ min", exercises: "8 a 10 exercícios" },
];

/** Faixas plausíveis para os controles deslizantes. */
export const RANGES = {
  age: { min: 14, max: 90, default: 25 },
  height: { min: 130, max: 220, default: 175 },
  weight: { min: 35, max: 200, default: 75 },
  daysPerWeek: { min: 2, max: 6, default: 3 },
} as const;

/**
 * Frequência recomendada a partir do nível e do objetivo.
 *
 * Mais dias não é melhor: um iniciante ganha mais com 3 sessões bem executadas
 * do que com 6 que ele não sustenta.
 */
export function recommendedDays(level: TrainingLevel, goal: TrainingGoal): number {
  if (level === "beginner") return 3;
  if (goal === "strength") return 4;
  return level === "advanced" ? 5 : 4;
}

/** Classificação simples de IMC, para o retorno na tela de peso. */
export function bmiFeedback(weightKg: number, heightCm: number): { bmi: number; text: string } {
  const metros = heightCm / 100;
  const bmi = metros > 0 ? weightKg / (metros * metros) : 0;
  const rounded = Math.round(bmi * 10) / 10;

  if (bmi < 18.5) return { bmi: rounded, text: "Abaixo do peso — vamos focar em construir massa." };
  if (bmi < 25) return { bmi: rounded, text: "Faixa saudável. Vamos deixar você mais forte." };
  if (bmi < 30) return { bmi: rounded, text: "Acima do ideal — treino de força ajuda muito aqui." };
  return { bmi: rounded, text: "Vamos com calma e consistência: os ganhos vêm." };
}

/** Como descrever a meta de peso escolhida. */
export function weightGoalFeedback(current: number, target: number): string {
  const diferenca = target - current;
  if (Math.abs(diferenca) < 1) return "Mantendo o peso — foco em força e composição corporal.";
  if (diferenca < 0) return `Perder ${Math.abs(diferenca).toFixed(1)} kg de forma sustentável.`;
  return `Ganhar ${diferenca.toFixed(1)} kg priorizando músculo.`;
}
