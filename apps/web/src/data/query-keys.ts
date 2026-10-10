/**
 * Factory central de chaves do React Query.
 *
 * Antes, cada tela declarava arrays literais (`["food_log", date]`) e a
 * invalidação dependia de lembrar a string exata em cada mutação — o que já
 * causava bugs reais (a receita lançada no diário não invalidava o diário).
 *
 * As chaves são **hierárquicas**: invalidar `queryKeys.workouts.all` atinge
 * sessões, histórico e séries de uma vez, porque o React Query casa chaves por
 * prefixo.
 */

export const queryKeys = {
  profile: () => ["profile"] as const,

  body: {
    all: ["body"] as const,
    weights: (days: number) => ["body", "weights", days] as const,
    latestWeight: () => ["body", "weights", "latest"] as const,
    /** Primeiro peso já registrado — o ponto de partida da jornada no perfil. */
    firstWeight: () => ["body", "weights", "first"] as const,
    measurements: () => ["body", "measurements"] as const,
    photos: () => ["body", "photos"] as const,
  },

  workouts: {
    all: ["workouts"] as const,
    activeRoutine: () => ["workouts", "routine", "active"] as const,
    templates: () => ["workouts", "templates"] as const,
    template: (id: string) => ["workouts", "template", id] as const,
    templateItems: (id: string) => ["workouts", "template", id, "items"] as const,
    history: () => ["workouts", "history"] as const,
    personalRecords: () => ["workouts", "records"] as const,
    recovery: () => ["workouts", "recovery"] as const,
    muscleSets: () => ["workouts", "muscle-sets"] as const,
    recentSessions: () => ["workouts", "recent"] as const,
    weeklyVolume: (weekStart: string) => ["workouts", "weekly-volume", weekStart] as const,
    session: (id: string) => ["workouts", "session", id] as const,
    sessionSets: (id: string) => ["workouts", "session", id, "sets"] as const,
    exerciseBest: (exerciseId: string) => ["workouts", "exercise-best", exerciseId] as const,
    exerciseLastSet: (exerciseId: string) => ["workouts", "exercise-last", exerciseId] as const,
  },

  exercises: {
    all: ["exercises"] as const,
    search: (term: string, muscle?: string) =>
      ["exercises", "search", term, muscle ?? "all"] as const,
    /**
     * Biblioteca paginada. Os filtros entram ordenados na chave: sem isso,
     * marcar peito-e-costas e costas-e-peito seriam dois caches diferentes
     * para exatamente o mesmo resultado.
     */
    library: (term: string, muscles: readonly string[], equipment: readonly string[]) =>
      [
        "exercises",
        "library",
        term,
        [...muscles].sort().join(","),
        [...equipment].sort().join(","),
      ] as const,
  },

  foods: {
    all: ["foods"] as const,
    search: (term: string) => ["foods", "search", term] as const,
  },

  diet: {
    all: ["diet"] as const,
    log: (date: string) => ["diet", "log", date] as const,
    activePlan: () => ["diet", "plan", "active"] as const,
    planMeals: (planId: string) => ["diet", "plan", planId, "meals"] as const,
    slots: () => ["diet", "slots"] as const,
    favorites: () => ["diet", "favorites"] as const,
    substitutions: (foodId: string) => ["diet", "substitutions", foodId] as const,
  },

  water: {
    all: ["water"] as const,
    day: (date: string) => ["water", date] as const,
  },

  goals: {
    all: ["goals"] as const,
    list: () => ["goals", "list"] as const,
  },

  coach: {
    all: ["coach"] as const,
    recommendations: () => ["coach", "recommendations"] as const,
    conversations: () => ["coach", "conversations"] as const,
    messages: (id: string) => ["coach", "conversation", id, "messages"] as const,
  },

  recipes: {
    all: ["recipes"] as const,
    list: () => ["recipes", "list"] as const,
    detail: (id: string) => ["recipes", "detail", id] as const,
    items: (id: string) => ["recipes", "detail", id, "items"] as const,
  },
} as const;
