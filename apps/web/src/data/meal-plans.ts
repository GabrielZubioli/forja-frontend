import { supabase } from "@/integrations/supabase/client";
import { assertOk, num, unwrap, unwrapList, unwrapMaybe } from "@/data/supabase-helpers";
import { ensureFoodCatalog } from "@/data/local-catalog";
import { loadPlanningInputs } from "@/data/planning-profile";
import { todayISO } from "@/lib/date";
import {
  distributeMeals,
  generateMealPlan,
  minutesToTime,
  selectMealSlots,
  timeToMinutes,
  MEAL_SLOTS,
  type FoodCandidate,
  type GeneratedMealPlan,
  type MealSlot,
} from "@forja/domain";

/**
 * Plano alimentar — geração, leitura e materialização do dia.
 *
 * A regra de programação nutricional vive em `@forja/domain` (pura, testada);
 * aqui fica o que depende do banco: escolher o pool de alimentos respeitando
 * restrições, gravar o plano e transformar o plano em um dia executável.
 */

/**
 * Alimentos que servem de base para montar a dieta.
 *
 * O filtro por `is_staple` é o que separa "registrável" de "prescritível": o
 * catálogo tem refrigerante e torresmo, e ambos existem para serem registrados
 * quando a pessoa os come — não para o app recomendá-los.
 */
export async function fetchStapleFoods(limit = 400): Promise<FoodCandidate[]> {
  const staples = await queryFoods(limit, true);
  if (staples.length >= MIN_POOL) return staples;

  // `is_staple` nasce `false` e é ligado por uma migration de dados. Onde ela
  // não rodou, o filtro devolve zero alimentos e o gerador não tem o que
  // prescrever — o usuário recebe um cardápio de caixas vazias sem nenhuma
  // pista do motivo. Cair para o catálogo inteiro entrega uma dieta um pouco
  // menos curada em vez de nenhuma; a curadoria volta assim que a coluna for
  // preenchida.
  const todos = await queryFoods(limit, false);
  return todos.length > staples.length ? todos : staples;
}

/** Abaixo disto o pool não compõe um dia com variedade mínima. */
const MIN_POOL = 12;

async function queryFoods(limit: number, apenasBase: boolean): Promise<FoodCandidate[]> {
  const consulta = supabase
    .from("foods")
    .select("id, name, category, kcal, protein_g, carbs_g, fat_g, fiber_g, popularity")
    .is("deleted_at", null)
    // Um alimento sem calorias declaradas (creatina, água, tempero) não compõe
    // refeição — entra no diário, nunca na prescrição.
    .gt("kcal", 0)
    .order("popularity", { ascending: false })
    .limit(limit);

  const rows = unwrapList(
    "carregar alimentos base",
    await (apenasBase ? consulta.eq("is_staple", true) : consulta),
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: (r.category ?? "other") as FoodCandidate["category"],
    kcal: num(r.kcal),
    proteinG: num(r.protein_g),
    carbsG: num(r.carbs_g),
    fatG: num(r.fat_g),
    fiberG: num(r.fiber_g),
    popularity: num(r.popularity, 50),
  }));
}

/**
 * Termos que cada restrição exclui do pool.
 *
 * Correspondência por nome, não por uma tabela de ingredientes que o catálogo
 * não tem. É deliberadamente **abrangente demais** em vez de precisa: incluir
 * um alimento seguro a menos custa variedade; incluir um alimento com o
 * alérgeno custa uma reação. Numa escolha entre esses dois erros, só um é
 * aceitável.
 */
const EXCLUSION_TERMS: Record<string, string[]> = {
  // Dietas
  vegetarian: [
    "carne",
    "frango",
    "peixe",
    "boi",
    "porco",
    "peru",
    "bacon",
    "presunto",
    "linguiça",
    "camarão",
    "atum",
    "salmão",
    "tilápia",
    "bacalhau",
    "sardinha",
    "file",
    "filé",
    "costela",
    "picanha",
    "patinho",
    "alcatra",
    "coxão",
    "músculo",
    "fígado",
    "coração",
    "moela",
    "lombo",
    "pernil",
    "cupim",
    "maminha",
    "fraldinha",
    "acém",
    "peito de",
    "asa",
    "sobrecoxa",
    "carneiro",
    "cabrito",
    "codorna",
    "caranguejo",
    "lula",
    "polvo",
    "mexilhão",
    "ostra",
    "siri",
    "lagosta",
    "pescada",
    "corvina",
    "abadejo",
    "cação",
    "manjuba",
    "lambari",
    "tucunaré",
    "traíra",
    "pintado",
    "dourada",
    "merluza",
    "namorado",
    "badejo",
    "robalo",
    "tainha",
    "anchova",
  ],
  vegan: [
    "leite",
    "queijo",
    "iogurte",
    "manteiga",
    "requeijão",
    "creme de leite",
    "ovo",
    "mel",
    "whey",
    "caseína",
    "coalhada",
    "ricota",
    "mussarela",
    "parmesão",
    "prato",
    "minas",
    "cottage",
    "nata",
    "chantilly",
    "leite condensado",
    "doce de leite",
  ],
  lactose_free: [
    "leite",
    "queijo",
    "iogurte",
    "manteiga",
    "requeijão",
    "creme de leite",
    "coalhada",
    "ricota",
    "mussarela",
    "parmesão",
    "cottage",
    "nata",
    "leite condensado",
    "doce de leite",
    "whey",
  ],
  gluten_free: [
    "trigo",
    "pão",
    "macarrão",
    "massa",
    "biscoito",
    "bolacha",
    "bolo",
    "cerveja",
    "cevada",
    "centeio",
    "aveia",
    "farinha de rosca",
    "torrada",
    "panetone",
    "pizza",
    "lasanha",
    "nhoque",
    "cuscuz marroquino",
    "seitan",
  ],
  low_carb: [
    "arroz",
    "macarrão",
    "pão",
    "batata",
    "mandioca",
    "farinha",
    "açúcar",
    "biscoito",
    "bolo",
    "tapioca",
    "cuscuz",
    "polenta",
    "inhame",
    "cará",
  ],

  // Alérgenos
  lactose: [
    "leite",
    "queijo",
    "iogurte",
    "manteiga",
    "requeijão",
    "creme de leite",
    "coalhada",
    "ricota",
    "mussarela",
    "parmesão",
    "cottage",
    "nata",
    "whey",
  ],
  gluten: [
    "trigo",
    "pão",
    "macarrão",
    "massa",
    "biscoito",
    "bolacha",
    "bolo",
    "cevada",
    "centeio",
    "aveia",
    "torrada",
  ],
  egg: ["ovo", "omelete", "clara", "gema", "maionese"],
  peanut: ["amendoim", "paçoca", "pé de moleque"],
  nuts: ["castanha", "noz", "nozes", "amêndoa", "avelã", "pistache", "macadâmia", "pecã"],
  seafood: [
    "camarão",
    "lagosta",
    "caranguejo",
    "siri",
    "lula",
    "polvo",
    "mexilhão",
    "ostra",
    "marisco",
    "vieira",
  ],
  fish: [
    "peixe",
    "atum",
    "salmão",
    "sardinha",
    "tilápia",
    "bacalhau",
    "merluza",
    "pescada",
    "corvina",
    "abadejo",
    "cação",
    "manjuba",
    "lambari",
    "anchova",
    "traíra",
    "tucunaré",
    "pintado",
    "dourada",
    "namorado",
    "badejo",
    "robalo",
    "tainha",
  ],
  soy: ["soja", "tofu", "shoyu", "missô", "edamame"],
};

export interface DietPreferences {
  diets: readonly string[];
  allergies: readonly string[];
  dislikedFoods: readonly string[];
  likedFoods: readonly string[];
}

/**
 * Aplica restrições ao pool de alimentos.
 *
 * Alergia e dieta **excluem**; "não gosto" também exclui da geração, mas o
 * alimento continua no catálogo para busca manual — a pessoa pode não gostar de
 * brócolis e ainda assim querer registrar o que comeu na casa da mãe.
 */
export function applyDietaryFilters(
  foods: readonly FoodCandidate[],
  prefs: DietPreferences,
): FoodCandidate[] {
  const termos = new Set<string>();

  for (const key of [...prefs.diets, ...prefs.allergies]) {
    for (const t of EXCLUSION_TERMS[key] ?? []) termos.add(t.toLowerCase());
  }
  for (const f of prefs.dislikedFoods) {
    const t = f.trim().toLowerCase();
    if (t.length >= 3) termos.add(t);
  }

  if (termos.size === 0) return [...foods];

  return foods.filter((f) => {
    const nome = f.name.toLowerCase();
    return ![...termos].some((t) => nome.includes(t));
  });
}

/**
 * O pool efetivo, afrouxando **só** o que é preferência.
 *
 * Alergia e dieta são regra dura: se elas esvaziam o pool, o certo é falhar —
 * um plano que viola uma alergia é pior que nenhum plano. "Não gosto de X" é
 * outra coisa: quando as implicâncias somadas não deixam nada de pé, ignorá-las
 * e avisar é melhor que entregar um cardápio vazio, porque a pessoa consegue
 * trocar o que não quiser item a item.
 */
function poolFor(foods: readonly FoodCandidate[], prefs: DietPreferences): FoodCandidate[] {
  const completo = applyDietaryFilters(foods, prefs);
  if (completo.length >= MIN_POOL) return completo;

  const semImplicancias = applyDietaryFilters(foods, { ...prefs, dislikedFoods: [] });
  return semImplicancias.length > completo.length ? semImplicancias : completo;
}

export interface CreateMealPlanInput {
  userId: string;
  name: string;
  kcalTarget: number;
  proteinTarget: number;
  carbsTarget: number;
  fatTarget: number;
  fiberTarget: number;
  mealsPerDay: number;
  wakeTime?: string | undefined;
  sleepTime?: string | undefined;
  workoutTime?: string | undefined;
  preferences: DietPreferences;
}

export interface MealPlanDraft {
  plan: GeneratedMealPlan;
  /**
   * Um cardápio por dia da semana (índice = dia, 0 = domingo). Mesmas
   * refeições e metas; os alimentos variam pela semente do gerador.
   */
  porDia: GeneratedMealPlan[];
  slots: MealSlot[];
  /** Quantos alimentos sobraram no pool após as restrições. */
  poolSize: number;
}

/** Monta o plano **sem gravar** — permite mostrar a prévia antes de criar 40 linhas. */
export async function buildMealPlanDraft(input: CreateMealPlanInput): Promise<MealPlanDraft> {
  const todos = await fetchStapleFoods();
  const pool = poolFor(todos, input.preferences);

  const workoutMinutes = timeToMinutes(input.workoutTime);
  const slots = selectMealSlots({
    mealsPerDay: input.mealsPerDay,
    ...(workoutMinutes !== undefined ? { workoutMinutes } : {}),
  });

  const gerar = (seed: number) =>
    generateMealPlan({
    seed,
    kcalTarget: input.kcalTarget,
    proteinTarget: input.proteinTarget,
    carbsTarget: input.carbsTarget,
    fatTarget: input.fatTarget,
    slots,
    // O gerador exige pool não vazio. Se as restrições zeraram tudo, voltar ao
    // catálogo completo produziria um plano que viola uma alergia — falhar aqui
    // é o comportamento correto.
    foods: pool,
    preferred: [...input.preferences.likedFoods],
    ...(timeToMinutes(input.wakeTime) !== undefined
      ? { wakeMinutes: timeToMinutes(input.wakeTime)! }
      : {}),
    ...(timeToMinutes(input.sleepTime) !== undefined
      ? { sleepMinutes: timeToMinutes(input.sleepTime)! }
      : {}),
    ...(workoutMinutes !== undefined ? { workoutMinutes } : {}),
  });

  // Cada dia da semana com sua semente: a rotação muda as escolhas entre os
  // melhores candidatos, e a semana não repete o mesmo prato todo dia.
  const porDia = [0, 1, 2, 3, 4, 5, 6].map((dia) => gerar(dia * 5));
  return { plan: porDia[1]!, porDia, slots, poolSize: pool.length };
}

/** Grava o plano: desativa o anterior, cria refeições e itens. */
export async function createMealPlan(
  input: CreateMealPlanInput,
  draft: MealPlanDraft,
): Promise<string> {
  assertOk(
    "arquivar plano alimentar anterior",
    await supabase
      .from("meal_plans")
      .update({ is_active: false })
      .eq("user_id", input.userId)
      .eq("is_active", true),
  );

  const plan = unwrap(
    "criar plano alimentar",
    await supabase
      .from("meal_plans")
      .insert({
        user_id: input.userId,
        name: input.name,
        source: "generated",
        kcal_target: Math.round(input.kcalTarget),
        protein_g_target: Math.round(input.proteinTarget),
        carbs_g_target: Math.round(input.carbsTarget),
        fat_g_target: Math.round(input.fatTarget),
        fiber_g_target: Math.round(input.fiberTarget),
        is_active: true,
      })
      .select("id")
      .single(),
  );

  // Falha no meio deixaria o usuário com um plano pela metade — pior que
  // nenhum, porque parece completo.
  try {
    for (const [index, meal] of draft.plan.meals.entries()) {
      const row = unwrap(
        "criar refeição do plano",
        await supabase
          .from("meal_plan_meals")
          .insert({
            plan_id: plan.id,
            slot: meal.slot,
            position: index,
            target_time: minutesToTime(meal.minutes),
            kcal_target: Math.round(meal.kcalTarget),
            protein_g_target: Math.round(meal.proteinTarget),
            carbs_g_target: Math.round(meal.carbsTarget),
            fat_g_target: Math.round(meal.fatTarget),
          })
          .select("id")
          .single(),
      );

      // Os itens de cada dia da semana, com o dia marcado.
      const itens = draft.porDia.flatMap((planoDoDia, dia) =>
        (planoDoDia.meals[index]?.items ?? []).map((item, position) => ({
          meal_id: row.id,
          food_id: item.foodId,
          grams: item.grams,
          position,
          weekday: dia,
        })),
      );
      if (itens.length === 0) continue;

      assertOk("adicionar alimentos à refeição", await supabase.from("meal_plan_items").insert(itens));
    }

    // Espelha as refeições ativas no perfil do usuário, para a UI saber quais
    // caixas mostrar mesmo quando o plano é desativado depois.
    assertOk(
      "salvar refeições do usuário",
      await supabase.from("user_meal_slots").upsert(
        draft.plan.meals.map((meal, position) => ({
          user_id: input.userId,
          slot: meal.slot,
          position,
          target_time: minutesToTime(meal.minutes),
          is_active: true,
        })),
        { onConflict: "user_id,slot" },
      ),
    );
  } catch (error) {
    await supabase.from("meal_plans").delete().eq("id", plan.id);
    throw error;
  }

  return plan.id;
}

export interface ActiveMealPlan {
  id: string;
  name: string;
  kcalTarget: number;
  proteinTarget: number;
  carbsTarget: number;
  fatTarget: number;
  fiberTarget: number;
  meals: {
    id: string;
    slot: MealSlot;
    position: number;
    /** Nome dado pela pessoa; `null` = o nome padrão do horário. */
    label: string | null;
    targetTime: string | null;
    kcalTarget: number;
    items: {
      id: string;
      foodId: string;
      name: string;
      grams: number;
      position: number;
      prepNotes: string | null;
      /** Dia da semana em que vale (0 = domingo); null = todos os dias. */
      weekday: number | null;
      food: {
        servingSizeG: number;
        kcal: number;
        proteinG: number;
        carbsG: number;
        fatG: number;
        fiberG: number;
        category: string | null;
      };
    }[];
  }[];
}

/**
 * O plano alimentar ativo, **existindo**.
 *
 * Esta é a função que a tela de Dieta chama. Ela responde por uma promessa que
 * o app faz e não vinha cumprindo: depois do questionário, a aba Alimentação
 * nunca está vazia.
 *
 * ## Por que consertar em vez de só avisar
 *
 * A geração inicial roda uma vez, logo após o cadastro, e falha de formas que o
 * usuário não tem como corrigir: o catálogo de alimentos ainda não foi semeado,
 * a conexão caiu no meio, uma restrição zerou o pool. O resultado era um plano
 * "ativo" com oito refeições e nenhum alimento — e nenhum caminho de volta, já
 * que o rascunho do questionário havia sido apagado.
 *
 * Agora as respostas ficam no banco (`onboarding_answers`), então dá para
 * refazer o plano sem pedir nada ao usuário. Um plano vazio deixa de ser um
 * estado final e vira uma condição temporária que o app resolve sozinho.
 *
 * ## Idempotência
 *
 * Um plano saudável é devolvido como está. Só um plano ausente ou vazio dispara
 * a regeneração — abrir a tela dez vezes não cria dez planos.
 */
export async function ensureActiveMealPlan(
  userId: string,
  options: { force?: boolean } = {},
): Promise<ActiveMealPlan | null> {
  const atual = await fetchActiveMealPlan();
  if (!options.force && atual && planoUtilizavel(atual)) {
    return (await corrigirHorarios(userId, atual)) ? fetchActiveMealPlan() : atual;
  }

  // Sem catálogo não há o que prescrever: semeia a base local antes de tentar.
  await ensureFoodCatalog(userId);

  const { answers, targets, objectiveLabel, workoutTime } = await loadPlanningInputs(userId);

  const input: CreateMealPlanInput = {
    userId,
    name: `Cardápio · ${objectiveLabel}`,
    kcalTarget: targets.kcal,
    proteinTarget: targets.proteinG,
    carbsTarget: targets.carbsG,
    fatTarget: targets.fatG,
    fiberTarget: targets.fiberG,
    mealsPerDay: answers.mealsPerDay ?? MEAL_SLOTS.length,
    wakeTime: answers.wakeTime,
    sleepTime: answers.sleepTime,
    workoutTime,
    preferences: {
      diets: answers.diets,
      allergies: answers.allergies,
      dislikedFoods: answers.dislikedFoods,
      likedFoods: answers.likedFoods,
    },
  };

  const draft = await buildMealPlanDraft(input);
  await createMealPlan(input, draft);

  // Os dias já visitados foram montados a partir do plano quebrado — e um dia
  // registrado impede a remontagem. Apagar o registro **dos dias que ficaram
  // sem nenhum item** devolve a eles a chance de nascer do plano novo, sem
  // tocar em nada que o usuário tenha marcado.
  await limparDiasVazios(userId);

  return fetchActiveMealPlan();
}

/**
 * Planos criados antes da correção da distribuição tinham as refeições
 * espremidas (7:00, 7:21, 7:33…) — quem dormia depois da meia-noite ganhava
 * uma janela de 1 h. Se duas refeições seguidas estão a menos de 1 h, os
 * horários são recalculados pela regra nova, com a rotina da pessoa.
 */
async function corrigirHorarios(userId: string, plano: ActiveMealPlan): Promise<boolean> {
  const comHora = plano.meals
    .map((m) => ({ m, min: timeToMinutes(m.targetTime) }))
    .filter((x): x is { m: (typeof plano.meals)[number]; min: number } => x.min !== undefined)
    .sort((a, b) => a.min - b.min);
  const espremido = comHora.some((x, i) => i > 0 && x.min - comHora[i - 1]!.min < 60);
  if (!espremido) return false;

  const { answers, workoutTime } = await loadPlanningInputs(userId);
  const novos = distributeMeals({
    slots: plano.meals.map((m) => m.slot),
    wakeMinutes: timeToMinutes(answers.wakeTime),
    sleepMinutes: timeToMinutes(answers.sleepTime),
    workoutMinutes: timeToMinutes(workoutTime),
  });
  for (const n of novos) {
    const meal = plano.meals.find((m) => m.slot === n.slot);
    if (!meal) continue;
    assertOk(
      "ajustar horário da refeição",
      await supabase
        .from("meal_plan_meals")
        .update({ target_time: minutesToTime(n.minutes) })
        .eq("id", meal.id),
    );
  }
  return true;
}

/** Um plano vale se a maioria das refeições tem alimento. */
function planoUtilizavel(plan: ActiveMealPlan): boolean {
  if (plan.meals.length === 0) return false;
  const comItens = plan.meals.filter((m) => m.items.length > 0).length;
  return comItens >= Math.ceil(plan.meals.length / 2);
}

async function limparDiasVazios(userId: string): Promise<void> {
  const hoje = todayISO();

  const dias = unwrapList(
    "listar dias do diário",
    await supabase.from("diet_days").select("log_date").eq("user_id", userId).gte("log_date", hoje),
  );
  if (dias.length === 0) return;

  const comItens = new Set(
    unwrapList(
      "verificar itens dos dias",
      await supabase
        .from("food_log_entries")
        .select("log_date")
        .eq("user_id", userId)
        .gte("log_date", hoje),
    ).map((r) => r.log_date),
  );

  const vazios = dias.map((d) => d.log_date).filter((d) => !comItens.has(d));
  if (vazios.length === 0) return;

  assertOk(
    "liberar dias vazios do diário",
    await supabase.from("diet_days").delete().eq("user_id", userId).in("log_date", vazios),
  );
}

export async function fetchActiveMealPlan(): Promise<ActiveMealPlan | null> {
  const plan = unwrapMaybe(
    "carregar plano alimentar",
    await supabase
      .from("meal_plans")
      .select(
        "id, name, kcal_target, protein_g_target, carbs_g_target, fat_g_target, fiber_g_target",
      )
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle(),
  );

  if (!plan) return null;

  const meals = unwrapList(
    "carregar refeições do plano",
    await supabase
      .from("meal_plan_meals")
      .select(
        "id, slot, position, label, target_time, kcal_target, meal_plan_items(id, food_id, grams, position, prep_notes, weekday, foods(name, serving_size_g, kcal, protein_g, carbs_g, fat_g, fiber_g, category))",
      )
      .eq("plan_id", plan.id)
      .order("position"),
  );

  return {
    id: plan.id,
    name: plan.name,
    kcalTarget: num(plan.kcal_target),
    proteinTarget: num(plan.protein_g_target),
    carbsTarget: num(plan.carbs_g_target),
    fatTarget: num(plan.fat_g_target),
    fiberTarget: num(plan.fiber_g_target),
    meals: meals.map((m) => ({
      id: m.id,
      slot: m.slot as MealSlot,
      position: m.position,
      label: m.label,
      targetTime: m.target_time,
      kcalTarget: num(m.kcal_target),
      items: (m.meal_plan_items ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((i) => ({
          id: i.id,
          foodId: i.food_id,
          name: i.foods?.name ?? "Alimento",
          grams: num(i.grams),
          position: i.position,
          prepNotes: i.prep_notes,
          weekday: i.weekday,
          food: {
            servingSizeG: num(i.foods?.serving_size_g, 100),
            kcal: num(i.foods?.kcal),
            proteinG: num(i.foods?.protein_g),
            carbsG: num(i.foods?.carbs_g),
            fatG: num(i.foods?.fat_g),
            fiberG: num(i.foods?.fiber_g),
            category: i.foods?.category ?? null,
          },
        })),
    })),
  };
}

/**
 * Renomeia uma refeição do plano ativo ("Lanche da tarde" → "Shake pós-aula").
 * Nome vazio volta ao padrão. Refeição que ainda não existe no plano (as que
 * aparecem quando a pessoa aumenta as refeições do dia) é criada vazia.
 */
export async function setMealLabel(
  planId: string,
  slot: MealSlot,
  label: string,
  position: number,
): Promise<void> {
  const nome = label.trim() || null;
  const existente = unwrapMaybe(
    "buscar refeição",
    await supabase
      .from("meal_plan_meals")
      .select("id")
      .eq("plan_id", planId)
      .eq("slot", slot)
      .maybeSingle(),
  );
  if (existente) {
    assertOk(
      "renomear refeição",
      await supabase.from("meal_plan_meals").update({ label: nome }).eq("id", existente.id),
    );
    return;
  }
  assertOk(
    "criar refeição",
    await supabase.from("meal_plan_meals").insert({ plan_id: planId, slot, position, label: nome }),
  );
}

/** Muda o horário de uma refeição do plano ativo (cria a refeição se ainda não existe). */
export async function setMealTime(
  planId: string,
  slot: MealSlot,
  time: string,
  position: number,
): Promise<void> {
  const existente = unwrapMaybe(
    "buscar refeição",
    await supabase
      .from("meal_plan_meals")
      .select("id")
      .eq("plan_id", planId)
      .eq("slot", slot)
      .maybeSingle(),
  );
  if (existente) {
    assertOk(
      "mudar horário da refeição",
      await supabase.from("meal_plan_meals").update({ target_time: time }).eq("id", existente.id),
    );
    return;
  }
  assertOk(
    "criar refeição",
    await supabase.from("meal_plan_meals").insert({ plan_id: planId, slot, position, target_time: time }),
  );
}
