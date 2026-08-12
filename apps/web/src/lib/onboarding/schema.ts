import { z } from "zod";

/**
 * Respostas do questionário de entrada.
 *
 * ## Por que existe um schema
 *
 * As respostas vivem no `localStorage` **antes de existir uma conta** — o
 * usuário responde tudo e só então cadastra. Isso significa que o que vem do
 * armazenamento é entrada não confiável: pode ter sido gravado por uma versão
 * anterior do app, editado à mão, ou corrompido. Validar na leitura é o que
 * impede um rascunho velho de gerar um plano silenciosamente errado.
 *
 * ## Por que quase tudo é opcional
 *
 * O questionário é retomável: quem fecha o app na pergunta 12 volta na 12. Um
 * schema que exigisse tudo rejeitaria todo rascunho parcial. A obrigatoriedade
 * é verificada na hora de **gerar** (`isComplete`), não na de gravar.
 */

export const SEXES = ["male", "female", "other"] as const;
export const EXPERIENCES = ["never", "beginner", "intermediate", "advanced"] as const;
export const CONSISTENCIES = ["never", "returning", "irregular", "regular"] as const;
export const OBJECTIVES = ["lose_fat", "build_muscle", "recomp", "strength", "health"] as const;
export const PLACES = ["full_gym", "small_gym", "home_equipped", "home_bodyweight"] as const;
export const DURATIONS = ["quick", "short", "average", "long"] as const;
export const FOCUS_AREAS = [
  "full_body",
  "chest",
  "back",
  "shoulders",
  "arms",
  "legs",
  "glutes",
  "abs",
] as const;
export const INJURIES = [
  "shoulder",
  "elbow",
  "wrist",
  "lower_back",
  "neck",
  "hip",
  "knee",
  "ankle",
] as const;
export const DIETS = [
  "none",
  "vegetarian",
  "vegan",
  "lactose_free",
  "gluten_free",
  "low_carb",
] as const;
export const ALLERGENS = [
  "lactose",
  "gluten",
  "egg",
  "peanut",
  "nuts",
  "seafood",
  "fish",
  "soy",
] as const;
export const COOKING_SKILLS = ["none", "basic", "confident"] as const;

/** `HH:MM`. O banco guarda `TIME`; o formulário, string. */
const timeString = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido")
  .optional();

export const answersSchema = z.object({
  sex: z.enum(SEXES).optional(),
  age: z.number().int().min(14).max(90).optional(),
  heightCm: z.number().min(130).max(230).optional(),
  weightKg: z.number().min(35).max(250).optional(),
  goalWeightKg: z.number().min(35).max(250).optional(),

  objective: z.enum(OBJECTIVES).optional(),
  experience: z.enum(EXPERIENCES).optional(),
  consistency: z.enum(CONSISTENCIES).optional(),

  place: z.enum(PLACES).optional(),
  equipment: z.array(z.string()).default([]),
  daysPerWeek: z.number().int().min(2).max(6).optional(),
  duration: z.enum(DURATIONS).optional(),
  /** 0 = domingo … 6 = sábado. */
  weekdays: z.array(z.number().int().min(0).max(6)).default([]),
  focus: z.enum(FOCUS_AREAS).optional(),
  injuries: z.array(z.enum(INJURIES)).default([]),

  mealsPerDay: z.number().int().min(3).max(8).optional(),
  diets: z.array(z.enum(DIETS)).default([]),
  allergies: z.array(z.enum(ALLERGENS)).default([]),
  likedFoods: z.array(z.string()).default([]),
  dislikedFoods: z.array(z.string()).default([]),
  cookingSkill: z.enum(COOKING_SKILLS).optional(),

  wakeTime: timeString,
  sleepTime: timeString,
  workoutTime: timeString,
});

export type Answers = z.infer<typeof answersSchema>;
export type AnswerKey = keyof Answers;

export const EMPTY_ANSWERS: Answers = answersSchema.parse({});

/**
 * O mínimo para gerar um plano que faça sentido.
 *
 * Sexo, idade, altura e peso entram porque sem eles não há TMB — e sem TMB toda
 * a meta calórica é chute. Objetivo, local e frequência definem o treino. O
 * resto refina; não bloqueia.
 */
export const REQUIRED_FOR_GENERATION = [
  "sex",
  "age",
  "heightCm",
  "weightKg",
  "objective",
  "experience",
  "place",
  "daysPerWeek",
] as const satisfies readonly AnswerKey[];

export function isComplete(answers: Answers): boolean {
  return REQUIRED_FOR_GENERATION.every((k) => answers[k] !== undefined && answers[k] !== null);
}

export function missingFields(answers: Answers): AnswerKey[] {
  return REQUIRED_FOR_GENERATION.filter((k) => answers[k] === undefined || answers[k] === null);
}
