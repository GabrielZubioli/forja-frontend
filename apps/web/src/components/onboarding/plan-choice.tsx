/**
 * Fim do questionário: a prévia do plano de treino sugerido e a escolha entre
 * segui-lo ou montar o próprio, do zero. Os avisos de orientação profissional
 * vêm antes dos botões — a pessoa os lê antes de decidir.
 */
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, PencilRuler, Sparkles } from "lucide-react";
import { WEEKDAY_LABELS, type Weekday } from "@forja/domain";
import { buildSuggestedRoutine, rememberAcceptedDraft } from "@/data/onboarding";
import { suggestWeekdays } from "@/lib/onboarding/options";
import type { Answers } from "@/lib/onboarding/schema";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AvisoProfissional } from "@/components/aviso-profissional";
import { ErrorState } from "@/components/query-boundary";

export function PlanChoice({ answers }: { answers: Answers }) {
  const navigate = useNavigate();
  const draft = useQuery({
    queryKey: ["plano-sugerido", JSON.stringify(answers)],
    queryFn: () => buildSuggestedRoutine(answers),
    staleTime: Infinity,
  });

  // Mesma distribuição que a gravação usa: os dias de treino vão para as
  // divisões em sequência (A no 1º dia, B no 2º, … e de novo A).
  const dias = [
    ...(answers.weekdays.length ? answers.weekdays : suggestWeekdays(answers.daysPerWeek ?? 3)),
  ].sort((a, b) => a - b);
  const splits = draft.data?.splits ?? [];
  const diasDa = (i: number) =>
    dias
      .filter((_, k) => k % splits.length === i)
      .map((d) => WEEKDAY_LABELS[d as Weekday].slice(0, 3))
      .join(" · ");

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <h1 className="text-balance text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
          Seu plano de treino sugerido
        </h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          Montado com as suas respostas. Siga com ele ou monte o seu do zero.
        </p>
      </div>

      {draft.isPending ? (
        <div className="space-y-2.5" role="status" aria-label="Montando a prévia">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-[1.25rem]" />
          ))}
        </div>
      ) : draft.isError ? (
        <ErrorState
          message="Não conseguimos montar a prévia agora."
          onRetry={draft.refetch}
          compact
        />
      ) : (
        <ul className="space-y-2.5" aria-label="Divisões do plano sugerido">
          {splits.map((s, i) => (
            <li key={s.letter} className="rounded-[1.25rem] bg-card p-4">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-lg font-extrabold text-primary">
                  {s.letter}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words font-semibold leading-snug">{s.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {diasDa(i) || "Sem dia fixo"} · {s.items.length}{" "}
                    {s.items.length === 1 ? "exercício" : "exercícios"}
                  </p>
                </div>
              </div>
              <ul className="mt-3 space-y-1 border-t border-border/60 pt-3 text-sm">
                {s.items.map((it, k) => (
                  <li key={k} className="break-words text-muted-foreground">
                    {it.exercise.name}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <AvisoProfissional tipos={["treino", "dieta", "app"]} className="mt-5" />

      <div className="mt-5 space-y-2.5 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button
          size="lg"
          className="h-14 w-full rounded-2xl text-base font-semibold"
          disabled={!draft.data}
          onClick={() => {
            rememberAcceptedDraft(draft.data ?? null);
            void navigate({ to: "/preparando", search: { plano: "sugerido" } });
          }}
        >
          {draft.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 size-4" aria-hidden />
          )}
          Seguir com o plano sugerido
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-14 w-full rounded-2xl text-base font-semibold"
          onClick={() => {
            rememberAcceptedDraft(null);
            void navigate({ to: "/preparando", search: { plano: "manual" } });
          }}
        >
          <PencilRuler className="mr-2 size-4" aria-hidden />
          Montar meu próprio plano
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Você pode mudar de ideia depois, na tela Plano.
        </p>
      </div>
    </div>
  );
}
