import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  Clock,
  CopyPlus,
  Minus,
  MoreVertical,
  Pencil,
  Plus,
  Repeat,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/data/query-keys";
import { assertOk, errorMessage, num, unwrapMaybe } from "@/data/supabase-helpers";
import {
  ensureDayMaterialized,
  fetchDayEntries,
  recordSubstitutionPreference,
  setConsumed,
  setEntryGrams,
  setMealConsumed,
  substituteEntry,
  type DayEntry,
} from "@/data/diet-day";
import { ensureActiveMealPlan, setMealLabel } from "@/data/meal-plans";
import { addRecipeToMeal, type RecipeSummary } from "@/data/recipes";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useCurrentUserId } from "@/hooks/use-current-user";
import { PageBody, PageHeader } from "@/components/page-header";
import { DatePicker } from "@/components/date-picker";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ErrorState } from "@/components/query-boundary";
import { FoodPicker } from "@/components/pickers/food-picker";
import { SubstituteFoodDialog } from "@/components/diet/substitute-food-dialog";
import { CalorieRing, MACRO_COLORS, MacroRing } from "@/components/home/macro-rings";
import { MEALS, MEAL_LABELS, label, type MealValue } from "@/lib/labels";
import { fromISODate, toISODate, todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";
import { addDays } from "date-fns";
import { nutritionTotals, portionMacros, type FoodCandidate } from "@forja/domain";

/**
 * O diário alimentar — agora um **plano executável**, não um registro.
 *
 * ## A inversão
 *
 * Antes, a tela perguntava "o que você comeu?" e esperava a pessoa saber a
 * resposta — que é exatamente o que ela não sabe, e o motivo de ter baixado o
 * app. Agora ela diz o que comer, em oito refeições, e a pessoa marca o que
 * consumiu. É a diferença entre um caderno e um plano.
 *
 * O dia é materializado do plano na primeira abertura (ver `diet-day.ts`), o
 * que torna cada item uma linha real: marcável, editável e substituível sem
 * afetar os outros dias nem o plano.
 *
 * ## Consumido × planejado
 *
 * Os anéis contam apenas o que foi **marcado como consumido**. Somar o
 * planejado mostraria a meta batida antes do café da manhã, que é o oposto de
 * acompanhar. O total planejado aparece separado, como referência.
 */
export const Route = createFileRoute("/_authenticated/diet")({
  head: () => ({
    meta: [
      { title: "Dieta — Habitual Fit" },
      { name: "description", content: "Seu cardápio do dia, com substituições inteligentes." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DietPage,
});

/** Ordem em que refeições extras aparecem quando a pessoa aumenta as do dia. */
const PRIORIDADE_REFEICOES: MealValue[] = [
  "breakfast",
  "lunch",
  "dinner",
  "afternoon_snack",
  "morning_snack",
  "supper",
  "pre_workout",
  "post_workout",
];

function DietPage() {
  const qc = useQueryClient();
  const userId = useCurrentUserId();
  const hoje = todayISO();
  const [date, setDate] = useState(hoje);

  const profile = useQuery({
    queryKey: queryKeys.profile(),
    queryFn: async () =>
      unwrapMaybe("carregar perfil", await supabase.from("profiles").select("*").maybeSingle()),
  });

  /**
   * O plano ativo — criado na hora se não existir ou se vier vazio.
   *
   * Era aqui que o app quebrava a promessa que faz no questionário. A geração
   * inicial podia falhar (catálogo de alimentos ausente, restrição que zerava o
   * pool, conexão caindo no meio) e o resultado era esta tela com oito caixas
   * escritas "Nada planejado" — sem erro, sem explicação e sem saída, porque o
   * rascunho do questionário já tinha sido apagado.
   *
   * `ensureActiveMealPlan` devolve o plano saudável que existir e só regenera
   * quando não há nada utilizável, usando as respostas guardadas no banco.
   */
  const plan = useQuery({
    queryKey: queryKeys.diet.activePlan(),
    queryFn: () => ensureActiveMealPlan(userId),
  });

  const entries = useQuery({
    queryKey: queryKeys.diet.log(date),
    // Só materializa depois de o plano existir: a ordem inversa gravaria um dia
    // vazio e o registro em `diet_days` impediria a remontagem.
    enabled: !plan.isPending,
    queryFn: async () => {
      await ensureDayMaterialized(userId, date, hoje);
      return fetchDayEntries(date);
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.diet.log(date) });

  const rows = entries.data ?? [];
  const consumidos = rows.filter((e) => e.consumed);

  const toPortion = (e: DayEntry) => ({
    food: {
      servingSizeG: e.food.servingSizeG,
      kcal: e.food.kcal,
      proteinG: e.food.proteinG,
      carbsG: e.food.carbsG,
      fatG: e.food.fatG,
      fiberG: e.food.fiberG,
    },
    grams: e.grams,
    servings: 1,
  });

  const totaisConsumidos = nutritionTotals(consumidos.map(toPortion));
  const totaisPlanejados = nutritionTotals(rows.map(toPortion));

  const addEntry = useMutation({
    mutationFn: async (params: { foodId: string; grams: number; slot: MealValue }) => {
      assertOk(
        "adicionar ao diário",
        await supabase.from("food_log_entries").insert({
          user_id: userId,
          food_id: params.foodId,
          meal_slot: params.slot,
          log_date: date,
          grams: params.grams,
          servings: 1,
          // Item adicionado à mão já nasce consumido: quem o registra está
          // relatando o que comeu, não planejando.
          consumed: true,
          consumed_at: new Date().toISOString(),
          source: "manual",
        }),
      );
    },
    onSuccess: () => {
      toast.success("Adicionado");
      void invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      assertOk("remover item", await supabase.from("food_log_entries").delete().eq("id", id));
    },
    onSuccess: () => {
      toast.success("Item removido");
      void invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const copyPreviousDay = useMutation({
    mutationFn: async () => {
      const anterior = toISODate(addDays(fromISODate(date), -1));
      const itens = await fetchDayEntries(anterior);
      if (itens.length === 0) throw new Error("Não há nada registrado no dia anterior.");

      assertOk(
        "copiar dia anterior",
        await supabase.from("food_log_entries").insert(
          itens.map((e) => ({
            user_id: userId,
            food_id: e.foodId,
            meal_slot: e.slot,
            log_date: date,
            grams: e.grams,
            servings: 1,
            consumed: false,
            source: "copy",
          })),
        ),
      );
      return itens.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} ${n === 1 ? "item copiado" : "itens copiados"}`);
      void invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  // Refeições exibidas: as do plano, mais qualquer uma que tenha item lançado à
  // mão. A ordem é sempre a cronológica do dia, não a de chegada dos dados.
  const doPlano = new Set(plan.data?.meals.map((m) => m.slot as MealValue) ?? []);
  const comItem = new Set(rows.map((r) => r.slot as MealValue));
  const selecionados = MEALS.map((m) => m.key).filter((k) => doPlano.has(k) || comItem.has(k));
  // Nem plano nem itens: mostra o dia inteiro em vez de tela em branco. As
  // caixas ficam prontas para receber o que a pessoa comer.
  // Quem aumentou as refeições do dia (Configurações → Alimentação) ganha as
  // que faltam, vazias, prontas para receber alimentos — na ordem em que as
  // pessoas costumam acrescentar refeições.
  const quantas = Math.min(MEALS.length, num(profile.data?.meals_per_day));
  const escolhidos = new Set<MealValue>(selecionados);
  for (const k of PRIORIDADE_REFEICOES) {
    if (escolhidos.size >= quantas) break;
    escolhidos.add(k);
  }
  const slotsExibidos =
    escolhidos.size > 0
      ? MEALS.map((m) => m.key).filter((k) => escolhidos.has(k))
      : MEALS.map((m) => m.key);

  const nomeDe = (slot: MealValue) =>
    plan.data?.meals.find((m) => m.slot === slot)?.label?.trim() || label(MEAL_LABELS, slot);

  const renomear = useMutation({
    mutationFn: async ({ slot, nome }: { slot: MealValue; nome: string }) => {
      if (!plan.data) throw new Error("O plano alimentar ainda está carregando.");
      await setMealLabel(
        plan.data.id,
        slot,
        nome,
        MEALS.findIndex((m) => m.key === slot),
      );
    },
    onSuccess: () => {
      toast.success("Refeição renomeada");
      void qc.invalidateQueries({ queryKey: queryKeys.diet.activePlan() });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <PageHeader
        title="Dieta"
        description={date === hoje ? "Hoje" : undefined}
        action={
          <DatePicker
            value={date}
            onChange={setDate}
            className="h-11 w-auto rounded-2xl border-transparent bg-card"
            aria-label="Data do diário"
          />
        }
      />

      <PageBody>
        <Card className="mb-4">
          <CardContent className="p-4">
            {entries.isPending || profile.isPending ? (
              <div className="flex flex-col items-center gap-5 sm:flex-row">
                <Skeleton className="size-[148px] shrink-0 rounded-full" />
                <div className="grid w-full grid-cols-4 gap-3">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24 rounded-xl" />
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-6">
                  <CalorieRing
                    consumed={totaisConsumidos.kcal}
                    target={num(profile.data?.daily_kcal_target)}
                  />
                  <div className="grid w-full grid-cols-4 gap-2 sm:gap-3">
                    <MacroRing
                      value={totaisConsumidos.proteinG}
                      target={num(profile.data?.protein_g_target)}
                      label="Proteína"
                      unit="g"
                      color={MACRO_COLORS.protein}
                    />
                    <MacroRing
                      value={totaisConsumidos.carbsG}
                      target={num(profile.data?.carbs_g_target)}
                      label="Carbo"
                      unit="g"
                      color={MACRO_COLORS.carbs}
                    />
                    <MacroRing
                      value={totaisConsumidos.fatG}
                      target={num(profile.data?.fat_g_target)}
                      label="Gordura"
                      unit="g"
                      color={MACRO_COLORS.fat}
                      excessIsBad
                    />
                    <MacroRing
                      value={totaisConsumidos.fiberG}
                      target={num(profile.data?.fiber_g_target)}
                      label="Fibra"
                      unit="g"
                      color={MACRO_COLORS.fiber}
                    />
                  </div>
                </div>

                {rows.length > 0 && totaisPlanejados.kcal - totaisConsumidos.kcal > 50 && (
                  <p className="mt-4 border-t border-border pt-3 text-center text-xs text-muted-foreground">
                    Planejado para o dia:{" "}
                    <span className="font-medium tabular-nums text-foreground">
                      {Math.round(totaisPlanejados.kcal).toLocaleString("pt-BR")} kcal
                    </span>{" "}
                    · P {Math.round(totaisPlanejados.proteinG)} g
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {entries.isError ? (
          <ErrorState message={errorMessage(entries.error)} onRetry={entries.refetch} />
        ) : (
          <div className="space-y-3">
            {slotsExibidos.map((slot) => (
              <MealCard
                key={slot}
                slot={slot}
                nome={nomeDe(slot)}
                onRename={(nome) => renomear.mutateAsync({ slot, nome })}
                date={date}
                items={rows.filter((r) => r.slot === slot)}
                targetTime={plan.data?.meals.find((m) => m.slot === slot)?.targetTime ?? null}
                isPending={entries.isPending}
                userId={userId}
                onAdd={(foodId, grams) => addEntry.mutateAsync({ foodId, grams, slot })}
                onAddRecipe={async (recipe, portions) => {
                  try {
                    await addRecipeToMeal({ userId, date, slot, recipe, portions });
                    toast.success(`${recipe.name} adicionada`);
                    await invalidate();
                  } catch (e) {
                    toast.error(errorMessage(e));
                  }
                }}
                onRemove={(id) => remove.mutate(id)}
                onChanged={invalidate}
              />
            ))}
          </div>
        )}

        {rows.length === 0 && !entries.isPending && (
          <Button
            variant="outline"
            className="mt-4 w-full"
            onClick={() => copyPreviousDay.mutate()}
            disabled={copyPreviousDay.isPending}
          >
            <CopyPlus className="mr-1.5 size-4" />
            Copiar o dia anterior
          </Button>
        )}
      </PageBody>
    </>
  );
}

/**
 * Uma refeição.
 *
 * O botão "concluir refeição" existe porque marcar cinco itens um a um é o
 * atrito que faz a pessoa parar de registrar. Quem comeu o que estava
 * planejado — o caso comum — resolve com um toque.
 */
function MealCard({
  slot,
  nome,
  onRename,
  date,
  items,
  targetTime,
  isPending,
  userId,
  onAdd,
  onAddRecipe,
  onRemove,
  onChanged,
}: {
  slot: MealValue;
  /** Nome exibido: o dado pela pessoa ou o padrão do horário. */
  nome: string;
  onRename: (nome: string) => Promise<void>;
  date: string;
  items: DayEntry[];
  targetTime: string | null;
  isPending: boolean;
  userId: string;
  onAdd: (foodId: string, grams: number) => Promise<void>;
  onAddRecipe: (recipe: RecipeSummary, portions: number) => Promise<void>;
  onRemove: (id: string) => void;
  onChanged: () => void | Promise<unknown>;
}) {
  const qc = useQueryClient();

  const totals = nutritionTotals(
    items.map((e) => ({
      food: {
        servingSizeG: e.food.servingSizeG,
        kcal: e.food.kcal,
        proteinG: e.food.proteinG,
        carbsG: e.food.carbsG,
        fatG: e.food.fatG,
        fiberG: e.food.fiberG,
      },
      grams: e.grams,
      servings: 1,
    })),
  );

  const todosConsumidos = items.length > 0 && items.every((i) => i.consumed);

  const toggleItem = useMutation({
    mutationFn: ({ id, consumed }: { id: string; consumed: boolean }) => setConsumed(id, consumed),
    onMutate: async ({ id, consumed }) => {
      await qc.cancelQueries({ queryKey: queryKeys.diet.log(date) });
      const anterior = qc.getQueryData<DayEntry[]>(queryKeys.diet.log(date));
      // Otimista: marcar um item é a ação mais repetida da tela e não pode ter
      // latência perceptível.
      qc.setQueryData<DayEntry[]>(queryKeys.diet.log(date), (old) =>
        (old ?? []).map((e) => (e.id === id ? { ...e, consumed } : e)),
      );
      return { anterior };
    },
    onSuccess: (_r, { consumed }) => {
      // A refeição se conclui sozinha quando o último alimento é marcado. O
      // aviso sai daqui, do toque — e não de um efeito sobre os dados, que o
      // repetia para cada refeição já concluída sempre que se trocava de dia.
      const dia = qc.getQueryData<DayEntry[]>(queryKeys.diet.log(date)) ?? [];
      const daRefeicao = dia.filter((e) => e.slot === slot);
      if (consumed && daRefeicao.length > 0 && daRefeicao.every((e) => e.consumed)) {
        toast.success(`${nome} concluída`, {
          description: "Suas calorias e macros do dia já foram atualizados.",
        });
      }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.anterior) qc.setQueryData(queryKeys.diet.log(date), ctx.anterior);
      toast.error(errorMessage(e));
    },
    onSettled: () => void onChanged(),
  });

  const concluirRefeicao = useMutation({
    mutationFn: (consumed: boolean) => setMealConsumed(date, slot, consumed),
    onSuccess: (_r, consumed) => {
      if (consumed) toast.success(`${nome} concluída`);
      void onChanged();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const substituir = useMutation({
    mutationFn: async (p: { entry: DayEntry; foodId: string; grams: number }) => {
      await substituteEntry(p.entry.id, p.foodId, p.grams);
      // Registra a escolha, para subir nas próximas sugestões.
      await recordSubstitutionPreference(userId, p.entry.foodId, p.foodId);
    },
    onSuccess: () => {
      toast.success("Alimento substituído");
      void onChanged();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const ajustarQuantidade = useMutation({
    mutationFn: ({ id, grams }: { id: string; grams: number }) => setEntryGrams(id, grams),
    onSuccess: () => {
      toast.success("Quantidade atualizada");
      void onChanged();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Card
      className={cn("transition-colors", todosConsumidos && "border-primary/25 bg-primary/[0.03]")}
    >
      <CardContent className="p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 font-semibold leading-tight">
              <span className="truncate">{nome}</span>
              <RenomearRefeicao atual={nome} padrao={label(MEAL_LABELS, slot)} onSave={onRename} />
              {todosConsumidos && (
                <Check
                  className="size-4 shrink-0 text-primary"
                  strokeWidth={3}
                  aria-label="concluída"
                />
              )}
            </h3>
            <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              {targetTime && (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Clock className="size-3" aria-hidden />
                  {targetTime.slice(0, 5)}
                </span>
              )}
              {items.length > 0 && (
                <span className="tabular-nums">
                  {Math.round(totals.kcal)} kcal · P {Math.round(totals.proteinG)} g
                </span>
              )}
            </p>
          </div>

          <FoodPicker
            title={`Adicionar em ${nome.toLowerCase()}`}
            onPick={(food, grams) => onAdd(food.id, grams)}
            onPickRecipe={onAddRecipe}
            trigger={
              <Button size="sm" variant="ghost" className="shrink-0">
                <Plus className="mr-1 size-4" />
                Adicionar
              </Button>
            }
          />
        </div>

        {isPending ? (
          <div className="space-y-2 py-1">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : items.length === 0 ? (
          <p className="py-3 text-center text-sm text-muted-foreground">
            Refeição vazia — toque em Adicionar para incluir alimentos ou uma receita.
          </p>
        ) : (
          <>
            <ul className="space-y-1">
              {items.map((item) => (
                <FoodRow
                  key={item.id}
                  item={item}
                  onToggle={(consumed) => toggleItem.mutate({ id: item.id, consumed })}
                  onRemove={() => onRemove(item.id)}
                  onSubstitute={(food, grams) =>
                    substituir.mutateAsync({ entry: item, foodId: food.id, grams })
                  }
                  onChangeGrams={(grams) => ajustarQuantidade.mutate({ id: item.id, grams })}
                />
              ))}
            </ul>

            {!todosConsumidos && (
              <Button
                variant="outline"
                className="mt-3 h-10 w-full rounded-xl"
                onClick={() => concluirRefeicao.mutate(true)}
                disabled={concluirRefeicao.isPending}
              >
                <Check className="mr-1.5 size-4" />
                Concluir refeição
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Ilustração do alimento.
 *
 * `foods.image_url` existe e quase nunca está preenchida — o catálogo vem de
 * tabela nutricional, não de banco de imagens. Em vez de deixar um quadrado
 * cinza em toda linha, a categoria vira um símbolo. Não é foto do prato, e não
 * finge ser: é um identificador visual que ajuda a varrer a lista com o olho.
 */
const CATEGORY_EMOJI: Record<string, string> = {
  protein_meat: "🥩",
  protein_egg: "🥚",
  dairy: "🥛",
  legume: "🫘",
  grain: "🌾",
  tuber: "🥔",
  vegetable: "🥦",
  fruit: "🍎",
  fat: "🥑",
  beverage: "🥤",
  supplement: "🥤",
  sweet: "🍫",
  condiment: "🧂",
  prepared: "🍲",
  other: "🍽️",
};

function FoodThumb({ item }: { item: DayEntry }) {
  if (item.food.imageUrl) {
    return (
      <img
        src={item.food.imageUrl}
        alt=""
        loading="lazy"
        decoding="async"
        className="size-11 shrink-0 rounded-lg object-cover"
      />
    );
  }

  return (
    <span
      className="grid size-11 shrink-0 place-items-center rounded-lg bg-muted text-lg"
      aria-hidden
    >
      {CATEGORY_EMOJI[item.food.category ?? "other"] ?? CATEGORY_EMOJI.other}
    </span>
  );
}

function FoodRow({
  item,
  onToggle,
  onRemove,
  onSubstitute,
  onChangeGrams,
}: {
  item: DayEntry;
  onToggle: (consumed: boolean) => void;
  onRemove: () => void;
  onSubstitute: (food: FoodCandidate, grams: number) => Promise<void>;
  onChangeGrams: (grams: number) => void;
}) {
  const [editando, setEditando] = useState(false);
  const macros = portionMacros({
    food: {
      servingSizeG: item.food.servingSizeG,
      kcal: item.food.kcal,
      proteinG: item.food.proteinG,
      carbsG: item.food.carbsG,
      fatG: item.food.fatG,
      fiberG: item.food.fiberG,
    },
    grams: item.grams,
    servings: 1,
  });

  const porcao = item.food.servingSizeG || 100;
  const candidate: FoodCandidate = {
    id: item.foodId,
    name: item.name,
    category: (item.food.category ?? "other") as FoodCandidate["category"],
    // O domínio trabalha por 100 g; a porção de referência do banco pode ser outra.
    kcal: (item.food.kcal / porcao) * 100,
    proteinG: (item.food.proteinG / porcao) * 100,
    carbsG: (item.food.carbsG / porcao) * 100,
    fatG: (item.food.fatG / porcao) * 100,
    fiberG: (item.food.fiberG / porcao) * 100,
    popularity: 50,
  };

  const medida =
    item.food.measure && item.food.measureG
      ? `≈ ${(item.grams / item.food.measureG).toFixed(1).replace(".0", "")} × ${item.food.measure}`
      : null;

  return (
    <li className={cn("rounded-lg py-1.5 transition-opacity", item.consumed && "opacity-60")}>
      <div className="flex items-center gap-3">
        <Checkbox
          checked={item.consumed}
          onCheckedChange={(v) => onToggle(v === true)}
          aria-label={`Marcar ${item.name} como consumido`}
          className="size-5 shrink-0"
        />

        <FoodThumb item={item} />

        <div className="min-w-0 flex-1">
          <p className={cn("truncate text-sm font-medium", item.consumed && "line-through")}>
            {item.name}
          </p>
          <p className="text-xs tabular-nums text-muted-foreground">
            <button
              type="button"
              onClick={() => setEditando((v) => !v)}
              className="font-medium text-foreground underline decoration-dotted underline-offset-2"
              aria-label={`Alterar a quantidade de ${item.name}`}
            >
              {Math.round(item.grams)} g
            </button>
            {medida && <span className="ml-1">({medida})</span>}
          </p>
          <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] tabular-nums text-muted-foreground">
            <span>{Math.round(macros.kcal)} kcal</span>
            <span>P {macros.proteinG.toFixed(0)} g</span>
            <span>C {macros.carbsG.toFixed(0)} g</span>
            <span>G {macros.fatG.toFixed(0)} g</span>
          </p>
        </div>

        {/* Substituir sai do menu escondido e vira botão: é a ação que salva o
            dia de quem não tem o alimento prescrito em casa, e enterrá-la em um
            menu de três pontos era o mesmo que não tê-la. */}
        <SubstituteFoodDialog
          food={candidate}
          grams={item.grams}
          onSubstitute={onSubstitute}
          trigger={
            <Button
              size="sm"
              variant="ghost"
              className="hidden h-8 shrink-0 px-2 text-xs sm:inline-flex"
            >
              <Repeat className="mr-1 size-3.5" />
              Substituir
            </Button>
          }
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="size-8 shrink-0"
              aria-label={`Opções de ${item.name}`}
            >
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <SubstituteFoodDialog
              food={candidate}
              grams={item.grams}
              onSubstitute={onSubstitute}
              trigger={
                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="sm:hidden">
                  <Repeat className="mr-2 size-4" />
                  Substituir
                </DropdownMenuItem>
              }
            />
            <DropdownMenuItem onSelect={() => setEditando(true)}>
              <Pencil className="mr-2 size-4" />
              Alterar quantidade
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={onRemove}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 size-4" />
              Remover
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {editando && (
        <GramsEditor
          grams={item.grams}
          name={item.name}
          onCancel={() => setEditando(false)}
          onSave={(g) => {
            onChangeGrams(g);
            setEditando(false);
          }}
        />
      )}
    </li>
  );
}

/**
 * Ajuste de quantidade.
 *
 * Com passos de 10 g ao lado do campo: a correção típica é "um pouco mais de
 * arroz", e forçar a pessoa a digitar 160 no lugar de 150 num teclado numérico
 * de celular é atrito suficiente para ela desistir de corrigir — e um diário
 * que não é corrigido deixa de descrever a realidade.
 */
function GramsEditor({
  grams,
  name,
  onSave,
  onCancel,
}: {
  grams: number;
  name: string;
  onSave: (grams: number) => void;
  onCancel: () => void;
}) {
  const [valor, setValor] = useState(String(Math.round(grams)));
  const numero = Math.max(1, Math.round(Number(valor) || 0));

  return (
    <div className="mt-2 flex items-center gap-2 rounded-xl bg-muted/50 p-2">
      <Button
        size="icon"
        variant="outline"
        className="size-9 shrink-0"
        onClick={() => setValor(String(Math.max(1, numero - 10)))}
        aria-label="Diminuir 10 gramas"
      >
        <Minus className="size-4" />
      </Button>

      <Input
        type="number"
        inputMode="numeric"
        min={1}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        className="h-9 flex-1 tabular-nums"
        aria-label={`Quantidade de ${name} em gramas`}
        autoFocus
      />

      <Button
        size="icon"
        variant="outline"
        className="size-9 shrink-0"
        onClick={() => setValor(String(numero + 10))}
        aria-label="Aumentar 10 gramas"
      >
        <Plus className="size-4" />
      </Button>

      <Button size="sm" className="h-9 shrink-0" onClick={() => onSave(numero)}>
        Salvar
      </Button>
      <Button size="sm" variant="ghost" className="h-9 shrink-0" onClick={onCancel}>
        Cancelar
      </Button>
    </div>
  );
}

/** Lápis ao lado do nome da refeição: renomeia (vazio volta ao padrão). */
function RenomearRefeicao({
  atual,
  padrao,
  onSave,
}: {
  atual: string;
  padrao: string;
  onSave: (nome: string) => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState(atual);
  const [salvando, setSalvando] = useState(false);
  const salvar = async () => {
    setSalvando(true);
    try {
      await onSave(nome === padrao ? "" : nome);
      setAberto(false);
    } finally {
      setSalvando(false);
    }
  };
  return (
    <Dialog
      open={aberto}
      onOpenChange={(o) => {
        setAberto(o);
        if (o) setNome(atual);
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Renomear ${atual}`}
          className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-elevated hover:text-foreground"
        >
          <Pencil className="size-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent className="rounded-[1.5rem]">
        <DialogHeader>
          <DialogTitle>Nome da refeição</DialogTitle>
          <DialogDescription>Deixe em branco para voltar a “{padrao}”.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void salvar();
          }}
          className="space-y-4"
        >
          <Input
            autoFocus
            value={nome}
            maxLength={40}
            onChange={(e) => setNome(e.target.value)}
            placeholder={padrao}
            className="h-12 text-lg"
            aria-label="Nome da refeição"
          />
          <Button type="submit" className="h-12 w-full" disabled={salvando}>
            Salvar
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
