import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Activity, Flame, Ruler, Scale, Target, TrendingDown, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { num, unwrapList, unwrapMaybe } from "@/data/supabase-helpers";
import { queryKeys } from "@/data/query-keys";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toISODate } from "@/lib/date";
import { differenceInCalendarDays, subDays } from "date-fns";
import { bmi, goalProgress, navyBodyFat, weeklyRate } from "@forja/domain";

/**
 * Resumo do progresso.
 *
 * ## O que ele responde
 *
 * "Estou indo bem?" — a pergunta que as três abas de dados brutos (peso,
 * medidas, fotos) não respondem sozinhas. Cada uma mostra números; esta mostra
 * a **leitura** deles.
 *
 * ## Honestidade sobre precisão
 *
 * O IMC não distingue músculo de gordura. O percentual de gordura por
 * circunferências erra de 3 a 4 pontos. O ritmo semanal precisa de quatro
 * pesagens. Nada disso é escondido: cada número vem com a sua ressalva, porque
 * um app que apresenta estimativa como medição é um app em que se para de
 * acreditar assim que a balança discorda.
 */

const BMI_LABELS: Record<string, string> = {
  underweight: "Abaixo do peso",
  normal: "Faixa saudável",
  overweight: "Acima do peso",
  obese_1: "Obesidade grau I",
  obese_2: "Obesidade grau II",
  obese_3: "Obesidade grau III",
};

const WINDOW_DAYS = 30;

export function ProgressOverview() {
  const profile = useQuery({
    queryKey: queryKeys.profile(),
    queryFn: async () =>
      unwrapMaybe("carregar perfil", await supabase.from("profiles").select("*").maybeSingle()),
  });

  const weights = useQuery({
    queryKey: queryKeys.body.weights(WINDOW_DAYS),
    queryFn: async () =>
      unwrapList(
        "carregar peso",
        await supabase
          .from("body_weights")
          .select("log_date, weight_kg")
          .gte("log_date", toISODate(subDays(new Date(), WINDOW_DAYS)))
          .order("log_date"),
      ),
  });

  const measurement = useQuery({
    queryKey: [...queryKeys.body.measurements(), "latest"],
    queryFn: async () =>
      unwrapMaybe(
        "carregar última medida",
        await supabase
          .from("body_measurements")
          .select("log_date, waist_cm, neck_cm, hip_cm, body_fat_pct")
          .order("log_date", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ),
  });

  const goals = useQuery({
    queryKey: queryKeys.goals.list(),
    queryFn: async () =>
      unwrapList(
        "carregar metas",
        await supabase
          .from("goals")
          .select("id, kind, label, metric_key, start_value, target_value, unit, achieved_at")
          .eq("is_active", true)
          .order("created_at"),
      ),
  });

  const carregando = profile.isPending || weights.isPending;

  if (carregando) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  const serie = (weights.data ?? []).map((w) => ({
    date: w.log_date,
    weightKg: num(w.weight_kg),
  }));

  const pesoAtual = serie.at(-1)?.weightKg;
  const alturaCm = num(profile.data?.height_cm);
  const metaPeso = profile.data?.goal_weight_kg ? num(profile.data.goal_weight_kg) : null;

  const imc = pesoAtual && alturaCm ? bmi(pesoAtual, alturaCm) : null;

  // Índice em dias desde a primeira pesagem: a regressão precisa do espaçamento
  // real, não da posição na lista (pesagens não são diárias).
  const primeiraData = serie[0]?.date;
  const ritmo = primeiraData
    ? weeklyRate(
        serie.map((p) => ({
          dayIndex: differenceInCalendarDays(
            new Date(`${p.date}T12:00:00`),
            new Date(`${primeiraData}T12:00:00`),
          ),
          weightKg: p.weightKg,
        })),
      )
    : null;

  const medida = measurement.data;
  const gorduraEstimada =
    medida && alturaCm && medida.waist_cm && medida.neck_cm
      ? navyBodyFat({
          sex: (profile.data?.sex ?? "other") as "male" | "female" | "other",
          heightCm: alturaCm,
          neckCm: num(medida.neck_cm),
          waistCm: num(medida.waist_cm),
          ...(medida.hip_cm ? { hipCm: num(medida.hip_cm) } : {}),
        })
      : null;

  // A medida registrada à mão tem prioridade sobre a estimada: quem fez
  // bioimpedância ou dobras tem um número melhor que o nosso.
  const gordura = medida?.body_fat_pct ? num(medida.body_fat_pct) : gorduraEstimada;
  const gorduraEhEstimativa = !medida?.body_fat_pct && gorduraEstimada !== null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={<Scale className="size-4" />}
          label="Peso atual"
          value={pesoAtual !== undefined ? `${pesoAtual.toFixed(1)}` : "—"}
          unit="kg"
        />

        <StatCard
          icon={
            ritmo !== null && ritmo < 0 ? (
              <TrendingDown className="size-4" />
            ) : (
              <TrendingUp className="size-4" />
            )
          }
          label="Ritmo"
          value={ritmo !== null ? `${ritmo > 0 ? "+" : ""}${ritmo.toFixed(2)}` : "—"}
          unit="kg/sem"
          hint={ritmo === null ? "4 pesagens" : undefined}
        />

        <StatCard
          icon={<Activity className="size-4" />}
          label="IMC"
          value={imc ? String(imc.bmi) : "—"}
          hint={imc ? BMI_LABELS[imc.category] : "informe a altura"}
        />

        <StatCard
          icon={<Flame className="size-4" />}
          label="Gordura"
          value={gordura !== null ? gordura.toFixed(1) : "—"}
          unit="%"
          hint={
            gordura === null
              ? "meça cintura e pescoço"
              : gorduraEhEstimativa
                ? "estimativa"
                : "medido"
          }
        />
      </div>

      {imc && (
        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          O IMC não distingue músculo de gordura — quem treina há anos costuma aparecer acima da
          faixa mesmo com pouca gordura. As medidas de circunferência dizem mais sobre a sua
          composição do que o peso sozinho.
        </p>
      )}

      {gorduraEhEstimativa && (
        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          O percentual de gordura é estimado a partir das circunferências, com margem de 3 a 4
          pontos. Medido sempre do mesmo jeito, o erro é constante — então a <em>variação</em> é
          confiável mesmo que o valor absoluto não seja.
        </p>
      )}

      {/* Meta de peso */}
      {metaPeso !== null && pesoAtual !== undefined && serie[0] && (
        <GoalCard
          label={metaPeso < pesoAtual ? "Chegar ao peso desejado" : "Ganhar até a meta"}
          start={serie[0].weightKg}
          current={pesoAtual}
          target={metaPeso}
          unit="kg"
          rate={ritmo}
        />
      )}

      {/* Demais metas */}
      {(goals.data ?? []).filter((g) => g.metric_key !== "body_weight").length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Target className="size-3.5" aria-hidden />
            Suas metas
          </h3>
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {(goals.data ?? [])
                .filter((g) => g.metric_key !== "body_weight")
                .map((g) => (
                  <div key={g.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="min-w-0 truncate text-sm">{g.label}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {num(g.target_value)} {g.unit}
                    </span>
                  </div>
                ))}
            </CardContent>
          </Card>
        </section>
      )}

      {!medida && (
        <Card className="border-dashed">
          <CardContent className="p-4 text-center">
            <span className="mx-auto grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
              <Ruler className="size-5" aria-hidden />
            </span>
            <p className="mt-2 text-sm font-medium">Registre suas medidas</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Cintura e pescoço destravam a estimativa de gordura corporal — e a cintura é o número
              que melhor acompanha a mudança de composição.
            </p>
          </CardContent>
        </Card>
      )}

      <Button asChild variant="ghost" className="w-full text-muted-foreground">
        <Link to="/workouts">Ver progressão de cargas nos treinos</Link>
      </Button>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  unit,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-3.5">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <span aria-hidden>{icon}</span>
          <span className="text-[11px] font-medium uppercase tracking-wider">{label}</span>
        </div>
        <p className="mt-2 text-2xl font-bold leading-none tracking-tight tabular-nums">
          {value}
          {unit && value !== "—" && (
            <span className="ml-1 text-sm font-medium text-muted-foreground">{unit}</span>
          )}
        </p>
        {hint && <p className="mt-1 truncate text-[11px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * Progresso rumo à meta de peso.
 *
 * A previsão de chegada só aparece quando o ritmo aponta na direção certa.
 * Dizer "faltam 340 semanas" para quem está indo para o lado oposto é
 * matematicamente correto e inútil — pior, desmotivador sem informar nada.
 */
function GoalCard({
  label,
  start,
  current,
  target,
  unit,
  rate,
}: {
  label: string;
  start: number;
  current: number;
  target: number;
  unit: string;
  rate: number | null;
}) {
  const progresso = goalProgress(start, current, target);
  const pct = Math.min(100, progresso.ratio * 100);

  const direcaoCerta =
    rate !== null && Math.abs(rate) > 0.05 && Math.sign(target - current) === Math.sign(rate);
  const semanas = direcaoCerta ? Math.ceil(Math.abs((target - current) / rate!)) : null;

  return (
    <Card className={cn(progresso.achieved && "border-primary/30 bg-primary/5")}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold leading-tight">{label}</p>
            <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
              {start.toFixed(1)} → {current.toFixed(1)} de {target.toFixed(1)} {unit}
            </p>
          </div>
          {progresso.achieved ? (
            <Badge className="shrink-0">Atingida</Badge>
          ) : (
            <span className="shrink-0 text-lg font-bold tabular-nums">{Math.round(pct)}%</span>
          )}
        </div>

        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={`${label}: ${Math.round(pct)}%`}
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full transition-[width] duration-700 ease-out"
            style={{ width: `${pct}%`, background: "var(--gradient-primary)" }}
          />
        </div>

        {!progresso.achieved && (
          <p className="mt-2 text-xs text-muted-foreground">
            Faltam{" "}
            <span className="font-medium tabular-nums text-foreground">
              {progresso.remaining} {unit}
            </span>
            {semanas !== null && semanas <= 104 && (
              <>
                {" "}
                — cerca de {semanas} {semanas === 1 ? "semana" : "semanas"} no ritmo atual
              </>
            )}
            .
          </p>
        )}
      </CardContent>
    </Card>
  );
}
