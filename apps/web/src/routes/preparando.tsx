import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/data/supabase-helpers";
import {
  GENERATION_STAGES,
  generateEverything,
  hasCompletedOnboarding,
  type GenerationStage,
} from "@/data/onboarding";
import { clearDraft, clearStep, loadDraft } from "@/lib/onboarding/storage";
import { isComplete } from "@/lib/onboarding/schema";

/**
 * A tela onde o plano é montado.
 *
 * É o momento de maior valor percebido do app inteiro — e o único em que a
 * espera é aceitável, porque algo está de fato sendo construído. Mostrar **o
 * que** está acontecendo, etapa por etapa, transforma cinco segundos de
 * carregamento em cinco segundos de expectativa.
 *
 * As etapas exibidas são as reais: cada uma acende quando a operação
 * correspondente termina no banco, não por temporizador. Uma barra falsa que
 * enche sozinha enquanto a requisição trava é a forma mais rápida de ensinar o
 * usuário a não confiar no que o app diz.
 */
export const Route = createFileRoute("/preparando")({
  head: () => ({
    meta: [{ title: "Montando seu plano — Habitual Fit" }, { name: "robots", content: "noindex" }],
  }),
  ssr: false,
  component: PreparingPage,
});

const STAGE_LABELS: Record<GenerationStage, string> = {
  profile: "Analisando seu perfil",
  goals: "Calculando suas metas",
  workout: "Montando seu treino",
  diet: "Montando seu cardápio",
  done: "Finalizando",
};

type Status = "checking" | "generating" | "done" | "error";

function PreparingPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [status, setStatus] = useState<Status>("checking");
  const [stage, setStage] = useState<GenerationStage>("profile");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

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
      const answers = loadDraft();
      if (!isComplete(answers)) return void navigate({ to: "/", replace: true });

      setStatus("generating");
      try {
        const result = await generateEverything(user.id, answers, (p) => setStage(p.stage));
        setWarnings(result.warnings);

        // O rascunho cumpriu seu papel; mantê-lo faria o questionário reaparecer
        // preenchido se o usuário voltasse à raiz.
        clearDraft();
        clearStep();
        await qc.invalidateQueries();

        setStatus("done");
        // Sem avisos não há o que ler: ir direto é mais respeitoso que exigir
        // um clique para confirmar que deu certo.
        if (result.warnings.length === 0) {
          window.setTimeout(() => void navigate({ to: "/dashboard", replace: true }), 900);
        }
      } catch (e) {
        setError(errorMessage(e));
        setStatus("error");
      }
    })();
  }, [navigate, qc]);

  return (
    <div className="grid min-h-dvh place-items-center bg-background px-6">
      <div className="w-full max-w-sm">
        {status === "error" ? (
          <ErrorState
            message={error}
            onRetry={() => {
              started.current = false;
              setStatus("checking");
              setError(null);
              // Remonta o efeito recarregando: mais previsível que reconstruir
              // o estado interno à mão numa tela que roda uma vez só.
              window.location.reload();
            }}
          />
        ) : (
          <Building
            stage={stage}
            done={status === "done"}
            warnings={warnings}
            onContinue={() => void navigate({ to: "/dashboard", replace: true })}
          />
        )}
      </div>
    </div>
  );
}

function Building({
  stage,
  done,
  warnings,
  onContinue,
}: {
  stage: GenerationStage;
  done: boolean;
  warnings: string[];
  onContinue: () => void;
}) {
  const atual = GENERATION_STAGES.indexOf(stage);

  return (
    <div className="text-center">
      <span
        className={cn(
          "mx-auto grid size-20 place-items-center rounded-3xl transition-transform duration-500",
          done && "scale-110",
        )}
        style={{ background: "var(--gradient-primary)" }}
        aria-hidden
      >
        {done ? (
          <Check className="size-10 text-primary-foreground" strokeWidth={3} />
        ) : (
          <Sparkles className="size-9 animate-pulse text-primary-foreground" />
        )}
      </span>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">
        {done ? "Seu plano está pronto" : "Montando seu plano"}
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {done ? "Bom treino." : "Leva só alguns segundos."}
      </p>

      <ul className="mt-8 space-y-3 text-left" aria-live="polite">
        {GENERATION_STAGES.filter((s) => s !== "done").map((s, i) => {
          const concluida = done || i < atual;
          const ativa = !done && i === atual;
          return (
            <li key={s} className="flex items-center gap-3 text-sm">
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full transition-colors duration-300",
                  concluida
                    ? "bg-primary text-primary-foreground"
                    : ativa
                      ? "bg-primary/15"
                      : "bg-muted",
                )}
                aria-hidden
              >
                {concluida ? (
                  <Check className="size-4" strokeWidth={3} />
                ) : ativa ? (
                  <Loader2 className="size-4 animate-spin text-primary" />
                ) : null}
              </span>
              <span
                className={cn(
                  "transition-colors",
                  concluida || ativa ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {STAGE_LABELS[s]}
              </span>
            </li>
          );
        })}
      </ul>

      {done && warnings.length > 0 && (
        <div className="mt-8 rounded-2xl border border-border bg-muted/40 p-4 text-left">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="size-4 shrink-0 text-chart-4" aria-hidden />
            Vale saber
          </p>
          <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {done && (
        <Button
          size="lg"
          className="mt-6 h-14 w-full rounded-2xl text-base font-semibold"
          onClick={onContinue}
        >
          Ver meu plano
        </Button>
      )}
    </div>
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
