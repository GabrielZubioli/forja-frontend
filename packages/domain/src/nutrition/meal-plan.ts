import { z } from "zod";
import type { CulinaryRole, FoodProfile } from "./curated-foods";
import { normalizeText, safePool } from "./dietary-filters";
import { foodCandidateSchema, type CatalogFood } from "./food-catalog";
import { distributeMeals, mealSlotSchema, type MealSlot } from "./meal-slots";
import { MEAL_RECIPES, type MealRecipe, type RecipeComponent } from "./recipes";
import { nutritionTotals, ZERO_TOTALS, type MacroTotals } from "./totals";

/**
 * Gerador do cardápio semanal.
 *
 * ## Etapas (especificação "Regras de geração de dietas", §8)
 *
 * 1. **Pool seguro**: só alimentos curados, com macros válidos, filtrados por
 *    alergia, dieta e "não gosto" pelos marcadores — nunca afrouxados.
 * 2. **Meta única**: os sete dias recebem exatamente as mesmas metas.
 * 3. **Refeição por receita**: cada horário escolhe uma receita reconhecível
 *    (arroz, feijão, proteína e salada; pão com ovo e fruta…) cujos
 *    ingredientes existam no pool seguro.
 * 4. **Quantidades incrementais**: fixos na porção padrão; a proteína fecha o
 *    alvo da refeição descontando a que os outros já trazem; a base fecha as
 *    calorias que sobram. Tudo dentro dos limites de porção do alimento.
 * 5. **Fechamento do dia**: ajusta, passo a passo e dentro dos limites, as
 *    bases e depois as proteínas até ±50 kcal (ou ±100). A meta nunca muda;
 *    se não fechar, o desvio real é informado.
 * 6. **Semana**: rotação determinística de receitas e alimentos, com
 *    penalidade por repetição, para variar sem perder coerência.
 *
 * Determinístico: mesma entrada, mesma versão e mesma semente → mesmo plano.
 */

/** Versão do algoritmo. Muda junto com qualquer regra deste arquivo ou das receitas. */
export const MEAL_PLAN_RULES_VERSION = "2026.10-1";

/** Tolerância calórica diária. */
export const KCAL_TOLERANCE = { ideal: 50, acceptable: 100 } as const;

const catalogFoodSchema = foodCandidateSchema.extend({
  profile: z.custom<FoodProfile>(
    (v) => typeof v === "object" && v !== null && "key" in v && "portion" in v,
    "Alimento sem perfil curado",
  ),
});

export const weeklyPlanInputSchema = z.object({
  targets: z.object({
    kcal: z.number().positive(),
    proteinG: z.number().nonnegative(),
    carbsG: z.number().nonnegative(),
    fatG: z.number().nonnegative(),
  }),
  slots: z.array(mealSlotSchema).min(1),
  foods: z.array(catalogFoodSchema),
  restrictions: z
    .object({
      diets: z.array(z.string()).default([]),
      allergies: z.array(z.string()).default([]),
      dislikedFoods: z.array(z.string()).default([]),
    })
    .default({}),
  /** "Gosto de X": peso na escolha, nunca obrigação. */
  preferred: z.array(z.string()).default([]),
  wakeMinutes: z.number().int().min(0).max(1439).optional(),
  sleepMinutes: z.number().int().min(0).max(1439).optional(),
  workoutMinutes: z.number().int().min(0).max(1439).optional(),
  seed: z.number().int().nonnegative().default(0),
});

export type WeeklyPlanInput = z.input<typeof weeklyPlanInputSchema>;

export interface PlannedItem {
  foodId: string;
  foodKey: string;
  name: string;
  grams: number;
  role: CulinaryRole;
}

export interface PlannedMeal {
  slot: MealSlot;
  minutes: number;
  kcalTarget: number;
  proteinTarget: number;
  carbsTarget: number;
  fatTarget: number;
  recipeId: string | null;
  recipeName: string | null;
  items: PlannedItem[];
  totals: MacroTotals;
  /** Por que a refeição não pôde ser montada. Nunca é preenchida com qualquer coisa. */
  issue?: string;
}

export type ToleranceStatus = "ideal" | "acceptable" | "outside";

export interface PlannedDay {
  /** 0 = domingo. */
  weekday: number;
  meals: PlannedMeal[];
  totals: MacroTotals;
  /** total − meta, em kcal. */
  kcalDeviation: number;
  proteinDeviationG: number;
  status: ToleranceStatus;
}

export interface WeeklyPlan {
  rulesVersion: string;
  seed: number;
  targets: { kcal: number; proteinG: number; carbsG: number; fatG: number };
  days: PlannedDay[];
  warnings: string[];
  poolSize: number;
}

export type WeeklyPlanResult = { ok: true; plan: WeeklyPlan } | { ok: false; reason: string };

/** Situação de um total diante da meta, com a tolerância da especificação. */
export function toleranceStatus(totalKcal: number, targetKcal: number): ToleranceStatus {
  const d = Math.abs(totalKcal - targetKcal);
  if (d <= KCAL_TOLERANCE.ideal) return "ideal";
  if (d <= KCAL_TOLERANCE.acceptable) return "acceptable";
  return "outside";
}

// ------------------------------------------------------------------ internos

/** FNV-1a: desempate determinístico, sem `Math.random`. */
function hash01(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 2 ** 32;
}

/** Macros pela mesma função do diário (catálogo por 100 g). */
function macrosOf(food: CatalogFood, grams: number): MacroTotals {
  return nutritionTotals([
    {
      food: {
        servingSizeG: 100,
        kcal: food.kcal,
        proteinG: food.proteinG,
        carbsG: food.carbsG,
        fatG: food.fatG,
        fiberG: food.fiberG,
      },
      grams,
    },
  ]);
}

function clampRound(grams: number, food: CatalogFood): number {
  const { min, max, step } = food.profile.portion;
  const g = Math.round(Math.min(max, Math.max(min, grams)) / step) * step;
  return Math.min(max, Math.max(min, g));
}

interface Slot {
  comp: RecipeComponent;
  food: CatalogFood;
  grams: number;
}

interface Target {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

const sum = (items: readonly Slot[]) =>
  items.reduce<MacroTotals>((acc, i) => {
    const m = macrosOf(i.food, i.grams);
    return {
      kcal: acc.kcal + m.kcal,
      proteinG: acc.proteinG + m.proteinG,
      carbsG: acc.carbsG + m.carbsG,
      fatG: acc.fatG + m.fatG,
      fiberG: acc.fiberG + m.fiberG,
    };
  }, ZERO_TOTALS);

/**
 * Quantidades de uma refeição, incrementalmente.
 *
 * A proteína é calculada descontando a que pão, aveia, feijão e laticínios já
 * trazem; a base, descontando as calorias de todo o resto. Três passadas
 * bastam para as duas contas se estabilizarem.
 */
function sizeMeal(items: Slot[], target: Target): void {
  for (let pass = 0; pass < 3; pass++) {
    for (const item of items.filter((i) => i.comp.sizing === "protein")) {
      const outros = sum(items.filter((i) => i !== item)).proteinG;
      const falta = Math.max(0, target.proteinG - outros);
      const densidade = item.food.proteinG / 100;
      item.grams =
        densidade > 0.01
          ? clampRound(falta / densidade, item.food)
          : item.food.profile.portion.default;
    }
    const energia = items.filter((i) => i.comp.sizing === "energy");
    if (energia.length === 0) continue;
    const restante = Math.max(
      0,
      target.kcal - sum(items.filter((i) => i.comp.sizing !== "energy")).kcal,
    );
    for (const item of energia) {
      item.grams = clampRound(restante / energia.length / (item.food.kcal / 100), item.food);
    }
  }
}

/** Quantidades de uma refeição avulsa (exposto para teste e para receitas montadas à mão). */
export function sizeMealPortions(
  items: readonly { food: CatalogFood; sizing: RecipeComponent["sizing"] }[],
  target: Target,
): number[] {
  const slots: Slot[] = items.map(({ food, sizing }) => ({
    comp: { role: food.profile.role, sizing },
    food,
    grams: food.profile.portion.default,
  }));
  sizeMeal(slots, target);
  return slots.map((s) => s.grams);
}

interface WeekState {
  foodUse: Map<string, number>;
  recipeUse: Map<string, number>;
  previousRecipe: Map<MealSlot, string>;
}

interface Context {
  pool: readonly CatalogFood[];
  preferred: readonly string[];
  seed: number;
  day: number;
  slot: MealSlot;
  week: WeekState;
  usedToday: Set<string>;
}

function candidates(ctx: Context, comp: RecipeComponent, excluded: ReadonlySet<string>) {
  return ctx.pool.filter(
    (f) =>
      f.profile.role === comp.role &&
      f.profile.meals.includes(ctx.slot) &&
      (!comp.only || comp.only.includes(f.profile.key)) &&
      !excluded.has(f.profile.key),
  );
}

function isViable(recipe: MealRecipe, ctx: Context): boolean {
  const usados = new Set<string>();
  for (const comp of recipe.components) {
    const opcoes = candidates(ctx, comp, usados);
    if (opcoes.length === 0) {
      if (comp.optional) continue;
      return false;
    }
    // Reserva um, para dois vegetais da mesma lista não contarem o mesmo alimento.
    usados.add(opcoes[0]!.profile.key);
  }
  return true;
}

/**
 * Escolhe o alimento de um ingrediente.
 *
 * Penaliza o que já apareceu na semana e no dia (variedade), favorece o que a
 * pessoa gosta, e desempata por hash da semente — rotação entre opções
 * culinariamente válidas, em vez de sempre os seis mais populares.
 */
function pickFood(
  ctx: Context,
  recipe: MealRecipe,
  index: number,
  comp: RecipeComponent,
  excluded: ReadonlySet<string>,
): CatalogFood | undefined {
  let melhor: { food: CatalogFood; score: number } | undefined;
  for (const food of candidates(ctx, comp, excluded)) {
    const nome = normalizeText(food.name);
    const gosta = ctx.preferred.some((p) => p.length >= 3 && nome.includes(normalizeText(p)));
    // Para fechar proteína, fonte densa (g por 100 kcal) vem antes: tofu e ovo
    // continuam no rodízio, mas não tomam o lugar do frango de quem come carne.
    const densidade = food.kcal > 0 ? (food.proteinG / food.kcal) * 100 : 0;
    const score =
      (comp.sizing === "protein" ? Math.max(0, 15 - densidade) * 0.4 : 0) +
      (ctx.week.foodUse.get(food.profile.key) ?? 0) * 3 +
      (ctx.usedToday.has(food.profile.key) ? 6 : 0) -
      (gosta ? 4 : 0) +
      hash01(ctx.seed, ctx.day, ctx.slot, recipe.id, index, food.profile.key) * 2.5;
    if (!melhor || score < melhor.score) melhor = { food, score };
  }
  return melhor?.food;
}

function buildMeal(recipe: MealRecipe, target: Target, ctx: Context): Slot[] {
  const usados = new Set<string>();
  const items: Slot[] = [];
  recipe.components.forEach((comp, index) => {
    const food = pickFood(ctx, recipe, index, comp, usados);
    if (!food) return;
    usados.add(food.profile.key);
    items.push({ comp, food, grams: food.profile.portion.default });
  });
  sizeMeal(items, target);
  return items;
}

/** Erro relativo de calorias de uma refeição montada. */
const mealError = (items: Slot[], target: Target) =>
  target.kcal > 0 ? Math.abs(sum(items).kcal - target.kcal) / target.kcal : 0;

function planMeal(target: Target, ctx: Context): { recipe: MealRecipe; items: Slot[] } | null {
  const viaveis = MEAL_RECIPES.filter((r) => r.slots.includes(ctx.slot) && isViable(r, ctx));
  const principais = viaveis.filter((r) => !r.fallback);
  const lista = principais.length > 0 ? principais : viaveis;
  if (lista.length === 0) return null;

  const ordenadas = lista
    .map((recipe) => ({
      recipe,
      score:
        (ctx.week.recipeUse.get(recipe.id) ?? 0) * 10 +
        (ctx.week.previousRecipe.get(ctx.slot) === recipe.id ? 30 : 0) +
        hash01(ctx.seed, ctx.day, ctx.slot, recipe.id) * 8,
    }))
    .sort((a, b) => a.score - b.score || a.recipe.id.localeCompare(b.recipe.id));

  // Se a receita da vez não cabe na meta da refeição sem porções irreais,
  // tenta a próxima — em vez de esticar a porção indefinidamente.
  let melhor: { recipe: MealRecipe; items: Slot[]; erro: number } | undefined;
  for (const { recipe } of ordenadas.slice(0, 4)) {
    const items = buildMeal(recipe, target, ctx);
    const erro = mealError(items, target);
    if (!melhor || erro < melhor.erro) melhor = { recipe, items, erro };
    if (erro <= 0.15) break;
  }
  return melhor ?? null;
}

/**
 * Fecha o dia na meta calórica sem mudar a meta.
 *
 * Fase 1 — calorias: um passo de porção por vez, sempre o que mais aproxima
 * da meta, primeiro nas bases e depois nas proteínas, até ±50 kcal ou até
 * nenhum passo ajudar. Fase 2 — proteína: trocas que aproximam a proteína sem
 * tirar as calorias da faixa já alcançada.
 */
function closeDay(meals: { items: Slot[]; target: Target }[], target: Target): void {
  const items = meals.flatMap((m) => m.items);
  // Vegetais ficam como estão: não se fecha caloria com alface.
  const ajustaveis = items.filter((i) => i.food.profile.role !== "vegetable");
  const refeicaoDe = new Map(meals.flatMap((m) => m.items.map((i) => [i, m] as const)));
  // Bases primeiro, proteínas depois; acompanhamentos (feijão, fruta,
  // laticínio, azeite) só quando bases e proteínas já bateram no limite.
  const prioridade = (i: Slot) =>
    i.comp.sizing === "energy" ? 0 : i.comp.sizing === "protein" ? 15 : 40;
  const kcalDe = (i: Slot, g: number) => (i.food.kcal / 100) * g;
  const protDe = (i: Slot, g: number) => (i.food.proteinG / 100) * g;
  const dentro = (i: Slot, g: number) =>
    g >= i.food.profile.portion.min && g <= i.food.profile.portion.max;

  let total = sum(items);

  // Mira a meta, não a borda da tolerância: para quando nenhum passo aproxima.
  for (let guard = 0; guard < 400; guard++) {
    const kd = target.kcal - total.kcal;
    const dir = Math.sign(kd);
    if (dir === 0) break;
    let melhor: { item: Slot; g: number; custo: number } | undefined;
    for (const item of ajustaveis) {
      const g = item.grams + dir * item.food.profile.portion.step;
      if (!dentro(item, g)) continue;
      const novo = Math.abs(kd - (kcalDe(item, g) - kcalDe(item, item.grams)));
      if (novo >= Math.abs(kd)) continue;
      // Puxa a refeição mais longe do próprio alvo: aumentar o jantar que já
      // passou da conta deixaria o dia certo e a refeição desproporcional.
      const refeicao = refeicaoDe.get(item)!;
      const desvioRefeicao = sum(refeicao.items).kcal - refeicao.target.kcal;
      const custo = novo + prioridade(item) + dir * desvioRefeicao * 0.5;
      if (!melhor || custo < melhor.custo) melhor = { item, g, custo };
    }
    if (!melhor) break;
    melhor.item.grams = melhor.g;
    total = sum(items);
  }

  const limite = Math.max(Math.abs(target.kcal - total.kcal), KCAL_TOLERANCE.ideal);
  const proteinas = ajustaveis.filter((i) => i.comp.sizing === "protein");
  const bases = ajustaveis.filter((i) => i.comp.sizing === "energy");

  for (let guard = 0; guard < 200; guard++) {
    const pd = target.proteinG - total.proteinG;
    if (Math.abs(pd) <= target.proteinG * 0.05) break;
    const dir = Math.sign(pd);
    // Custo = proteína que falta + 0,1 g por kcal fora da meta: entre ganhar
    // 3,6 g gastando 22 kcal e 3,3 g gastando 9, a troca neutra vence e a
    // faixa de ±50 kcal não se esgota no primeiro passo.
    let melhor: { moves: [Slot, number][]; custo: number } | undefined;

    const avaliar = (moves: [Slot, number][]) => {
      if (moves.some(([i, g]) => !dentro(i, g))) return;
      let dk = 0;
      let dp = 0;
      for (const [i, g] of moves) {
        dk += kcalDe(i, g) - kcalDe(i, i.grams);
        dp += protDe(i, g) - protDe(i, i.grams);
      }
      const novoKd = Math.abs(target.kcal - total.kcal - dk);
      const novoPd = Math.abs(pd - dp);
      if (novoKd > limite || novoPd >= Math.abs(pd) - 0.5) return;
      const custo = novoPd + novoKd * 0.1;
      if (!melhor || custo < melhor.custo) melhor = { moves, custo };
    };

    // Lanches leves em proteína são compensados nas refeições com fonte
    // proteica — mas a troca com a base é sempre dentro da mesma refeição: o
    // dia fecha sem tirar o pão do café para engordar o bife do jantar.
    for (const p of proteinas) {
      const refeicao = refeicaoDe.get(p)!;
      const gp = p.grams + dir * p.food.profile.portion.step;
      avaliar([[p, gp]]);
      for (const b of bases.filter((x) => refeicaoDe.get(x) === refeicao)) {
        avaliar([
          [p, gp],
          [b, b.grams - dir * b.food.profile.portion.step],
        ]);
      }
    }
    if (!melhor) break;
    for (const [i, g] of (melhor as { moves: [Slot, number][] }).moves) i.grams = g;
    total = sum(items);
  }
}

function poolWarnings(pool: readonly CatalogFood[]): string[] {
  const contar = (role: CulinaryRole) => pool.filter((f) => f.profile.role === role).length;
  const avisos: string[] = [];
  const minimos: [CulinaryRole, number, string][] = [
    ["protein", 3, "fontes de proteína"],
    ["starch", 2, "bases para almoço e jantar"],
    ["fruit", 3, "frutas"],
    ["vegetable", 3, "vegetais"],
  ];
  for (const [role, minimo, rotulo] of minimos) {
    const n = contar(role);
    if (n < minimo) {
      avisos.push(
        `Poucas ${rotulo} compatíveis com suas restrições (${n}): o cardápio vai repetir alimentos.`,
      );
    }
  }
  return avisos;
}

const MAIN_SLOTS: readonly MealSlot[] = ["breakfast", "lunch", "dinner"];
const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: "o café da manhã",
  morning_snack: "o lanche da manhã",
  lunch: "o almoço",
  afternoon_snack: "o lanche da tarde",
  pre_workout: "o pré-treino",
  post_workout: "o pós-treino",
  dinner: "o jantar",
  supper: "a ceia",
};

/**
 * O cardápio da semana: sete dias, mesma meta, alimentos variados.
 *
 * Falha (`ok: false`) quando o pool seguro não monta café, almoço ou jantar —
 * nunca remove restrição para conseguir.
 */
export function generateWeeklyPlan(rawInput: WeeklyPlanInput): WeeklyPlanResult {
  const input = weeklyPlanInputSchema.parse(rawInput);
  const targets = input.targets;
  const pool = safePool(input.foods as CatalogFood[], input.restrictions);

  const shares = distributeMeals({
    slots: input.slots,
    wakeMinutes: input.wakeMinutes,
    sleepMinutes: input.sleepMinutes,
    workoutMinutes: input.workoutMinutes,
  });

  const week: WeekState = { foodUse: new Map(), recipeUse: new Map(), previousRecipe: new Map() };
  const days: PlannedDay[] = [];
  const avisos = new Set<string>(poolWarnings(pool));

  for (let day = 0; day < 7; day++) {
    const usedToday = new Set<string>();
    const refeicoes: {
      share: (typeof shares)[number];
      target: Target;
      items: Slot[];
      recipe: MealRecipe | null;
    }[] = [];

    for (const share of shares) {
      const target: Target = {
        kcal: targets.kcal * share.share,
        proteinG: targets.proteinG * share.share,
        carbsG: targets.carbsG * share.share,
        fatG: targets.fatG * share.share,
      };
      const ctx: Context = {
        pool,
        preferred: input.preferred,
        seed: input.seed,
        day,
        slot: share.slot,
        week,
        usedToday,
      };
      const montada = planMeal(target, ctx);
      if (!montada) {
        if (MAIN_SLOTS.includes(share.slot)) {
          return {
            ok: false,
            reason: `Não há alimentos compatíveis com suas restrições para montar ${SLOT_LABEL[share.slot]}. Revise as restrições ou as preferências — nenhuma alergia ou dieta foi ignorada.`,
          };
        }
        refeicoes.push({ share, target, items: [], recipe: null });
        continue;
      }
      for (const i of montada.items) usedToday.add(i.food.profile.key);
      refeicoes.push({ share, target, items: montada.items, recipe: montada.recipe });
    }

    closeDay(refeicoes, targets);

    const meals: PlannedMeal[] = refeicoes.map(({ share, target, items, recipe }) => {
      for (const i of items)
        week.foodUse.set(i.food.profile.key, (week.foodUse.get(i.food.profile.key) ?? 0) + 1);
      if (recipe) {
        week.recipeUse.set(recipe.id, (week.recipeUse.get(recipe.id) ?? 0) + 1);
        week.previousRecipe.set(share.slot, recipe.id);
      }
      const meal: PlannedMeal = {
        slot: share.slot,
        minutes: share.minutes,
        kcalTarget: Math.round(target.kcal),
        proteinTarget: Math.round(target.proteinG),
        carbsTarget: Math.round(target.carbsG),
        fatTarget: Math.round(target.fatG),
        recipeId: recipe?.id ?? null,
        recipeName: recipe?.name ?? null,
        items: items.map((i) => ({
          foodId: i.food.id,
          foodKey: i.food.profile.key,
          name: i.food.name,
          grams: i.grams,
          role: i.food.profile.role,
        })),
        totals: sum(items),
      };
      if (!recipe) {
        meal.issue = `Não foi possível montar ${SLOT_LABEL[share.slot]} com as restrições atuais.`;
        avisos.add(meal.issue);
      }
      return meal;
    });

    const totals = sum(refeicoes.flatMap((r) => r.items));
    days.push({
      weekday: day,
      meals,
      totals,
      kcalDeviation: Math.round(totals.kcal - targets.kcal),
      proteinDeviationG: Math.round(totals.proteinG - targets.proteinG),
      status: toleranceStatus(totals.kcal, targets.kcal),
    });
  }

  // --- Transparência -------------------------------------------------------
  const fora = days.filter((d) => d.status !== "ideal");
  if (fora.length > 0) {
    const pior = fora.reduce((a, b) =>
      Math.abs(b.kcalDeviation) > Math.abs(a.kcalDeviation) ? b : a,
    );
    const dica =
      pior.kcalDeviation < 0 && shares.length < 6
        ? " Para uma meta alta, mais refeições por dia fecham a conta sem porções exageradas."
        : pior.kcalDeviation > 0 && shares.length > 5
          ? " Para uma meta baixa, menos refeições por dia evitam porções mínimas somadas acima da meta."
          : "";
    avisos.add(
      `${fora.length} de 7 dias ficaram fora de ±${KCAL_TOLERANCE.ideal} kcal da meta com porções plausíveis (maior desvio: ${pior.kcalDeviation > 0 ? "+" : ""}${pior.kcalDeviation} kcal). A meta não foi alterada.${dica}`,
    );
  }
  const protMedia = days.reduce((s, d) => s + d.proteinDeviationG, 0) / days.length;
  if (targets.proteinG > 0 && protMedia < -targets.proteinG * 0.1) {
    avisos.add(
      `A proteína ficou em média ${Math.round(-protMedia)} g abaixo da meta com os alimentos disponíveis.`,
    );
  }

  return {
    ok: true,
    plan: {
      rulesVersion: MEAL_PLAN_RULES_VERSION,
      seed: input.seed,
      targets: {
        kcal: targets.kcal,
        proteinG: targets.proteinG,
        carbsG: targets.carbsG,
        fatG: targets.fatG,
      },
      days,
      warnings: [...avisos],
      poolSize: pool.length,
    },
  };
}
