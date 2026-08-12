import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Dumbbell,
  Info,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/query-boundary";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/data/supabase-helpers";
import { buildRoutineDraft, createRoutine } from "@/data/routines";
import { queryKeys } from "@/data/query-keys";
import { useCurrentUserId } from "@/hooks/use-current-user";
import { MUSCLE_LABELS, label } from "@/lib/labels";
import {
  WEEKDAYS,
  WEEKDAY_INITIALS,
  WEEKDAY_LABELS,
  findVolumeOutliers,
  suggestWeekdays,
  sumWeeklySetsByGroup,
  type PlanInput,
  type TrainingGoal,
  type TrainingLevel,
  type EquipmentProfile,
} from "@forja/domain";

export const Route = createFileRoute("/_authenticated/workouts_/routines/new")({
  head: () => ({
    meta: [
      { title: "Montar plano de treino — Forja" },
      {
        name: "description",
        content: "Responda quatro perguntas e receba sua divisão de treino pronta.",
      },
    ],
  }),
  component: RoutineWizard,
});

/**
 * Assistente de criação do plano.
 *
 * Substitui a montagem manual de templates, que exigia do usuário decidir
 * divisão, exercícios, séries, repetições e descanso — exatamente o
 * conhecimento que ele ainda não tem quando começa. Quatro perguntas bastam
 * para a programação: nível define volume, objetivo define reps e descanso,
 * equipamento restringe os exercícios e a frequência escolhe a divisão.
 */

type Step = 0 | 1 | 2 | 3 | 4 | 5;

const LEVEL_OPTIONS: { value: TrainingLevel; label: string; hint: string }[] = [
  { value: "beginner", label: "Iniciante", hint: "Menos de 6 meses treinando com consistência" },
  {
    value: "intermediate",
    label: "Intermediário",
    hint: "6 meses a 2 anos, técnica já consolidada",
  },
  { value: "advanced", label: "Avançado", hint: "Mais de 2 anos, progressão já lenta" },
];

const GOAL_OPTIONS: { value: TrainingGoal; label: string; hint: string }[] = [
  { value: "hypertrophy", label: "Ganhar massa", hint: "8–12 repetições, descanso médio" },
  { value: "strength", label: "Ganhar força", hint: "4–6 repetições, descanso longo" },
  { value: "endurance", label: "Resistência", hint: "12–20 repetições, descanso curto" },
];

const EQUIPMENT_OPTIONS: { value: EquipmentProfile; label: string; hint: string }[] = [
  { value: "full_gym", label: "Academia completa", hint: "Barras, halteres, máquinas e polias" },
  { value: "home_basic", label: "Casa com halteres", hint: "Halteres, elásticos e peso corporal" },
  { value: "bodyweight", label: "Só peso corporal", hint: "Sem nenhum equipamento" },
];

const FREQUENCY_OPTIONS = [2, 3, 4, 5, 6] as const;

const FREQUENCY_HINT: Record<number, string> = {
  2: "Corpo inteiro, duas vezes por semana",
  3: "Empurrar / Puxar / Pernas",
  4: "Superiores e inferiores, duas vezes cada",
  5: "Divisão completa com maior volume",
  6: "Empurrar / Puxar / Pernas, duas vezes",
};

const STEP_TITLES = [
  "Seu nível",
  "Seu objetivo",
  "Onde você treina",
  "Quantos dias",
  "Quais dias",
  "Seu plano",
];

function RoutineWizard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const userId = useCurrentUserId();

  const [step, setStep] = useState<Step>(0);
  const [level, setLevel] = useState<TrainingLevel | null>(null);
  const [goal, setGoal] = useState<TrainingGoal | null>(null);
  const [equipment, setEquipment] = useState<EquipmentProfile | null>(null);
  const [daysPerWeek, setDaysPerWeek] = useState<number | null>(null);
  const [weekdays, setWeekdays] = useState<number[]>([]);

  const input: PlanInput | null =
    level && goal && equipment && daysPerWeek ? { level, goal, equipment, daysPerWeek } : null;

  // Só monta a prévia no último passo, quando todas as respostas existem.
  const draft = useQuery({
    queryKey: ["routine-draft", input],
    enabled: step === 5 && input !== null,
    queryFn: () => buildRoutineDraft(input!),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!input || !draft.data) throw new Error("Plano ainda não está pronto.");
      const nome = `${GOAL_OPTIONS.find((g) => g.value === input.goal)?.label ?? "Treino"} · ${input.daysPerWeek}× por semana`;
      return createRoutine(userId, input, draft.data, nome, weekdays);
    },
    onSuccess: () => {
      toast.success("Plano criado!", { description: "Sua divisão já está pronta em Treinos." });
      void qc.invalidateQueries({ queryKey: queryKeys.workouts.all });
      void navigate({ to: "/workouts" });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const canAdvance =
    (step === 0 && level) ||
    (step === 1 && goal) ||
    (step === 2 && equipment) ||
    (step === 3 && daysPerWeek) ||
    (step === 4 && weekdays.length === daysPerWeek);

  return (
    <>
      <PageHeader
        title="Montar meu plano"
        description="Quatro perguntas e sua divisão de treino fica pronta."
        action={
          <Button
            variant="outline"
            onClick={() => {
              // Registra a recusa para não ser redirecionado de novo a cada abertura.
              try {
                localStorage.setItem("forja:skip-routine-onboarding", "1");
              } catch {
                // Storage bloqueado: o convite volta na próxima sessão.
              }
              void navigate({ to: "/workouts" });
            }}
          >
            <ArrowLeft className="mr-1 size-4" />
            Agora não
          </Button>
        }
      />
      <PageBody>
        <div className="mx-auto max-w-2xl">
          <ol className="mb-6 flex items-center gap-2" aria-label="Progresso do assistente">
            {STEP_TITLES.map((titulo, i) => (
              <li key={titulo} className="flex flex-1 items-center gap-2">
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors",
                    i < step && "bg-primary text-primary-foreground",
                    i === step && "bg-primary text-primary-foreground ring-4 ring-primary/20",
                    i > step && "bg-muted text-muted-foreground",
                  )}
                  aria-current={i === step ? "step" : undefined}
                >
                  {i < step ? <Check className="size-3.5" /> : i + 1}
                </span>
                {i < STEP_TITLES.length - 1 && (
                  <span
                    className={cn("h-0.5 flex-1 rounded", i < step ? "bg-primary" : "bg-muted")}
                  />
                )}
              </li>
            ))}
          </ol>

          <h2 className="mb-4 text-xl font-semibold tracking-tight">{STEP_TITLES[step]}</h2>

          {step === 0 && (
            <OptionList
              options={LEVEL_OPTIONS}
              selected={level}
              onSelect={(v) => {
                setLevel(v);
                setStep(1);
              }}
            />
          )}
          {step === 1 && (
            <OptionList
              options={GOAL_OPTIONS}
              selected={goal}
              onSelect={(v) => {
                setGoal(v);
                setStep(2);
              }}
            />
          )}
          {step === 2 && (
            <OptionList
              options={EQUIPMENT_OPTIONS}
              selected={equipment}
              onSelect={(v) => {
                setEquipment(v);
                setStep(3);
              }}
            />
          )}
          {step === 3 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {FREQUENCY_OPTIONS.map((dias) => (
                <button
                  key={dias}
                  type="button"
                  onClick={() => {
                    setDaysPerWeek(dias);
                    // Pré-seleciona dias espalhados na semana; o usuário ajusta
                    // no passo seguinte se a agenda dele for outra.
                    setWeekdays(suggestWeekdays(dias));
                    setStep(4);
                  }}
                  className={cn(
                    "rounded-xl border p-4 text-center transition-colors hover:bg-accent",
                    daysPerWeek === dias ? "border-primary bg-accent" : "border-border",
                  )}
                >
                  <span className="block text-2xl font-bold">{dias}</span>
                  <span className="block text-xs text-muted-foreground">dias/semana</span>
                </button>
              ))}
              {daysPerWeek && (
                <p className="col-span-full text-sm text-muted-foreground">
                  {FREQUENCY_HINT[daysPerWeek]}
                </p>
              )}
            </div>
          )}

          {step === 4 && daysPerWeek && (
            <WeekdayPicker
              selected={weekdays}
              required={daysPerWeek}
              onToggle={(dia) =>
                setWeekdays((atual) =>
                  atual.includes(dia) ? atual.filter((d) => d !== dia) : [...atual, dia].sort(),
                )
              }
            />
          )}

          {step === 5 && (
            <PlanPreview query={draft} onConfirm={() => save.mutate()} isSaving={save.isPending} />
          )}

          <div className="mt-6 flex justify-between">
            <Button
              variant="ghost"
              onClick={() => setStep((s) => Math.max(0, s - 1) as Step)}
              disabled={step === 0}
            >
              <ArrowLeft className="mr-1 size-4" />
              Voltar
            </Button>
            {step < 5 && (
              <Button
                onClick={() => setStep((s) => Math.min(5, s + 1) as Step)}
                disabled={!canAdvance}
              >
                Continuar
                <ArrowRight className="ml-1 size-4" />
              </Button>
            )}
          </div>
        </div>
      </PageBody>
    </>
  );
}

/**
 * Escolha dos dias da semana.
 *
 * A agenda é indicativa: a sequência A/B/C avança por treino concluído, não por
 * data. Faltar numa segunda não faz perder o treino A — ele espera. O texto
 * abaixo diz isso, porque a expectativa contrária é o que faz gente desistir
 * depois da primeira semana atrapalhada.
 */
function WeekdayPicker({
  selected,
  required,
  onToggle,
}: {
  selected: number[];
  required: number;
  onToggle: (weekday: number) => void;
}) {
  const faltam = required - selected.length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((dia) => {
          const ativo = selected.includes(dia);
          return (
            <button
              key={dia}
              type="button"
              onClick={() => onToggle(dia)}
              aria-pressed={ativo}
              aria-label={WEEKDAY_LABELS[dia]}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border py-3 transition-colors",
                ativo
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-accent",
              )}
            >
              <span className="text-base font-bold">{WEEKDAY_INITIALS[dia]}</span>
              <span className="text-[10px] opacity-80">
                {WEEKDAY_LABELS[dia].slice(0, 3).toLowerCase()}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-sm text-muted-foreground">
        {faltam > 0
          ? `Escolha mais ${faltam} ${faltam === 1 ? "dia" : "dias"}.`
          : faltam < 0
            ? `Você escolheu ${-faltam} ${-faltam === 1 ? "dia a mais" : "dias a mais"} do que a frequência definida.`
            : "Agenda definida."}
      </p>

      <p className="flex gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
        <span>
          Estes dias são um guia, não uma cobrança. A sequência A → B → C avança a cada treino
          concluído: se você faltar numa segunda, o treino A continua esperando por você na quarta.
        </span>
      </p>
    </div>
  );
}

function OptionList<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: { value: T; label: string; hint: string }[];
  selected: T | null;
  onSelect: (value: T) => void;
}) {
  return (
    <div className="space-y-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onSelect(option.value)}
          aria-pressed={selected === option.value}
          className={cn(
            "flex w-full items-center justify-between gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-accent",
            selected === option.value ? "border-primary bg-accent" : "border-border",
          )}
        >
          <span>
            <span className="block font-medium">{option.label}</span>
            <span className="block text-sm text-muted-foreground">{option.hint}</span>
          </span>
          {selected === option.value && <Check className="size-5 shrink-0 text-primary" />}
        </button>
      ))}
    </div>
  );
}

function PlanPreview({
  query,
  onConfirm,
  isSaving,
}: {
  query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof buildRoutineDraft>>>>;
  onConfirm: () => void;
  isSaving: boolean;
}) {
  if (query.isPending) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={query.refetch} />;
  }

  const draft = query.data;
  const semanal = sumWeeklySetsByGroup(draft.plan.weeklySetsByMuscle);
  const alertas = findVolumeOutliers(draft.plan);
  const semExercicio = draft.splits.flatMap((s) => s.unmatched);

  return (
    <div className="space-y-4">
      <Card className="border-primary/30">
        <CardContent className="flex items-center gap-3 p-4">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-xl text-primary-foreground"
            style={{ background: "var(--gradient-primary)" }}
            aria-hidden
          >
            <Sparkles className="size-5" />
          </span>
          <div>
            <p className="font-semibold">{draft.splits.length} treinos na sequência</p>
            <p className="text-sm text-muted-foreground">
              Você treina A, B, C… na ordem. Faltou um dia? O próximo continua de onde parou.
            </p>
          </div>
        </CardContent>
      </Card>

      {alertas.length > 0 && (
        <Card className="border-warning/40 bg-warning-soft/40">
          <CardContent className="flex gap-3 p-4 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <div>
              <p className="font-medium">Atenção ao volume</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {alertas.map((a) => (
                  <li key={a.muscle}>
                    <b className="capitalize text-foreground">{a.muscle}</b>: {a.sets} séries por
                    semana — {a.status === "low" ? "abaixo" : "acima"} do ideal para o seu nível.
                    {a.status === "low" && " Considere treinar mais dias."}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {semExercicio.length > 0 && (
        <Card className="border-warning/40 bg-warning-soft/40">
          <CardContent className="p-4 text-sm">
            <p className="font-medium">
              {semExercicio.length} exercício(s) sem correspondência no catálogo
            </p>
            <p className="mt-1 text-muted-foreground">
              O plano foi criado assim mesmo. Você pode adicionar os movimentos que faltarem
              editando a divisão depois.
            </p>
          </CardContent>
        </Card>
      )}

      {draft.splits.map((split) => {
        const totalSeries = split.items.reduce((n, i) => n + i.slot.sets, 0);
        return (
          <Card key={split.letter}>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="grid size-7 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
                  {split.letter}
                </span>
                {split.name}
              </CardTitle>
              <span className="text-xs text-muted-foreground">{totalSeries} séries</span>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {split.items.map((item, i) => (
                  <li
                    key={`${item.exercise.id}-${i}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.exercise.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {label(MUSCLE_LABELS, item.slot.primaryMuscle)}
                      </p>
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      {item.slot.sets}×{item.slot.repMin}-{item.slot.repMax}
                    </Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Volume semanal</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
            {Object.entries(semanal).map(([grupo, series]) => (
              <div key={grupo} className="rounded-lg border border-border p-2.5">
                <dt className="text-xs capitalize text-muted-foreground">{grupo}</dt>
                <dd className="font-semibold">{series} séries</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Button className="w-full" size="lg" onClick={onConfirm} disabled={isSaving}>
        <Dumbbell className="mr-1.5 size-4" />
        {isSaving ? "Criando…" : "Usar este plano"}
      </Button>
    </div>
  );
}
