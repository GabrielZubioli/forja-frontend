/**
 * Rótulos em pt-BR para os enums do banco.
 *
 * As colunas guardam identificadores em inglês (`chest`, `barbell`, `very_active`),
 * que estavam vazando direto para a interface — a biblioteca de exercícios exibia
 * badges "chest · barbell · strength" num app inteiramente em português.
 *
 * Espelham os enums definidos em `supabase/migrations/*.sql`.
 */

export const MUSCLE_LABELS = {
  chest: "Peito",
  back: "Costas",
  lats: "Dorsal",
  traps: "Trapézio",
  shoulders: "Ombros",
  front_delts: "Deltoide anterior",
  side_delts: "Deltoide lateral",
  rear_delts: "Deltoide posterior",
  biceps: "Bíceps",
  triceps: "Tríceps",
  forearms: "Antebraço",
  core: "Core",
  abs: "Abdômen",
  obliques: "Oblíquos",
  quads: "Quadríceps",
  hamstrings: "Posterior de coxa",
  glutes: "Glúteos",
  calves: "Panturrilhas",
  adductors: "Adutores",
  abductors: "Abdutores",
  lower_back: "Lombar",
  neck: "Pescoço",
  cardio: "Cardio",
  full_body: "Corpo inteiro",
} as const;

export type MuscleValue = keyof typeof MUSCLE_LABELS;

export const EQUIPMENT_LABELS = {
  barbell: "Barra",
  dumbbell: "Halter",
  machine: "Máquina",
  cable: "Polia",
  bodyweight: "Peso corporal",
  kettlebell: "Kettlebell",
  band: "Elástico",
  cardio: "Cardio",
  other: "Outro",
} as const;

export const CATEGORY_LABELS = {
  strength: "Força",
  cardio: "Cardio",
  stretching: "Alongamento",
  plyometrics: "Pliometria",
  olympic: "Olímpico",
} as const;

export const SET_TYPE_LABELS = {
  warmup: "Aquecimento",
  working: "Série de trabalho",
  drop: "Drop set",
  failure: "Até a falha",
} as const;

export type SetTypeValue = keyof typeof SET_TYPE_LABELS;

/** Abreviação exibida no botão de tipo de série. */
export const SET_TYPE_SHORT = {
  warmup: "A",
  working: "",
  drop: "D",
  failure: "F",
} as const;

/**
 * As oito refeições do dia.
 *
 * Eram quatro (`breakfast`, `lunch`, `dinner`, `snack`). Pré e pós-treino não
 * são "lanches": têm composição, horário e propósito próprios, e amontoá-los
 * numa caixa genérica impedia tanto prescrever quanto ler o que aconteceu.
 *
 * A ordem do array é a ordem cronológica do dia — é ela que a tela usa.
 */
export const MEAL_LABELS = {
  breakfast: "Café da manhã",
  morning_snack: "Lanche da manhã",
  lunch: "Almoço",
  afternoon_snack: "Lanche da tarde",
  pre_workout: "Pré-treino",
  post_workout: "Pós-treino",
  dinner: "Jantar",
  supper: "Ceia",
} as const;

export type MealValue = keyof typeof MEAL_LABELS;

/** Horário padrão de cada refeição, usado quando o usuário não informa o dele. */
export const MEAL_DEFAULT_TIMES: Record<MealValue, string> = {
  breakfast: "07:00",
  morning_snack: "10:00",
  lunch: "12:30",
  afternoon_snack: "15:30",
  pre_workout: "17:30",
  post_workout: "19:30",
  dinner: "20:30",
  supper: "22:30",
};

export const MEALS = [
  { key: "breakfast", label: MEAL_LABELS.breakfast },
  { key: "morning_snack", label: MEAL_LABELS.morning_snack },
  { key: "lunch", label: MEAL_LABELS.lunch },
  { key: "afternoon_snack", label: MEAL_LABELS.afternoon_snack },
  { key: "pre_workout", label: MEAL_LABELS.pre_workout },
  { key: "post_workout", label: MEAL_LABELS.post_workout },
  { key: "dinner", label: MEAL_LABELS.dinner },
  { key: "supper", label: MEAL_LABELS.supper },
] as const satisfies readonly { key: MealValue; label: string }[];

export const MOVEMENT_PATTERN_LABELS = {
  horizontal_push: "Empurrar horizontal",
  vertical_push: "Empurrar vertical",
  horizontal_pull: "Puxar horizontal",
  vertical_pull: "Puxar vertical",
  squat: "Agachamento",
  hinge: "Dobradiça de quadril",
  lunge: "Passada",
  isolation: "Isolado",
  core: "Core",
  carry: "Carregamento",
  cardio: "Cardio",
  mobility: "Mobilidade",
} as const;

export const EXERCISE_LEVEL_LABELS = {
  beginner: "Iniciante",
  intermediate: "Intermediário",
  advanced: "Avançado",
} as const;

export const MECHANIC_LABELS = {
  compound: "Composto",
  isolation: "Isolado",
} as const;

export const FORCE_TYPE_LABELS = {
  push: "Empurrar",
  pull: "Puxar",
  static: "Isometria",
} as const;

export const FOOD_CATEGORY_LABELS = {
  protein_meat: "Carnes e peixes",
  protein_egg: "Ovos",
  dairy: "Laticínios",
  legume: "Leguminosas",
  grain: "Cereais e pães",
  tuber: "Tubérculos",
  vegetable: "Vegetais",
  fruit: "Frutas",
  fat: "Gorduras e oleaginosas",
  beverage: "Bebidas",
  supplement: "Suplementos",
  sweet: "Doces",
  condiment: "Temperos e molhos",
  prepared: "Preparações",
  other: "Outros",
} as const;

export type FoodCategoryValue = keyof typeof FOOD_CATEGORY_LABELS;

/** Lesões que o questionário coleta e que filtram exercícios do plano. */
export const INJURY_LABELS = {
  shoulder: "Ombro",
  elbow: "Cotovelo",
  wrist: "Punho",
  lower_back: "Lombar",
  neck: "Pescoço",
  hip: "Quadril",
  knee: "Joelho",
  ankle: "Tornozelo",
} as const;

export type InjuryValue = keyof typeof INJURY_LABELS;

export const SEX_LABELS = {
  male: "Masculino",
  female: "Feminino",
  other: "Outro",
} as const;

export const ACTIVITY_LABELS = {
  sedentary: "Sedentário",
  light: "Leve",
  moderate: "Moderado",
  active: "Ativo",
  very_active: "Muito ativo",
} as const;

/** Descrições que ajudam o usuário a escolher o nível certo. */
export const ACTIVITY_HINTS = {
  sedentary: "Pouco ou nenhum exercício",
  light: "Exercício leve 1–3× por semana",
  moderate: "Exercício moderado 3–5× por semana",
  active: "Exercício intenso 6–7× por semana",
  very_active: "Trabalho físico ou 2 treinos por dia",
} as const;

export const GOAL_LABELS = {
  lose: "Perder gordura",
  maintain: "Manter",
  gain: "Ganhar massa",
} as const;

/**
 * Ângulos da foto de evolução.
 *
 * Quatro ângulos e não três: um lado só esconde metade das assimetrias, e
 * assimetria é justamente o que fotos de evolução revelam melhor que a balança.
 *
 * `side` continua no mapa por causa dos registros antigos — a coluna é TEXT
 * livre, então as fotos gravadas antes de existirem esquerda e direita têm esse
 * valor e precisam continuar exibindo um rótulo em português. Ele fica fora de
 * `PHOTO_ANGLE_OPTIONS`, que é o que a interface oferece para novas fotos.
 */
export const PHOTO_ANGLE_LABELS = {
  front: "Frente",
  back: "Costas",
  side_left: "Lado esquerdo",
  side_right: "Lado direito",
  side: "Lateral",
} as const;

export type PhotoAngleValue = keyof typeof PHOTO_ANGLE_LABELS;

/** Os ângulos oferecidos ao registrar, na ordem em que se fotografa. */
export const PHOTO_ANGLE_OPTIONS = [
  { value: "front", label: PHOTO_ANGLE_LABELS.front },
  { value: "back", label: PHOTO_ANGLE_LABELS.back },
  { value: "side_left", label: PHOTO_ANGLE_LABELS.side_left },
  { value: "side_right", label: PHOTO_ANGLE_LABELS.side_right },
] as const satisfies readonly { value: PhotoAngleValue; label: string }[];

/** Busca segura num mapa de rótulos, caindo no valor cru se o enum crescer. */
export function label<T extends Record<string, string>>(
  map: T,
  value: string | null | undefined,
  fallback = "—",
): string {
  if (!value) return fallback;
  return map[value] ?? value;
}
