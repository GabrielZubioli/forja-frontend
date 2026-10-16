import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Dumbbell,
  Flag,
  Loader2,
  Moon,
  User,
  Utensils,
} from "lucide-react";
import { WEEKDAY_LABELS, type Weekday } from "@forja/domain";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BrandSymbol } from "@/components/brand-logo";
import { RoutineIcon } from "@/components/workouts/routine-icon";
import { AvisoProfissional } from "@/components/aviso-profissional";
import { cn } from "@/lib/utils";
import { errorMessage, num, unwrapMaybe } from "@/data/supabase-helpers";
import { queryKeys } from "@/data/query-keys";
import { fetchWorkoutWeek } from "@/data/workout-week";
import { fetchActiveMealPlan } from "@/data/meal-plans";
import { splitDisplayName, startWithoutPlan } from "@/data/routines";
import {
  GENERATION_STAGES,
  generateEverything,
  hasCompletedOnboarding,
  type GenerationStage,
} from "@/data/onboarding";
import { clearDraft, clearStep, loadDraft } from "@/lib/onboarding/storage";
import { isComplete, type Answers } from "@/lib/onboarding/schema";
import { derivedObjective } from "@/lib/onboarding/options";
import { MEAL_LABELS, label } from "@/lib/labels";

/**
 * A tela onde o plano é montado — e depois apresentado.
 *
 * É o momento de maior valor percebido do app inteiro, e o único em que a
 * espera é aceitável, porque algo está de fato sendo construído. As etapas
 * exibidas são as reais: cada uma acende quando a operação correspondente
 * termina no banco, não por temporizador.
 *
 * Pronto, a tela mostra **o que** foi preparado — a semana de treino (ou o
 * plano em branco) e as refeições vazias — antes de levar ao app.
 *
 * Ali a pessoa decide: segue com o plano sugerido ("Ir para o app") ou começa
 * sem um plano — o sugerido é trocado por um em branco.
 */
export const Route = createFileRoute("/preparando")({
  head: () => ({
    meta: [{ title: "Montando seu plano — Habitual Fit" }, { name: "robots", content: "noindex" }],
  }),
  ssr: false,
  component: PreparingPage,
});

/** Etapas visíveis (sem a "done", que é o próprio fim). */
const ETAPAS: { stage: GenerationStage; titulo: string; detalhe: string; icon: typeof User }[] = [
  {
    stage: "profile",
    titulo: "Salvando seu perfil",
    detalhe: "Objetivo, experiência e rotina de treino",
    icon: User,
  },
  {
    stage: "workout",
    titulo: "Preparando seu treino",
    detalhe: "Os exercícios e os dias da sua semana",
    icon: Dumbbell,
  },
  {
    stage: "diet",
    titulo: "Criando suas refeições",
    detalhe: "Vazias, prontas para você preencher",
    icon: Utensils,
  },
];

/** Tempo mínimo na tela de montagem: rápido demais parece que nada aconteceu. */
const MONTAGEM_MIN_MS = 3200;

type Status = "checking" | "generating" | "done" | "error";

function PreparingPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [status, setStatus] = useState<Status>("checking");
  const [stage, setStage] = useState<GenerationStage>("profile");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [routineId, setRoutineId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Answers | null>(null);

  // Em React 19 com StrictMode o efeito roda duas vezes em desenvolvimento.
  // Sem a trava, a geração dispararia duas vezes e criaria duas rotinas.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;

      // Sem sessão: o cadastro é o pré-requisito desta tela.
      if (!user) return void navigate({ to: "/criar-conta", replace: true });

      // Já gerado: entrar de novo aqui (link antigo, refresh) não pode
      // sobrescrever o plano que a pessoa já vem usando.
      if (await hasCompletedOnboarding()) {
        return void navigate({ to: "/dashboard", replace: true });
      }

      // Sem respostas (primeiro login com Google, outro aparelho, dados
      // limpos): o questionário é o que falta, então vai direto para ele.
      const draft = loadDraft();
      if (!isComplete(draft)) return void navigate({ to: "/", replace: true });

      setAnswers(draft);
      setStatus("generating");
      const inicio = Date.now();
      try {
        const result = await generateEverything(user.id, draft, (p) => setStage(p.stage));
        setWarnings(result.warnings);
        setRoutineId(result.routineId);

        // O rascunho cumpriu seu papel; mantê-lo faria o questionário reaparecer
        // preenchido se o usuário voltasse à raiz.
        clearDraft();
        clearStep();
        await qc.invalidateQueries();

        const falta = MONTAGEM_MIN_MS - (Date.now() - inicio);
        if (falta > 0) await new Promise((r) => window.setTimeout(r, falta));
        setStage("done");
        await new Promise((r) => window.setTimeout(r, 700));
        setStatus("done");
      } catch (e) {
        setError(errorMessage(e));
        setStatus("error");
      }
    })();
  }, [navigate, qc]);

  if (status === "done") {
    return (
      <PlanReady
        answers={answers}
        routineId={routineId}
        warnings={warnings}
        onContinue={() => void navigate({ to: "/dashboard", replace: true })}
      />
    );
  }

  return (
    <div className="grid min-h-dvh place-items-center overflow-hidden bg-background px-6">
      <div className="w-full max-w-sm">
        {status === "error" ? (
          <ErrorState
            message={error}
            onRetry={() => {
              // Remonta o efeito recarregando: mais previsível que reconstruir
              // o estado interno à mão numa tela que roda uma vez só.
              window.location.reload();
            }}
          />
        ) : (
          <Building stage={stage} />
        )}
      </div>
    </div>
  );
}

// ─── Montagem ────────────────────────────────────────────────────────────────

function Building({ stage }: { stage: GenerationStage }) {
  const idx = GENERATION_STAGES.indexOf(stage);
  const pronto = stage === "done";
  // Meia etapa adiantada: o anel anda enquanto a etapa acontece, não só no fim.
  const progresso = pronto ? 1 : Math.min(0.95, (idx + 0.5) / ETAPAS.length);
  const atual = ETAPAS[Math.min(idx, ETAPAS.length - 1)]!;

  const R = 84;
  const C = 2 * Math.PI * R;

  return (
    <div className="text-center" role="status" aria-live="polite">
      {/* O símbolo dentro do anel de progresso. */}
      <div className="relative mx-auto size-56">
        <div
          className="animate-breathe absolute inset-10 rounded-full bg-primary/30 blur-2xl"
          aria-hidden
        />
        <svg viewBox="0 0 200 200" className="absolute inset-0 -rotate-90" aria-hidden>
          <circle cx="100" cy="100" r={R} fill="none" stroke="var(--elevated)" strokeWidth="6" />
          <circle
            cx="100"
            cy="100"
            r={R}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - progresso)}
            style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1)" }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          {pronto ? (
            <span className="animate-pop grid size-24 place-items-center rounded-full bg-primary text-primary-foreground">
              <Check className="size-12" strokeWidth={3} aria-hidden />
            </span>
          ) : (
            <BrandSymbol className="animate-float w-24" />
          )}
        </div>
      </div>

      <h1 className="mt-8 text-[1.75rem] font-extrabold leading-tight tracking-tight">
        {pronto ? "Plano pronto!" : "Montando seu plano"}
      </h1>
      <p
        key={atual.stage + String(pronto)}
        className="mt-2 h-5 text-muted-foreground animate-in fade-in slide-in-from-bottom-1 duration-500"
      >
        {pronto ? "Preparando o resumo para você" : atual.detalhe}
      </p>

      <ol className="mt-8 space-y-2 text-left">
        {ETAPAS.map((e, i) => {
          const feita = pronto || i < idx;
          const ativa = !pronto && i === idx;
          return (
            <li
              key={e.stage}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-4 py-3 transition-all duration-500",
                ativa ? "bg-card" : "bg-transparent",
              )}
            >
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-xl transition-colors duration-500",
                  feita
                    ? "bg-primary text-primary-foreground"
                    : ativa
                      ? "bg-primary/15 text-primary"
                      : "bg-elevated text-muted-foreground",
                )}
                aria-hidden
              >
                {feita ? (
                  <Check className="size-5" strokeWidth={3} />
                ) : (
                  <e.icon className="size-5" />
                )}
              </span>
              <span
                className={cn(
                  "flex-1 font-medium transition-colors duration-500",
                  feita || ativa ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {e.titulo}
              </span>
              {ativa && (
                <span className="flex gap-1" aria-hidden>
                  {[0, 1, 2].map((d) => (
                    <span
                      key={d}
                      className="size-1.5 animate-bounce rounded-full bg-primary"
                      style={{ animationDelay: `${d * 150}ms` }}
                    />
                  ))}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ─── Plano pronto ────────────────────────────────────────────────────────────

/** Segunda primeiro. */
const ORDEM_SEMANA: Weekday[] = [1, 2, 3, 4, 5, 6, 0];
const fmt = (n: number) => Math.round(n).toLocaleString("pt-BR");
const kg = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/** Entrada em sequência: cada seção chega um pouco depois da anterior. */
const entra = (i: number): { className: string; style: CSSProperties } => ({
  className: "animate-in fade-in slide-in-from-bottom-4 fill-mode-backwards duration-700 ease-out",
  style: { animationDelay: `${120 + i * 110}ms` },
});

function PlanReady({
  answers,
  routineId,
  warnings,
  onContinue,
}: {
  answers: Answers | null;
  /** O plano sugerido recém-criado — descartado em "Começar sem um plano". */
  routineId: string | null;
  warnings: string[];
  onContinue: () => void;
}) {
  const profile = useQuery({
    queryKey: queryKeys.profile(),
    queryFn: async () =>
      unwrapMaybe("carregar perfil", await supabase.from("profiles").select("*").maybeSingle()),
  });
  const semana = useQuery({
    queryKey: [...queryKeys.workouts.all, "week"],
    queryFn: fetchWorkoutWeek,
  });
  const cardapio = useQuery({
    queryKey: queryKeys.diet.activePlan(),
    queryFn: fetchActiveMealPlan,
  });

  // Sem o sugerido: plano em branco e direto para a tela Plano montar o seu.
  const qc = useQueryClient();
  const navigate = useNavigate();
  const semPlano = useMutation({
    mutationFn: async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("Sessão expirada. Entre de novo.");
      await startWithoutPlan(data.user.id, routineId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries();
      void navigate({ to: "/plan", replace: true });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const p = profile.data;
  const objetivo = answers ? derivedObjective(answers) : null;
  const nome = p?.display_name?.trim().split(/\s+/)[0];
  const pesoAtual = answers?.weightKg ?? null;
  const pesoMeta = p?.goal_weight_kg != null ? num(p.goal_weight_kg) : null;
  const splits = semana.data?.splits ?? [];
  const diasTreino = splits.reduce((n, s) => n + s.weekdays.length, 0);

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto w-full max-w-md px-4 pb-36 pt-10">
        {/* Abertura */}
        <header className={cn("relative text-center", entra(0).className)} style={entra(0).style}>
          <div
            className="pointer-events-none absolute left-1/2 top-0 size-48 -translate-x-1/2 rounded-full bg-primary/25 blur-3xl"
            aria-hidden
          />
          <BrandSymbol className="animate-pop relative mx-auto w-20" />
          <h1 className="relative mt-6 text-[2.25rem] font-extrabold leading-[1.05] tracking-tight">
            {nome ? `${nome}, seu plano está pronto` : "Seu plano está pronto"}
          </h1>
          <p className="relative mt-3 text-muted-foreground">
            Seu treino foi montado a partir das suas respostas.
          </p>
          <div className="relative mt-4 flex flex-wrap justify-center gap-2">
            {objetivo && (
              <span className="rounded-full bg-primary/15 px-3 py-1.5 text-sm font-semibold text-primary">
                {objetivo.emoji} {objetivo.label}
              </span>
            )}
            {diasTreino > 0 && (
              <span className="rounded-full bg-card px-3 py-1.5 text-sm text-muted-foreground">
                {diasTreino}× por semana
              </span>
            )}
          </div>
        </header>

        {/* Peso */}
        {pesoAtual && pesoMeta && Math.abs(pesoAtual - pesoMeta) >= 0.1 && (
          <Secao titulo="Sua jornada" i={2}>
            <div className="flex items-center gap-4 rounded-[1.5rem] bg-card p-5">
              <div className="text-center">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Hoje</p>
                <p className="text-2xl font-extrabold tabular-nums">
                  {kg(pesoAtual)}
                  <span className="text-sm font-semibold text-muted-foreground"> kg</span>
                </p>
              </div>
              <div className="flex flex-1 items-center" aria-hidden>
                <span className="h-0 flex-1 border-t-2 border-dashed border-primary/50" />
                <ArrowRight className="-ml-1 size-5 text-primary" />
              </div>
              <div className="text-center">
                <p className="flex items-center justify-center gap-1 text-xs uppercase tracking-wide text-primary">
                  <Flag className="size-3" aria-hidden />
                  Meta
                </p>
                <p className="text-2xl font-extrabold tabular-nums">
                  {kg(pesoMeta)}
                  <span className="text-sm font-semibold text-muted-foreground"> kg</span>
                </p>
              </div>
            </div>
          </Secao>
        )}

        {/* Treino */}
        <Secao titulo="Sua semana de treino" i={3}>
          {semana.isPending ? (
            <Skeleton className="h-64 rounded-[1.5rem]" />
          ) : splits.length === 0 ? (
            <Vazio texto="Não conseguimos montar o treino agora. Na tela Plano você pode tentar de novo ou montar o seu." />
          ) : (
            <>
              <ol className="grid grid-cols-7 gap-1.5 rounded-[1.5rem] bg-card p-3">
                {ORDEM_SEMANA.map((dia) => {
                  const doDia = splits.filter((s) => s.weekdays.includes(dia));
                  const s = doDia[0];
                  return (
                    <li key={dia} className="flex flex-col items-center gap-1.5">
                      <span className="text-[11px] font-medium uppercase text-muted-foreground">
                        {WEEKDAY_LABELS[dia].slice(0, 3)}
                      </span>
                      {s ? (
                        <RoutineIcon
                          icon={s.icon}
                          name={s.name}
                          className="size-10 rounded-xl [&>svg]:size-5"
                        />
                      ) : (
                        <span className="grid size-10 place-items-center rounded-xl bg-elevated text-muted-foreground">
                          <Moon className="size-4" aria-label="descanso" />
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
              <ul className="mt-3 space-y-3">
                {splits.map((s) => (
                  <li key={s.templateId} className="rounded-[1.5rem] bg-card p-4">
                    <div className="flex items-center gap-3">
                      <RoutineIcon icon={s.icon} name={s.name} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-lg font-bold">{splitDisplayName(s.name)}</p>
                        <p className="text-sm text-muted-foreground">
                          {[...s.weekdays]
                            .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
                            .map((d) => WEEKDAY_LABELS[d as Weekday].slice(0, 3))
                            .join(" · ") || "Sem dia fixo"}
                          {" · "}
                          {s.exercises.length} exercícios
                        </p>
                      </div>
                    </div>
                    <ul className="mt-3 space-y-1.5 border-t border-border/60 pt-3">
                      {s.exercises.slice(0, 4).map((e) => (
                        <li
                          key={e.itemId}
                          className="flex items-center justify-between gap-3 text-sm"
                        >
                          <span className="truncate">{e.name}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {e.targetSets} ×{" "}
                            {e.targetRepMin && e.targetRepMax
                              ? `${e.targetRepMin}–${e.targetRepMax}`
                              : e.targetReps}
                          </span>
                        </li>
                      ))}
                      {s.exercises.length > 4 && (
                        <li className="text-sm text-primary">
                          + {s.exercises.length - 4} exercícios
                        </li>
                      )}
                    </ul>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Secao>

        {/* Refeições */}
        <Secao titulo="Suas refeições" i={4}>
          {cardapio.isPending ? (
            <Skeleton className="h-40 rounded-[1.5rem]" />
          ) : !cardapio.data || cardapio.data.meals.length === 0 ? (
            <Vazio texto="Suas refeições aparecem na tela Dieta, prontas para você preencher." />
          ) : (
            <>
              <ul className="divide-y divide-border/60 rounded-[1.5rem] bg-card">
                {cardapio.data.meals.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 px-5 py-3.5">
                    <Utensils className="size-4 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0 flex-1 font-semibold">
                      {m.label?.trim() || label(MEAL_LABELS, m.slot)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {m.items.length === 0 ? "vazia" : `${m.items.length} itens`}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 px-1 text-sm text-muted-foreground">
                Dê nomes, horários e adicione os alimentos na tela Dieta — por conta própria ou com
                a orientação de um nutricionista.
              </p>
            </>
          )}
        </Secao>

        <AvisoProfissional tipos={["treino", "dieta"]} className={cn("mt-6", entra(5).className)} />

        {warnings.length > 0 && (
          <div
            className={cn(
              "mt-6 rounded-[1.5rem] border border-border bg-card p-4",
              entra(5).className,
            )}
            style={entra(5).style}
          >
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
              Vale saber
            </p>
            <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <p
          className={cn("mt-6 text-center text-sm text-muted-foreground", entra(6).className)}
          style={entra(6).style}
        >
          Tudo isso pode ser ajustado depois, no Plano e na Dieta.
        </p>
      </div>

      {/* O botão fica sempre à mão, por cima do fim da página. */}
      <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/95 to-transparent px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-10">
        <div className="mx-auto max-w-md">
          <Button
            size="lg"
            className="h-14 w-full rounded-2xl text-lg font-bold shadow-lg shadow-primary/25 animate-in fade-in slide-in-from-bottom-4 fill-mode-backwards delay-700 duration-700"
            onClick={onContinue}
            disabled={semPlano.isPending}
          >
            Ir para o app
            <ArrowRight className="ml-1 size-5" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            className="mt-1 h-11 w-full rounded-2xl font-semibold text-muted-foreground animate-in fade-in fill-mode-backwards delay-700 duration-700"
            onClick={() => semPlano.mutate()}
            disabled={semPlano.isPending}
          >
            {semPlano.isPending && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
            Começar sem um plano
          </Button>
        </div>
      </div>
    </div>
  );
}

function Secao({ titulo, i, children }: { titulo: string; i: number; children: ReactNode }) {
  const { className, style } = entra(i);
  return (
    <section className={cn("mt-8", className)} style={style} aria-label={titulo}>
      <h2 className="mb-3 px-1 text-lg font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}

function Vazio({ texto }: { texto: string }) {
  return (
    <p className="rounded-[1.5rem] bg-card p-5 text-center text-sm text-muted-foreground">
      {texto}
    </p>
  );
}

function ErrorState({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <div className="text-center">
      <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertTriangle className="size-8" aria-hidden />
      </span>
      <h1 className="mt-6 text-xl font-bold tracking-tight">Não conseguimos montar seu plano</h1>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      <p className="mt-4 text-sm text-muted-foreground">
        Sua conta foi criada e suas respostas estão salvas — nada se perdeu.
      </p>
      <Button className="mt-6 h-12 w-full rounded-xl" onClick={onRetry}>
        Tentar de novo
      </Button>
    </div>
  );
}
