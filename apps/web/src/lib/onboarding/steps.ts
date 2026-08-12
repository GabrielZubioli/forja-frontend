import type { Answers } from "./schema";

/**
 * Sequência do questionário.
 *
 * ## Por que a ordem é esta
 *
 * As primeiras perguntas são as **fáceis e sem julgamento** (gênero,
 * experiência, objetivo). As sensíveis — peso, meta de peso, lesões — vêm
 * depois, quando a pessoa já investiu alguns toques e entendeu para que serve.
 * Abrir pedindo o peso é a forma mais rápida de perder alguém logo na primeira
 * tela.
 *
 * As de alimentação vêm por último porque são as mais longas de responder, e a
 * essa altura o usuário já sabe que está montando algo para si.
 *
 * ## Por que declarativo
 *
 * A tela não sabe quantos passos existem nem quais foram pulados: ela lê desta
 * lista. Isso mantém a barra de progresso honesta quando um passo é
 * condicional — quem treina sem equipamento não vê a tela de equipamentos, e a
 * barra não conta um passo que nunca vai aparecer.
 */

export interface StepDef {
  id: string;
  /** Oculta o passo com base no que já foi respondido. */
  skipIf?: (a: Answers) => boolean;
  /** Se a resposta avança sozinha (escolha única) ou exige "Continuar". */
  autoAdvance?: boolean;
}

export const STEPS = [
  { id: "welcome" },
  { id: "objective", autoAdvance: true },
  { id: "sex", autoAdvance: true },
  { id: "experience", autoAdvance: true },
  { id: "consistency", autoAdvance: true },
  { id: "age" },
  { id: "height" },
  { id: "weight" },
  {
    id: "goalWeight",
    // Quem escolheu "saúde" ou "força" não tem meta de peso; perguntá-la
    // sugeriria que o app não entendeu a resposta anterior.
    skipIf: (a) => a.objective === "health" || a.objective === "strength",
  },
  { id: "place", autoAdvance: true },
  {
    id: "equipment",
    // Sem equipamento não há o que marcar.
    skipIf: (a) => a.place === "home_bodyweight",
  },
  { id: "daysPerWeek" },
  { id: "duration", autoAdvance: true },
  { id: "weekdays" },
  { id: "workoutTime" },
  { id: "focus", autoAdvance: true },
  { id: "injuries" },
  { id: "routine" },
  { id: "mealsPerDay", autoAdvance: true },
  { id: "diets" },
  { id: "allergies" },
  { id: "likedFoods" },
  { id: "dislikedFoods" },
  { id: "cooking", autoAdvance: true },
  { id: "review" },
] as const satisfies readonly StepDef[];

export type StepId = (typeof STEPS)[number]["id"];

/** Passos que de fato serão exibidos, dadas as respostas até aqui. */
export function visibleSteps(answers: Answers): StepDef[] {
  return STEPS.filter((s) => !("skipIf" in s && s.skipIf?.(answers)));
}
