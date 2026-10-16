import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowUp, Loader2, Lock, User, Zap } from "lucide-react";
import { COACH_FAQ, answerFaq, type FaqKey } from "@/data/coach-faq";
import { errorMessage } from "@/data/supabase-helpers";
import { CoachIcon } from "@/components/coach/coach-icon";
import { PageBody, PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/data/coach-chat";

/**
 * Treinador: perguntas prontas respondidas com os dados da pessoa (ver
 * `data/coach-faq.ts`), sem IA. O campo de pergunta livre fica visível e
 * bloqueado, avisando que ainda não existe — melhor que esconder e a pessoa
 * não saber que pode vir.
 */
export const Route = createFileRoute("/_authenticated/coach")({
  head: () => ({
    meta: [
      { title: "Treinador — Habitual Fit" },
      { name: "description", content: "Tire dúvidas sobre treino e alimentação." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CoachPage,
});


function CoachPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const lista = useRef<HTMLDivElement>(null);
  const barra = useRef<HTMLDivElement>(null);
  const [altura, setAltura] = useState<number>();

  /**
   * A conversa rola sozinha, numa área que termina exatamente onde começa a
   * barra fixa (perguntas rápidas + campo). Assim nenhuma mensagem passa por
   * baixo dela. A altura acompanha a barra e a tela.
   */
  useLayoutEffect(() => {
    const medir = () => {
      const topo = lista.current?.getBoundingClientRect().top;
      const fim = barra.current?.getBoundingClientRect().top;
      if (topo !== undefined && fim !== undefined) setAltura(Math.max(160, fim - topo - 8));
    };
    medir();
    const obs = new ResizeObserver(medir);
    if (barra.current) obs.observe(barra.current);
    window.addEventListener("resize", medir);
    return () => {
      obs.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, []);

  // Nova mensagem: rola a conversa (não a página) até o fim.
  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  /** Pergunta pronta: a resposta sai dos dados da pessoa, sem IA. */
  const [respondendo, setRespondendo] = useState(false);
  const perguntar = async (key: FaqKey) => {
    if (respondendo) return;
    const pergunta = COACH_FAQ.find((q) => q.key === key)!.pergunta;
    const agora = () => new Date().toISOString();
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", content: pergunta, createdAt: agora() }]);
    setRespondendo(true);
    try {
      const resposta = await answerFaq(key);
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "assistant", content: resposta, createdAt: agora() },
      ]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRespondendo(false);
    }
  };

  return (
    <>
      <PageHeader title="Treinador" description="Tire dúvidas sobre treino e alimentação." />

      <PageBody>
        <div>
          <div
            ref={lista}
            className="space-y-4 overflow-y-auto overscroll-contain pb-4 [scrollbar-width:none]"
            style={{ height: altura }}
          >
            {messages.length === 0 ? (
              <Welcome onPick={perguntar} />
            ) : (
              messages.map((m) => <Bubble key={m.id} message={m} />)
            )}

            {respondendo && (
              <div className="flex gap-3">
                <Avatar role="assistant" />
                <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-muted px-4 py-3">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Pensando…</span>
                </div>
              </div>
            )}
          </div>

          {/*
            Barra fixa no rodapé, acima do botão Treinar: as perguntas rápidas e
            o campo de pergunta livre — bloqueado por enquanto, porque o
            treinador responde com os seus dados, sem IA.
          */}
          <div
            ref={barra}
            className="fixed inset-x-0 bottom-(--acima-da-barra) z-30 bg-background/80 px-4 pb-2 pt-2 backdrop-blur-xl md:bottom-0 md:pl-64 md:pr-8">
            <div className="mx-auto max-w-3xl">
              {messages.length > 0 && (
                <div className="-mx-4 mb-2 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                  {COACH_FAQ.map((q) => (
                    <button
                      key={q.key}
                      type="button"
                      onClick={() => void perguntar(q.key)}
                      disabled={respondendo}
                      className="shrink-0 rounded-full border border-border bg-card px-3.5 py-2 text-sm font-medium transition-colors hover:border-primary/40 disabled:opacity-50"
                    >
                      {q.pergunta}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-card/70 p-2 opacity-70">
                <Lock className="ml-1.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <input
                  disabled
                  placeholder="Perguntas personalizadas em breve"
                  aria-label="Pergunta personalizada (indisponível)"
                  className="min-w-0 flex-1 cursor-not-allowed bg-transparent px-1 py-2 text-base outline-none placeholder:text-muted-foreground"
                />
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                  <ArrowUp className="size-5" aria-hidden />
                </span>
              </div>
            </div>
          </div>
        </div>
      </PageBody>
    </>
  );
}

function Welcome({ onPick }: { onPick: (key: FaqKey) => void }) {
  return (
    <div className="pt-2">
      <div className="flex items-center gap-3.5">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
          <CoachIcon className="size-7" aria-hidden />
        </span>
        <div>
          <h2 className="text-xl font-extrabold">Como posso ajudar?</h2>
          <p className="text-sm text-muted-foreground">
            Respostas na hora, com os seus dados de treino, dieta e corpo.
          </p>
        </div>
      </div>

      <p className="mb-2.5 mt-6 flex items-center gap-1.5 px-1 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
        <Zap className="size-3.5 text-primary" aria-hidden />
        Perguntas rápidas
      </p>
      <div className="grid grid-cols-2 gap-2">
        {COACH_FAQ.map((q, i) => (
          <button
            key={q.key}
            type="button"
            onClick={() => onPick(q.key)}
            style={{ animationDelay: `${i * 40}ms` }}
            className="animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards rounded-[1.25rem] bg-card p-3.5 text-left text-sm font-semibold leading-snug transition-colors duration-300 hover:bg-elevated active:scale-[0.98]"
          >
            {q.pergunta}
          </button>
        ))}
      </div>
      <p className="mt-4 px-1 text-center text-xs text-muted-foreground">
        Ou escreva a sua pergunta abaixo.
      </p>
    </div>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const doUsuario = message.role === "user";

  return (
    <div className={cn("flex gap-3", doUsuario && "flex-row-reverse")}>
      <Avatar role={message.role} />
      <div
        className={cn(
          // `break-words` + `min-w-0`: sem eles, um link colado ou uma palavra
          // muito longa na resposta do modelo estica a bolha além dos 85% e
          // empurra a página inteira para o lado.
          "min-w-0 max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          "animate-in fade-in slide-in-from-bottom-1 duration-300",
          doUsuario ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm bg-muted",
        )}
      >
        {message.content}
      </div>
    </div>
  );
}

function Avatar({ role }: { role: "user" | "assistant" }) {
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full",
        role === "user" ? "bg-secondary text-secondary-foreground" : "bg-primary/15 text-primary",
      )}
      aria-hidden
    >
      {role === "user" ? <User className="size-4" /> : <CoachIcon className="size-4" />}
    </span>
  );
}
