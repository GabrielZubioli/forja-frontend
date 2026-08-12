/**
 * Card de metas adaptativas.
 *
 * Regra de design: **nada de caixa-preta**. O número sozinho ("sua meta agora é
 * 2.740 kcal") não constrói confiança — o card mostra de onde ele veio: quantas
 * pesagens e dias de diário entraram na conta, o que o filtro concluiu sobre o
 * gasto real e como isso difere da estimativa por fórmula. Aplicar é uma
 * decisão explícita do usuário.
 */
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowRight, Info, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/query-boundary";
import { errorMessage } from "@/data/supabase-helpers";
import {
  ADAPTIVE_WINDOW_DAYS,
  computeAdaptiveGoals,
  isAdaptiveReady,
  type AdaptiveResult,
} from "@/data/adaptive-goals";
import { macroTargets, type Goal } from "@forja/domain";

const CONFIDENCE_COPY = {
  alta: "Estimativa estável — os dados são consistentes.",
  média: "Estimativa razoável — mais alguns dias de registro vão refiná-la.",
  baixa: "Estimativa ainda instável — continue registrando para melhorá-la.",
} as const;

export function AdaptiveGoalsCard({
  goal,
  fallbackTdee,
  currentKcalTarget,
  onApply,
  isApplying,
}: {
  goal: Goal;
  /** TDEE pela fórmula de Mifflin-St Jeor, para comparação e palpite inicial. */
  fallbackTdee: number;
  currentKcalTarget: number;
  onApply: (kcal: number) => void;
  isApplying?: boolean;
}) {
  const adaptive = useQuery({
    queryKey: ["adaptive-goals", goal, Math.round(fallbackTdee)],
    queryFn: () => computeAdaptiveGoals({ goal, fallbackTdee }),
    // O cálculo varre até 60 dias de dois módulos: não vale refazer a cada foco.
    staleTime: 10 * 60_000,
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="size-4" aria-hidden />
          Metas adaptativas
        </CardTitle>
        {adaptive.data && isAdaptiveReady(adaptive.data) && (
          <Badge variant={adaptive.data.confidence === "alta" ? "default" : "secondary"}>
            confiança {adaptive.data.confidence}
          </Badge>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {adaptive.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ) : adaptive.isError ? (
          <ErrorState message={errorMessage(adaptive.error)} onRetry={adaptive.refetch} compact />
        ) : !isAdaptiveReady(adaptive.data) ? (
          <NotEnoughData missing={adaptive.data.missing} />
        ) : (
          <Ready
            result={adaptive.data}
            fallbackTdee={fallbackTdee}
            currentKcalTarget={currentKcalTarget}
            onApply={onApply}
            isApplying={isApplying}
          />
        )}
      </CardContent>
    </Card>
  );
}

function NotEnoughData({ missing }: { missing: string[] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Ainda não dá para estimar seu gasto energético a partir dos seus dados. Em vez de mostrar um
        número pouco confiável, preferimos esperar. Falta:
      </p>
      <ul className="space-y-1.5 text-sm">
        {missing.map((item) => (
          <li key={item} className="flex items-center gap-2">
            <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
            {item}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Enquanto isso, suas metas seguem o cálculo por fórmula (Mifflin-St Jeor).
      </p>
    </div>
  );
}

function Ready({
  result,
  fallbackTdee,
  currentKcalTarget,
  onApply,
  isApplying,
}: {
  result: AdaptiveResult;
  fallbackTdee: number;
  currentKcalTarget: number;
  onApply: (kcal: number) => void;
  isApplying?: boolean;
}) {
  const diffVsFormula = result.estimatedTdee - Math.round(fallbackTdee);
  const diffVsCurrent = result.suggestedKcal - Math.round(currentKcalTarget);
  const jaAlinhado = Math.abs(diffVsCurrent) <= 50;
  const macros = macroTargets(result.suggestedKcal, result.filteredWeightKg);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-accent/40 p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Gasto diário estimado pelos seus dados
        </p>
        <p className="mt-1 text-3xl font-bold tracking-tight">
          {result.estimatedTdee.toLocaleString("pt-BR")} kcal
        </p>
        {diffVsFormula !== 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            {Math.abs(diffVsFormula)} kcal {diffVsFormula > 0 ? "acima" : "abaixo"} do que a fórmula
            previa ({Math.round(fallbackTdee).toLocaleString("pt-BR")} kcal)
          </p>
        )}
      </div>

      {/* A explicação é a parte mais importante do card. */}
      <div className="space-y-2 text-sm">
        <p className="flex gap-2 text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Nos últimos {ADAPTIVE_WINDOW_DAYS} dias você registrou{" "}
            <b className="text-foreground">{result.weighIns} pesagens</b> e{" "}
            <b className="text-foreground">{result.loggedDays} dias</b> de diário, com média de{" "}
            <b className="text-foreground">
              {result.averageIntakeKcal.toLocaleString("pt-BR")} kcal/dia
            </b>
            . Seu peso real (sem o ruído da balança) está em{" "}
            <b className="text-foreground">{result.filteredWeightKg} kg</b> e vem{" "}
            <TrendLabel value={result.observedWeeklyChangeKg} />. É dessa relação entre o que entrou
            e como o peso respondeu que sai o gasto acima.
          </span>
        </p>
        <p className="text-xs text-muted-foreground">{CONFIDENCE_COPY[result.confidence]}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <MiniStat
          label="Ritmo atual"
          value={formatWeekly(result.observedWeeklyChangeKg)}
          icon={<TrendIcon value={result.observedWeeklyChangeKg} />}
        />
        <MiniStat
          label="Ritmo alvo"
          value={formatWeekly(result.targetWeeklyChangeKg)}
          icon={<TrendIcon value={result.targetWeeklyChangeKg} />}
        />
      </div>

      <div className="rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Meta sugerida</p>
          {!jaAlinhado && (
            <span className="text-xs text-muted-foreground">
              {diffVsCurrent > 0 ? "+" : ""}
              {diffVsCurrent} kcal vs. a meta atual
            </span>
          )}
        </div>
        <p className="mt-1 text-2xl font-bold tracking-tight">
          {result.suggestedKcal.toLocaleString("pt-BR")} kcal
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          P {macros.protein_g} g · C {macros.carbs_g} g · G {macros.fat_g} g · Fibra{" "}
          {macros.fiber_g} g
        </p>

        {jaAlinhado ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Sua meta atual já está alinhada com a estimativa. Nada a ajustar.
          </p>
        ) : (
          <Button
            className="mt-3 w-full"
            onClick={() => onApply(result.suggestedKcal)}
            disabled={isApplying}
          >
            {isApplying ? "Aplicando…" : "Aplicar esta meta"}
            {!isApplying && <ArrowRight className="ml-1.5 size-4" />}
          </Button>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 flex items-center gap-1.5 font-semibold">
        {icon}
        {value}
      </p>
    </div>
  );
}

function TrendIcon({ value }: { value: number }) {
  if (Math.abs(value) < 0.05) return <Minus className="size-4 text-muted-foreground" aria-hidden />;
  return value > 0 ? (
    <TrendingUp className="size-4 text-muted-foreground" aria-hidden />
  ) : (
    <TrendingDown className="size-4 text-muted-foreground" aria-hidden />
  );
}

function TrendLabel({ value }: { value: number }) {
  if (Math.abs(value) < 0.05) return <b className="text-foreground">estável</b>;
  return (
    <b className="text-foreground">
      {value > 0 ? "subindo" : "caindo"} {Math.abs(value).toFixed(2)} kg por semana
    </b>
  );
}

function formatWeekly(value: number): string {
  if (Math.abs(value) < 0.05) return "manter o peso";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)} kg/semana`;
}
