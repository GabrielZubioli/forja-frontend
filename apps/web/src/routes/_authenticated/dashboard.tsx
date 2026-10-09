import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight, Scale, TrendingDown, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/data/query-keys";
import { errorMessage, num, unwrapList, unwrapMaybe } from "@/data/supabase-helpers";
import { hasCompletedOnboarding } from "@/data/onboarding";
import { fetchActiveRoutine, fetchCompletedWorkouts } from "@/data/routines";
import { openWorkoutForTemplate } from "@/data/workout-session";
import { ensureDayMaterialized, fetchDayEntries } from "@/data/diet-day";
import { ensureActiveMealPlan } from "@/data/meal-plans";
import { useCurrentUserId } from "@/hooks/use-current-user";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/query-boundary";
import { CalorieRing, MACRO_COLORS, MacroRing } from "@/components/home/macro-rings";
import { WaterCard } from "@/components/home/water-card";
import { NextMealCard } from "@/components/home/next-meal-card";
import {
  NoRoutineCard,
  TodayWorkoutCard,
  TodayWorkoutSkeleton,
} from "@/components/home/today-workout-card";
import { CoachTips } from "@/components/coach/coach-tips";
import { formatLongDate, toISODate, todayISO } from "@/lib/date";
import { addDays, startOfWeek } from "date-fns";
import { ema, nutritionTotals, weekStart, weeklyStreak } from "@forja/domain";

/**
 * A tela inicial responde a uma pergunta: **o que eu faço agora?**
 *
 * A versão anterior respondia "como foram os últimos 60 dias" — quatro cards de
 * estatística, um gráfico de peso e uma lista de treinos passados. Informação
 * correta, na hora errada: quem abre o app às 6h30 quer saber qual treino
 * fazer, não qual foi o volume da semana passada.
 *
 * A ordem dos blocos é a ordem da decisão:
 *
 * 1. **Treino de hoje** — a ação principal, com botão grande.
 * 2. **Calorias e macros** — o segundo compromisso do dia.
 * 3. **Próxima refeição pendente** — acionável, não um resumo.
 * 4. **Água** — um toque.
 * 5. **Peso e tendência** — acompanhamento, no fim.
 *
 * Histórico e gráficos longos vivem em Progresso, onde a pergunta é outra.
 */
export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Hoje — Forja" },
      { name: "description", content: "Seu treino, suas refeições e suas metas de hoje." },
      { name: "robots", content: "noindex" },
    ],
  }),
  /**
   * Quem chega sem ter passado pela geração vai montá-la.
   *
   * Acontece com contas antigas (criadas antes deste fluxo) e com quem
   * abandonou o processo no meio. Um app de treino sem plano não tem o que
   * mostrar.
   */
  beforeLoad: async () => {
    if (!(await hasCompletedOnboarding())) throw redirect({ to: "/preparando" });
  },
  component: Home,
});

function Home() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const userId = useCurrentUserId();
  const today = todayISO();

  const profile = useQuery({
    queryKey: queryKeys.profile(),
    queryFn: async () =>
      unwrapMaybe("carregar perfil", await supabase.from("profiles").select("*").maybeSingle()),
  });

  const routine = useQuery({
    queryKey: queryKeys.workouts.activeRoutine(),
    queryFn: fetchActiveRoutine,
  });

  // Uma janela de 26 semanas serve às duas leituras da home: a semana atual
  // (dias concluídos) e a sequência de semanas batendo a meta.
  const recentWorkouts = useQuery({
    queryKey: [...queryKeys.workouts.all, "completed-recent"],
    queryFn: () => {
      const inicio = startOfWeek(new Date(), { weekStartsOn: 1 });
      return fetchCompletedWorkouts(
        toISODate(addDays(inicio, -7 * 25)),
        toISODate(addDays(inicio, 6)),
      );
    },
  });
  const inicioDaSemana = weekStart(today);
  const completedThisWeek = (recentWorkouts.data ?? []).filter((w) => w.date >= inicioDaSemana);
  const streak = routine.data
    ? weeklyStreak(
        (recentWorkouts.data ?? []).map((w) => w.date),
        routine.data.daysPerWeek,
        today,
      )
    : 0;

  /**
   * O diário de hoje, materializado do plano se for a primeira abertura.
   *
   * A materialização acontece dentro da `queryFn` — e não num efeito — para que
   * a leitura só ocorra depois da escrita. Separá-las produziria uma tela vazia
   * no primeiro acesso do dia, seguida de um salto quando os dados chegassem.
   */
  const diario = useQuery({
    queryKey: queryKeys.diet.log(today),
    queryFn: async () => {
      // Garante o plano antes de materializar: sem ele o dia nasceria vazio e o
      // registro em `diet_days` impediria a remontagem quando o plano chegasse.
      await ensureActiveMealPlan(userId);
      await ensureDayMaterialized(userId, today, today);
      return fetchDayEntries(today);
    },
  });

  const weights = useQuery({
    queryKey: queryKeys.body.weights(30),
    queryFn: async () => {
      const from = toISODate(addDays(new Date(), -30));
      return unwrapList(
        "carregar peso",
        await supabase
          .from("body_weights")
          .select("log_date, weight_kg")
          .gte("log_date", from)
          .order("log_date"),
      );
    },
  });

  /** Exercícios da divisão de hoje, para a prévia do card de treino. */
  const todaySplit = useQuery({
    queryKey: [...queryKeys.workouts.all, "today-preview", routine.data?.id ?? "none"],
    enabled: !!routine.data,
    queryFn: async () => {
      const r = routine.data!;
      const index = r.currentIndex % Math.max(1, r.templates.length);
      const template = r.templates[index];
      if (!template) return { muscles: [], names: [] };

      const rows = unwrapList(
        "carregar exercícios do treino de hoje",
        await supabase
          .from("workout_template_exercises")
          .select("position, exercises(name, primary_muscle)")
          .eq("template_id", template.id)
          .order("position"),
      );

      // `Set` para não repetir "peito" três vezes quando a divisão tem três
      // exercícios de peito.
      const muscles = [...new Set(rows.map((r) => r.exercises?.primary_muscle).filter(Boolean))];
      return { muscles: muscles as string[], names: rows.map((r) => r.exercises?.name ?? "") };
    },
  });

  const startWorkout = useMutation({
    mutationFn: (templateId: string) => openWorkoutForTemplate(userId, templateId),
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: queryKeys.workouts.all });
      void navigate({ to: "/workouts/session/$id", params: { id } });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const entries = diario.data ?? [];
  // Só o que foi **consumido** conta para os anéis. Somar o planejado mostraria
  // a meta batida antes de a pessoa comer, que é o oposto de acompanhar.
  const consumidos = entries.filter((e) => e.consumed);
  const totals = nutritionTotals(
    consumidos.map((e) => ({
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

  const pesos = (weights.data ?? []).map((w) => num(w.weight_kg));
  const tendencia = ema(pesos, 0.25);
  const pesoAtual = pesos.at(-1);
  const tendenciaAtual = tendencia.at(-1);
  const tendenciaAnterior = tendencia.length > 7 ? tendencia.at(-8) : undefined;
  const deltaSemanal =
    tendenciaAtual !== undefined && tendenciaAnterior !== undefined
      ? tendenciaAtual - tendenciaAnterior
      : undefined;

  const firstName = profile.data?.display_name?.split(" ")[0];
  const kcalTarget = num(profile.data?.daily_kcal_target);

  return (
    // Mesma coluna de leitura das demais telas (ver `page-header.tsx`): a tela
    // inicial usava `max-w-2xl` e as outras, a largura toda — a troca de aba
    // deslocava o conteúdo lateralmente no desktop.
    <div className="mx-auto w-full max-w-3xl px-4 pb-8 pt-5 md:px-8 md:pt-8">
      <header className="mb-5">
        <p className="text-sm capitalize text-muted-foreground">{formatLongDate(today)}</p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight">
          {profile.isPending ? "Olá" : `Olá, ${firstName ?? "atleta"}`}
        </h1>
      </header>

      <div className="space-y-4">
        {/* 1 — Treino de hoje */}
        {routine.isPending ? (
          <TodayWorkoutSkeleton />
        ) : routine.isError ? (
          <ErrorState
            message="Não conseguimos carregar seu treino."
            onRetry={routine.refetch}
            compact
          />
        ) : routine.data ? (
          <TodayWorkoutCard
            data={{
              routine: routine.data,
              completedThisWeek,
              streak,
              muscles: todaySplit.data?.muscles ?? [],
              exerciseNames: (todaySplit.data?.names ?? []).filter(Boolean),
            }}
            today={today}
            onStart={(id) => startWorkout.mutate(id)}
            isStarting={startWorkout.isPending}
          />
        ) : (
          <NoRoutineCard />
        )}

        {/* 2 — Calorias e macros */}
        <Card>
          <CardContent className="p-4">
            {diario.isPending || profile.isPending ? (
              <NutritionSkeleton />
            ) : diario.isError ? (
              <ErrorState
                message="Não conseguimos ler seu diário."
                onRetry={diario.refetch}
                compact
              />
            ) : (
              <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-6">
                <CalorieRing consumed={totals.kcal} target={kcalTarget} />

                <div className="grid w-full grid-cols-4 gap-2 sm:gap-3">
                  <MacroRing
                    value={totals.proteinG}
                    target={num(profile.data?.protein_g_target)}
                    label="Proteína"
                    unit="g"
                    color={MACRO_COLORS.protein}
                  />
                  <MacroRing
                    value={totals.carbsG}
                    target={num(profile.data?.carbs_g_target)}
                    label="Carbo"
                    unit="g"
                    color={MACRO_COLORS.carbs}
                  />
                  <MacroRing
                    value={totals.fatG}
                    target={num(profile.data?.fat_g_target)}
                    label="Gordura"
                    unit="g"
                    color={MACRO_COLORS.fat}
                    excessIsBad
                  />
                  <MacroRing
                    value={totals.fiberG}
                    target={num(profile.data?.fiber_g_target)}
                    label="Fibra"
                    unit="g"
                    color={MACRO_COLORS.fiber}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 3 — Próxima refeição */}
        {diario.isPending ? (
          <Card>
            <CardContent className="space-y-2 p-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-11 w-full rounded-xl" />
            </CardContent>
          </Card>
        ) : (
          <NextMealCard date={today} entries={entries} isToday />
        )}

        {/* 4 — Água */}
        <WaterCard date={today} targetMl={num(profile.data?.water_ml_target, 2500)} />

        {/* 5 — Recomendações do treinador, quando houver */}
        <CoachTips />

        {/* 6 — Peso e tendência */}
        <Card>
          <CardContent className="p-4">
            <Link to="/body" className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
                <Scale className="size-5" aria-hidden />
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight">Peso</p>
                {weights.isPending ? (
                  <Skeleton className="mt-1 h-4 w-28" />
                ) : pesoAtual !== undefined ? (
                  <p className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="font-medium tabular-nums text-foreground">{pesoAtual} kg</span>
                    {deltaSemanal !== undefined && Math.abs(deltaSemanal) >= 0.05 && (
                      <span className="inline-flex items-center gap-0.5 tabular-nums">
                        {deltaSemanal < 0 ? (
                          <TrendingDown className="size-3.5" aria-hidden />
                        ) : (
                          <TrendingUp className="size-3.5" aria-hidden />
                        )}
                        {/* A tendência (média móvel), não a balança: o peso do dia
                            oscila 1 kg com sal e água, e reagir a isso é ruído. */}
                        {deltaSemanal > 0 ? "+" : ""}
                        {deltaSemanal.toFixed(1)} kg na semana
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="mt-0.5 text-sm text-muted-foreground">Registre seu peso</p>
                )}
              </div>

              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </CardContent>
        </Card>

        <Button asChild variant="ghost" className="w-full text-muted-foreground">
          <Link to="/body">
            Ver progresso completo
            <ChevronRight className="ml-1 size-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function NutritionSkeleton() {
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-6">
      <Skeleton className="size-[148px] shrink-0 rounded-full" />
      <div className="grid w-full grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <Skeleton className="size-[76px] rounded-full" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}
