import type {
  EquipmentProfile,
  FocusArea,
  SessionDuration,
  TrainingGoal,
  TrainingLevel,
} from "@forja/domain";
import type { Answers } from "./schema";

/**
 * Opções do questionário e o que cada resposta significa para o gerador.
 *
 * Separadas da tela porque o mapeamento **resposta → domínio** é a parte que
 * tem regra e merece ficar legível. O usuário responde na língua dele
 * ("Definir o corpo"); aqui isso vira o que o motor entende
 * (`goal: "hypertrophy"`, `weightGoal: "lose"`).
 */

export interface Option<T extends string> {
  value: T;
  label: string;
  hint?: string;
  emoji?: string;
}

export const SEX_OPTIONS: Option<"male" | "female" | "other">[] = [
  { value: "male", label: "Masculino" },
  { value: "female", label: "Feminino" },
  { value: "other", label: "Prefiro não dizer" },
];

/**
 * Experiência em quatro faixas — como a pessoa pensa —, mas o gerador só
 * distingue três níveis de volume. Acima de ~2 anos o que muda é a
 * individualização, não o volume base; fingir uma quarta faixa seria precisão
 * inventada.
 */
export const EXPERIENCE_OPTIONS: (Option<"never" | "beginner" | "intermediate" | "advanced"> & {
  level: TrainingLevel;
})[] = [
  { value: "never", label: "Nunca treinei", hint: "Vou começar agora", level: "beginner" },
  { value: "beginner", label: "Iniciante", hint: "Menos de 1 ano", level: "beginner" },
  { value: "intermediate", label: "Intermediário", hint: "1 a 3 anos", level: "intermediate" },
  { value: "advanced", label: "Avançado", hint: "Mais de 3 anos", level: "advanced" },
];

/**
 * Consistência atual.
 *
 * Quem está parado há meses volta a ser iniciante independentemente do que
 * respondeu antes: a força cai, a técnica enferruja, e um volume de
 * intermediário na primeira semana machuca ou desanima.
 */
export const CONSISTENCY_OPTIONS: (Option<"never" | "returning" | "irregular" | "regular"> & {
  forcesBeginner: boolean;
})[] = [
  {
    value: "regular",
    label: "Treino com regularidade",
    hint: "2× ou mais por semana",
    forcesBeginner: false,
  },
  {
    value: "irregular",
    label: "Treino de forma irregular",
    hint: "Algumas semanas sim, outras não",
    forcesBeginner: false,
  },
  {
    value: "returning",
    label: "Estou voltando",
    hint: "Parado há mais de 3 meses",
    forcesBeginner: true,
  },
  {
    value: "never",
    label: "Não treino",
    hint: "Nunca treinei ou parei há muito tempo",
    forcesBeginner: true,
  },
];

export const OBJECTIVE_OPTIONS: (Option<
  "lose_fat" | "build_muscle" | "recomp" | "strength" | "health"
> & {
  goal: TrainingGoal;
  weightGoal: "lose" | "maintain" | "gain";
})[] = [
  {
    value: "lose_fat",
    label: "Perder gordura",
    hint: "Emagrecer preservando músculo",
    emoji: "🔥",
    goal: "hypertrophy",
    weightGoal: "lose",
  },
  {
    value: "build_muscle",
    label: "Ganhar massa muscular",
    hint: "Aumentar músculo e peso",
    emoji: "💪",
    goal: "hypertrophy",
    weightGoal: "gain",
  },
  {
    value: "recomp",
    label: "Definir o corpo",
    hint: "Perder gordura e ganhar músculo ao mesmo tempo",
    emoji: "⚡",
    goal: "hypertrophy",
    weightGoal: "maintain",
  },
  {
    value: "strength",
    label: "Ficar mais forte",
    hint: "Cargas altas, poucas repetições",
    emoji: "🏋️",
    goal: "strength",
    weightGoal: "maintain",
  },
  {
    value: "health",
    label: "Saúde e condicionamento",
    hint: "Disposição no dia a dia",
    emoji: "❤️",
    goal: "endurance",
    weightGoal: "maintain",
  },
];

export const PLACE_OPTIONS: (Option<
  "full_gym" | "small_gym" | "home_equipped" | "home_bodyweight"
> & {
  equipment: EquipmentProfile;
  /** Equipamentos assumidos por padrão, editáveis no passo seguinte. */
  defaults: string[];
})[] = [
  {
    value: "full_gym",
    label: "Academia completa",
    hint: "Máquinas, polias, barras e halteres",
    equipment: "full_gym",
    defaults: ["barbell", "dumbbell", "machine", "cable", "bodyweight", "kettlebell", "band"],
  },
  {
    value: "small_gym",
    label: "Academia simples",
    hint: "Pesos livres e o básico",
    equipment: "full_gym",
    defaults: ["barbell", "dumbbell", "bodyweight", "machine"],
  },
  {
    value: "home_equipped",
    label: "Em casa, com equipamento",
    hint: "Halteres, elásticos, barra",
    equipment: "home_basic",
    defaults: ["dumbbell", "bodyweight", "band"],
  },
  {
    value: "home_bodyweight",
    label: "Em casa, sem equipamento",
    hint: "Só o peso do corpo",
    equipment: "bodyweight",
    defaults: ["bodyweight"],
  },
];

/** Equipamentos marcáveis. Os valores espelham o enum `equipment_t` do banco. */
export const EQUIPMENT_OPTIONS: Option<string>[] = [
  { value: "barbell", label: "Barra" },
  { value: "dumbbell", label: "Halteres" },
  { value: "machine", label: "Máquinas" },
  { value: "cable", label: "Polia" },
  { value: "bodyweight", label: "Peso corporal" },
  { value: "kettlebell", label: "Kettlebell" },
  { value: "band", label: "Elásticos" },
  { value: "other", label: "Outros acessórios" },
];

export const DURATION_OPTIONS: (Option<SessionDuration> & {
  minutes: string;
  exercises: string;
  recommended?: boolean;
})[] = [
  { value: "quick", label: "Rápido", minutes: "até 20 min", exercises: "3 exercícios" },
  { value: "short", label: "Curto", minutes: "20–40 min", exercises: "4 a 6 exercícios" },
  {
    value: "average",
    label: "Médio",
    minutes: "40–60 min",
    exercises: "5 a 7 exercícios",
    recommended: true,
  },
  { value: "long", label: "Longo", minutes: "mais de 60 min", exercises: "8 a 10 exercícios" },
];

export const FOCUS_OPTIONS: Option<FocusArea>[] = [
  { value: "full_body", label: "Corpo inteiro" },
  { value: "chest", label: "Peito" },
  { value: "back", label: "Costas" },
  { value: "shoulders", label: "Ombros" },
  { value: "arms", label: "Braços" },
  { value: "legs", label: "Pernas" },
  { value: "glutes", label: "Glúteos" },
  { value: "abs", label: "Abdômen" },
];

export const INJURY_OPTIONS: Option<string>[] = [
  { value: "shoulder", label: "Ombro" },
  { value: "elbow", label: "Cotovelo" },
  { value: "wrist", label: "Punho" },
  { value: "neck", label: "Pescoço" },
  { value: "lower_back", label: "Lombar" },
  { value: "hip", label: "Quadril" },
  { value: "knee", label: "Joelho" },
  { value: "ankle", label: "Tornozelo" },
];

export const DIET_OPTIONS: Option<string>[] = [
  { value: "vegetarian", label: "Vegetariana", hint: "Sem carne" },
  { value: "vegan", label: "Vegana", hint: "Sem nenhum produto animal" },
  { value: "lactose_free", label: "Sem lactose" },
  { value: "gluten_free", label: "Sem glúten" },
  { value: "low_carb", label: "Baixo carboidrato" },
];

export const ALLERGEN_OPTIONS: Option<string>[] = [
  { value: "lactose", label: "Leite e derivados" },
  { value: "gluten", label: "Glúten" },
  { value: "egg", label: "Ovo" },
  { value: "peanut", label: "Amendoim" },
  { value: "nuts", label: "Castanhas e nozes" },
  { value: "seafood", label: "Frutos do mar" },
  { value: "fish", label: "Peixe" },
  { value: "soy", label: "Soja" },
];

/**
 * Alimentos oferecidos como atalho de preferência.
 *
 * Uma lista curta de nomes que o gerador reconhece por correspondência de
 * texto. Não é o catálogo inteiro: pedir para a pessoa navegar 622 alimentos
 * no cadastro seria transformar o questionário num inventário de despensa.
 */
export const COMMON_FOODS = [
  "Frango",
  "Carne bovina",
  "Peixe",
  "Ovo",
  "Arroz",
  "Feijão",
  "Batata",
  "Macarrão",
  "Pão",
  "Aveia",
  "Tapioca",
  "Leite",
  "Iogurte",
  "Queijo",
  "Banana",
  "Maçã",
  "Laranja",
  "Mamão",
  "Abacate",
  "Brócolis",
  "Alface",
  "Tomate",
  "Cenoura",
  "Castanha",
  "Azeite",
  "Whey protein",
] as const;

export const COOKING_OPTIONS: Option<"none" | "basic" | "confident">[] = [
  { value: "none", label: "Não cozinho", hint: "Prefiro o mais simples possível" },
  { value: "basic", label: "O básico", hint: "Grelhar, cozinhar, montar prato" },
  { value: "confident", label: "Cozinho bem", hint: "Topo receitas mais elaboradas" },
];

/**
 * Refeições por dia.
 *
 * Vai até oito porque oito é o dia completo do app — café, lanche da manhã,
 * almoço, lanche da tarde, pré-treino, pós-treino, jantar e ceia. O limite
 * anterior era seis, o que tornava impossível pedir o cardápio inteiro que a
 * tela de Alimentação foi feita para mostrar.
 */
export const MEALS_PER_DAY_OPTIONS = [3, 4, 5, 6, 8] as const;

/** Padrão de quem não responde: o dia completo. */
export const DEFAULT_MEALS_PER_DAY = 8;

/** Faixas plausíveis dos controles numéricos. */
export const RANGES = {
  age: { min: 14, max: 90, default: 28, step: 1 },
  heightCm: { min: 130, max: 230, default: 172, step: 1 },
  weightKg: { min: 35, max: 250, default: 75, step: 0.5 },
  daysPerWeek: { min: 2, max: 6, default: 4 },
} as const;

// ---------------------------------------------------------------- derivações

/** Nível efetivo: experiência corrigida por quem está parado. */
export function derivedLevel(answers: Answers): TrainingLevel {
  const base = EXPERIENCE_OPTIONS.find((o) => o.value === answers.experience)?.level ?? "beginner";
  const parado = CONSISTENCY_OPTIONS.find((o) => o.value === answers.consistency)?.forcesBeginner;
  return parado ? "beginner" : base;
}

export function derivedObjective(answers: Answers) {
  return OBJECTIVE_OPTIONS.find((o) => o.value === answers.objective) ?? OBJECTIVE_OPTIONS[2]!;
}

export function derivedEquipmentProfile(answers: Answers): EquipmentProfile {
  return PLACE_OPTIONS.find((o) => o.value === answers.place)?.equipment ?? "full_gym";
}

/**
 * Nível de atividade para a TMB.
 *
 * Derivado da frequência declarada em vez de perguntado. "Moderadamente ativo"
 * não significa nada para quem responde — e a frequência de treino, que já
 * temos, prediz melhor o gasto que a autoavaliação.
 */
export function derivedActivityLevel(
  answers: Answers,
): "sedentary" | "light" | "moderate" | "active" | "very_active" {
  const dias = answers.daysPerWeek ?? 3;
  if (dias <= 2) return "light";
  if (dias <= 4) return "moderate";
  if (dias <= 5) return "active";
  return "very_active";
}

/**
 * Frequência recomendada, mostrada como retorno na tela de dias.
 *
 * Mais dias não é melhor: um iniciante rende mais com 3 sessões que consegue
 * sustentar do que com 6 que abandona na terceira semana.
 */
export function recommendedDays(level: TrainingLevel, goal: TrainingGoal): number {
  if (level === "beginner") return 3;
  if (goal === "strength") return 4;
  return level === "advanced" ? 5 : 4;
}

/** Classificação de IMC, para o retorno na tela de peso. */
export function bmiFeedback(weightKg: number, heightCm: number): { bmi: number; text: string } {
  const m = heightCm / 100;
  const bmi = m > 0 ? weightKg / (m * m) : 0;
  const rounded = Math.round(bmi * 10) / 10;

  if (bmi < 18.5) return { bmi: rounded, text: "Abaixo do peso — o foco será construir massa." };
  if (bmi < 25) return { bmi: rounded, text: "Faixa saudável. Vamos deixar você mais forte." };
  if (bmi < 30)
    return { bmi: rounded, text: "Acima do ideal — treino de força ajuda bastante aqui." };
  return { bmi: rounded, text: "Vamos com consistência: os resultados vêm." };
}

/** Como descrever a meta de peso escolhida. */
export function weightGoalFeedback(current: number, target: number): string {
  const diff = target - current;
  if (Math.abs(diff) < 1) return "Manter o peso, com foco em composição corporal.";
  if (diff < 0) {
    const semanas = Math.ceil(Math.abs(diff) / 0.5);
    return `Perder ${Math.abs(diff).toFixed(1)} kg — cerca de ${semanas} semanas num ritmo sustentável.`;
  }
  const semanas = Math.ceil(diff / 0.25);
  return `Ganhar ${diff.toFixed(1)} kg — cerca de ${semanas} semanas priorizando músculo.`;
}

/**
 * Dias da semana sugeridos para a frequência escolhida.
 *
 * Espaça os treinos ao longo da semana em vez de empilhá-los, porque o
 * estímulo distribuído recupera melhor — e porque quem treina 3× seguidas e
 * folga 4 tende a abandonar o terceiro dia.
 */
export function suggestWeekdays(days: number): number[] {
  const mapa: Record<number, number[]> = {
    2: [1, 4],
    3: [1, 3, 5],
    4: [1, 2, 4, 5],
    5: [1, 2, 3, 5, 6],
    6: [1, 2, 3, 4, 5, 6],
  };
  return mapa[Math.max(2, Math.min(6, days))] ?? [1, 3, 5];
}
