import { z } from "zod";
import { KCAL_PER_G } from "../shared/units";
import { foodRole, foodCandidateSchema, type FoodCandidate, type FoodRole } from "./food-catalog";
import { distributeMeals, mealSlotSchema, type MealSlot, type SlotShare } from "./meal-slots";
// Reusa o tipo de `totals` em vez de declarar um idêntico: dois `MacroTotals`
// com a mesma forma divergiriam na primeira vez que um deles ganhasse um campo.
import { ZERO_TOTALS, type MacroTotals } from "./totals";

/**
 * Gerador de plano alimentar.
 *
 * ## O que ele é
 *
 * Determinístico: as mesmas entradas produzem sempre o mesmo plano. Isso é o
 * que o torna testável e o que permite regerar a dieta offline, sem esperar
 * nem pagar por uma chamada de modelo.
 *
 * ## Como resolve as quantidades
 *
 * Cada refeição tem alvos de kcal e macros. O algoritmo preenche por papel, na
 * ordem em que a restrição é mais dura:
 *
 * 1. **Proteína primeiro.** É o macro com piso rígido (2 g/kg) e a fonte mais
 *    cara em calorias por grama de macro entregue. Deixá-la por último faria
 *    sobrar pouco espaço calórico e o alvo nunca fecharia.
 * 2. **Carboidrato depois**, descontando o que a fonte proteica já trouxe.
 * 3. **Gordura por último**, descontando o resto — é o macro mais fácil de
 *    ajustar em gramas pequenas, então é o melhor amortecedor.
 * 4. **Vegetal ou fruta em porção fixa**, pela fibra e pelos micronutrientes.
 *    Não entra na conta de fechamento: ninguém pesa alface para bater macro.
 *
 * A ordem inversa (gordura primeiro) fecharia calorias com facilidade e erraria
 * a proteína — que é o macro que decide o resultado de quem treina.
 */

/** Limites de porção por papel, em gramas. Impedem prescrições absurdas. */
const PORTION_LIMITS: Record<FoodRole, { min: number; max: number; step: number }> = {
  // 300 g de carne já é uma porção grande; acima disso o plano vira piada.
  protein: { min: 30, max: 300, step: 5 },
  carb: { min: 20, max: 400, step: 5 },
  // Gordura é densa: 60 g de azeite são 530 kcal. O teto é baixo de propósito.
  fat: { min: 5, max: 60, step: 1 },
  produce: { min: 40, max: 250, step: 10 },
};

/**
 * Composição de cada refeição por papel.
 *
 * Pré-treino não leva gordura nem fibra em quantidade — ambas atrasam o
 * esvaziamento gástrico, e treinar com o estômago cheio é desconfortável o
 * suficiente para a pessoa abandonar o plano.
 */
const ARCHETYPES: Record<MealSlot, readonly FoodRole[]> = {
  breakfast: ["carb", "protein", "produce"],
  morning_snack: ["produce", "protein"],
  lunch: ["protein", "carb", "produce", "fat"],
  afternoon_snack: ["protein", "produce"],
  pre_workout: ["carb", "produce"],
  post_workout: ["protein", "carb"],
  dinner: ["protein", "carb", "produce"],
  supper: ["protein", "produce"],
};

/**
 * Ordem de recurso quando o papel pedido não existe no pool.
 *
 * Uma refeição vazia é o pior resultado possível: a pessoa abre a aba, vê
 * "Nada planejado" e conclui que o app não funciona. Entregar um substituto de
 * papel vizinho — uma fruta onde faltou o vegetal, um ovo onde faltou a carne —
 * é sempre melhor que entregar nada, e é o que um nutricionista faria diante de
 * uma despensa limitada.
 */
const ROLE_FALLBACK: Record<FoodRole, readonly FoodRole[]> = {
  protein: ["protein", "carb", "produce", "fat"],
  carb: ["carb", "produce", "protein", "fat"],
  fat: ["fat", "protein", "carb", "produce"],
  produce: ["produce", "carb", "protein", "fat"],
};

export const mealPlanInputSchema = z.object({
  kcalTarget: z.number().positive(),
  proteinTarget: z.number().nonnegative(),
  carbsTarget: z.number().nonnegative(),
  fatTarget: z.number().nonnegative(),
  slots: z.array(mealSlotSchema).min(1),
  foods: z.array(foodCandidateSchema).min(1),
  wakeMinutes: z.number().int().min(0).max(1439).optional(),
  sleepMinutes: z.number().int().min(0).max(1439).optional(),
  workoutMinutes: z.number().int().min(0).max(1439).optional(),
  /**
   * Termos que o usuário gosta. Alimentos cujo nome contém um deles sobem na
   * escolha — não são obrigatórios, porque forçá-los em toda refeição
   * produziria frango sete vezes ao dia.
   */
  preferred: z.array(z.string()).default([]),
  /** Semente da rotação de variedade. Mesma semente, mesmo plano. */
  seed: z.number().int().nonnegative().default(0),
});

export type MealPlanInput = z.input<typeof mealPlanInputSchema>;

export interface PlannedItem {
  foodId: string;
  name: string;
  grams: number;
  role: FoodRole;
}

export interface PlannedMeal {
  slot: MealSlot;
  minutes: number;
  kcalTarget: number;
  proteinTarget: number;
  carbsTarget: number;
  fatTarget: number;
  items: PlannedItem[];
  /** Soma efetiva do que foi prescrito — quase nunca bate o alvo exatamente. */
  totals: MacroTotals;
}

export interface GeneratedMealPlan {
  meals: PlannedMeal[];
  totals: MacroTotals;
  /** Desvios que o usuário merece ver antes de aceitar o plano. */
  warnings: string[];
}

const EMPTY: MacroTotals = ZERO_TOTALS;

function macrosFor(food: FoodCandidate, grams: number): MacroTotals {
  const f = grams / 100;
  return {
    kcal: food.kcal * f,
    proteinG: food.proteinG * f,
    carbsG: food.carbsG * f,
    fatG: food.fatG * f,
    fiberG: food.fiberG * f,
  };
}

const add = (a: MacroTotals, b: MacroTotals): MacroTotals => ({
  kcal: a.kcal + b.kcal,
  proteinG: a.proteinG + b.proteinG,
  carbsG: a.carbsG + b.carbsG,
  fatG: a.fatG + b.fatG,
  fiberG: a.fiberG + b.fiberG,
});

/** Arredonda para o passo do papel — "127,3 g de arroz" não é executável. */
function roundGrams(grams: number, role: FoodRole): number {
  const { min, max, step } = PORTION_LIMITS[role];
  const clamped = Math.max(min, Math.min(max, grams));
  return Math.round(clamped / step) * step;
}

/**
 * Gramas necessárias para entregar `targetG` de um macro.
 *
 * Devolve o teto do papel quando o alimento tem pouco daquele macro — melhor
 * uma porção grande de um alimento fraco que uma prescrição impossível.
 */
function gramsForMacro(macroPer100: number, targetG: number, role: FoodRole): number {
  if (macroPer100 <= 0.1) return PORTION_LIMITS[role].min;
  return roundGrams((targetG / macroPer100) * 100, role);
}

/**
 * Escolhe o alimento de um papel.
 *
 * A rotação por índice é o que dá **variedade sem aleatoriedade**: o plano
 * continua determinístico (mesma semente, mesmo resultado), mas duas refeições
 * do mesmo dia não recebem o mesmo arroz, e dois usuários com o mesmo perfil
 * não recebem cardápios idênticos.
 */
function pickFood(
  pool: readonly FoodCandidate[],
  role: FoodRole,
  used: ReadonlySet<string>,
  preferred: readonly string[],
  rotation: number,
): FoodCandidate | undefined {
  const candidatos = pool
    .filter((f) => foodRole(f) === role)
    .map((f) => {
      let score = f.popularity;
      const nome = f.name.toLowerCase();
      if (preferred.some((p) => p && nome.includes(p.toLowerCase()))) score += 60;
      // Penalidade, não exclusão: com um pool pequeno, excluir o já usado
      // deixaria a refeição vazia.
      if (used.has(f.id)) score -= 45;
      return { food: f, score };
    })
    .sort((a, b) => b.score - a.score || a.food.id.localeCompare(b.food.id));

  if (candidatos.length === 0) return undefined;

  // Rotaciona dentro dos melhores, não do pool inteiro: variedade sem cair
  // para o fundo do catálogo.
  const janela = Math.min(candidatos.length, 6);
  return candidatos[rotation % janela]?.food;
}

/**
 * O alimento do papel pedido — ou o melhor substituto disponível.
 *
 * Devolve também o papel efetivamente entregue, porque é ele que decide como a
 * quantidade será calculada: uma fruta escolhida no lugar de um vegetal entra
 * por porção, não por fechamento de macro.
 */
function pickWithFallback(
  pool: readonly FoodCandidate[],
  role: FoodRole,
  used: ReadonlySet<string>,
  preferred: readonly string[],
  rotation: number,
): { food: FoodCandidate; role: FoodRole } | undefined {
  for (const candidato of ROLE_FALLBACK[role]) {
    const food = pickFood(pool, candidato, used, preferred, rotation);
    if (food) return { food, role: candidato };
  }
  return undefined;
}

export function generateMealPlan(rawInput: MealPlanInput): GeneratedMealPlan {
  const input = mealPlanInputSchema.parse(rawInput);

  const shares: SlotShare[] = distributeMeals({
    slots: input.slots,
    ...(input.wakeMinutes !== undefined ? { wakeMinutes: input.wakeMinutes } : {}),
    ...(input.sleepMinutes !== undefined ? { sleepMinutes: input.sleepMinutes } : {}),
    ...(input.workoutMinutes !== undefined ? { workoutMinutes: input.workoutMinutes } : {}),
  });

  const used = new Set<string>();
  const meals: PlannedMeal[] = [];
  const warnings: string[] = [];
  let rotation = input.seed;

  for (const { slot, share, minutes } of shares) {
    const kcalTarget = input.kcalTarget * share;
    const proteinTarget = input.proteinTarget * share;
    const carbsTarget = input.carbsTarget * share;
    const fatTarget = input.fatTarget * share;

    const roles = ARCHETYPES[slot];
    const items: PlannedItem[] = [];
    let totals = EMPTY;

    for (const pedido of roles) {
      const escolha = pickWithFallback(input.foods, pedido, used, input.preferred, rotation++);
      if (!escolha) continue;
      const { food, role } = escolha;

      // Um papel só entra uma vez por refeição: se o vegetal virou fruta e a
      // fruta já está no prato, repetir a mesma banana não acrescenta nada.
      if (items.some((i) => i.role === role && i.foodId === food.id)) continue;

      let grams: number;
      if (role === "protein") {
        grams = gramsForMacro(food.proteinG, proteinTarget, role);
      } else if (role === "carb") {
        grams = gramsForMacro(food.carbsG, Math.max(0, carbsTarget - totals.carbsG), role);
      } else if (role === "fat") {
        grams = gramsForMacro(food.fatG, Math.max(0, fatTarget - totals.fatG), role);
      } else {
        // Vegetais e frutas entram por porção, não por cálculo: a contribuição
        // deles é fibra e micronutriente, e pesar alface para fechar macro é o
        // tipo de exigência que faz a pessoa desistir da dieta na segunda semana.
        grams = roundGrams(kcalTarget * 0.08, role);
      }

      const macros = macrosFor(food, grams);
      items.push({ foodId: food.id, name: food.name, grams, role });
      totals = add(totals, macros);
      used.add(food.id);
    }

    // Rede final: com o pool não vazio (o schema garante), sempre há algo a
    // prescrever. Uma refeição vazia na tela é uma falha do app, nunca uma
    // decisão nutricional — e é justamente o que o usuário vê quando o
    // catálogo chega estreito demais.
    if (items.length === 0) {
      const emergencia = input.foods[rotation++ % input.foods.length]!;
      const role = foodRole(emergencia);
      const grams = roundGrams((kcalTarget * 0.9) / Math.max(0.2, emergencia.kcal / 100), role);
      items.push({ foodId: emergencia.id, name: emergencia.name, grams, role });
      totals = add(totals, macrosFor(emergencia, grams));
      used.add(emergencia.id);
    }

    meals.push({
      slot,
      minutes,
      kcalTarget: Math.round(kcalTarget),
      proteinTarget: Math.round(proteinTarget),
      carbsTarget: Math.round(carbsTarget),
      fatTarget: Math.round(fatTarget),
      items,
      totals,
    });
  }

  const totals = meals.reduce((acc, m) => add(acc, m.totals), EMPTY);

  // --- Avisos ---------------------------------------------------------------
  // O plano é uma aproximação; esconder o quanto ele erra seria vender precisão
  // que não existe. O limiar de 12% é o ponto em que o desvio deixa de ser
  // ruído de arredondamento de porção e passa a mudar o resultado.
  const desvio = (real: number, alvo: number) => (alvo > 0 ? (real - alvo) / alvo : 0);

  const dKcal = desvio(totals.kcal, input.kcalTarget);
  if (Math.abs(dKcal) > 0.12) {
    warnings.push(
      `As calorias do plano ficaram ${dKcal > 0 ? "acima" : "abaixo"} da meta em ${Math.abs(Math.round(dKcal * 100))}%.`,
    );
  }

  const dProt = desvio(totals.proteinG, input.proteinTarget);
  if (dProt < -0.12) {
    warnings.push(
      `A proteína ficou ${Math.abs(Math.round(dProt * 100))}% abaixo da meta — aumente as porções das fontes proteicas ou adicione uma refeição.`,
    );
  }

  if (input.foods.length < 12) {
    warnings.push(
      "Poucos alimentos disponíveis para montar o plano: ele vai repetir opções. Amplie as preferências ou revise as restrições.",
    );
  }

  return { meals, totals, warnings };
}

/**
 * Reparte as calorias-alvo em macros quando só se conhece o total.
 *
 * Espelha `macroTargets`, mas partindo de gramas de proteína já decididos —
 * usado quando o plano é editado à mão e a proteína vira restrição fixa.
 */
export function macrosFromKcal(kcal: number, proteinG: number, fatPct = 0.25): MacroTotals {
  const fatG = (kcal * fatPct) / KCAL_PER_G.fat;
  const restante = Math.max(0, kcal - proteinG * KCAL_PER_G.protein - fatG * KCAL_PER_G.fat);
  return {
    kcal,
    proteinG,
    fatG: Math.round(fatG),
    carbsG: Math.round(restante / KCAL_PER_G.carbs),
    fiberG: Math.round((kcal / 1000) * 14),
  };
}
