import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowUp, Info, Loader2, User, Zap } from "lucide-react";
import { COACH_FAQ, answerFaq, type FaqKey } from "@/data/coach-faq";
import { errorMessage } from "@/data/supabase-helpers";
import { CoachIcon } from "@/components/coach/coach-icon";
import { PageBody, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCurrentUserId } from "@/hooks/use-current-user";
import {
  CoachUnavailableError,
  createConversation,
  saveMessage,
  sendToCoach,
  type ChatMessage,
} from "@/data/coach-chat";

/**
 * Conversa com o treinador.
 *
 * ## A divisão de trabalho, de novo
 *
 * Esta tela é a **única** do app que fala com um modelo de linguagem. Plano de
 * treino, cardápio, progressão de carga, detecção de estagnação e ajuste de
 * metas continuam saindo do motor determinístico — testável, instantâneo,
 * gratuito e funcional sem rede.
 *
 * O modelo entra onde só ele resolve: responder "posso trocar agachamento por
 * leg press?" com o contexto de quem pergunta. É conversa, não prescrição.
 *
 * ## Quando não está configurado
 *
 * Sem `ANTHROPIC_API_KEY` no projeto Supabase, a tela explica o que falta em
 * vez de mostrar erro. Um recurso não instalado não é uma falha, e tratá-lo
 * como tal faria o app parecer quebrado quando está apenas incompleto.
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
  const userId = useCurrentUserId();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);

  const fimDaLista = useRef<HTMLDivElement>(null);

  /**
   * Id da pergunta do turno em andamento.
   *
   * Guardado num ref, não no state: só o `onError` o lê, e mudá-lo não deve
   * causar renderização.
   */
  const perguntaPendente = useRef<string | null>(null);

  /**
   * Rola até a última mensagem.
   *
   * Antes isto chamava `scrollTo` no contêiner da lista — que **nunca rolava**,
   * porque ele não tem altura limitada: quem rola é a janela. `scrollHeight`
   * era igual a `clientHeight`, a chamada não fazia nada, e a resposta do
   * treinador aparecia fora da área visível. Rolar um elemento-âncora para a
   * vista funciona independentemente de qual ancestral é o contêiner de
   * rolagem.
   */
  useEffect(() => {
    fimDaLista.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const enviar = useMutation({
    mutationFn: async (texto: string) => {
      const pergunta: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: texto,
        createdAt: new Date().toISOString(),
      };

      // A pergunta aparece antes da resposta chegar: esperar o servidor para
      // exibir o que o próprio usuário escreveu é latência sem motivo.
      const historico = [...messages, pergunta];
      setMessages(historico);
      perguntaPendente.current = pergunta.id;

      // A bolha da resposta entra vazia e cresce conforme o texto chega. Sem
      // isto o streaming da Edge Function não mudaria nada para o usuário: a
      // tela ficaria parada até a última palavra, exatamente como antes.
      const respostaId = crypto.randomUUID();
      let primeiroTrecho = true;

      const resposta = await sendToCoach(historico, (trecho) => {
        setMessages((prev) => {
          if (primeiroTrecho) {
            primeiroTrecho = false;
            return [
              ...prev,
              {
                id: respostaId,
                role: "assistant",
                content: trecho,
                createdAt: new Date().toISOString(),
              },
            ];
          }
          return prev.map((m) => (m.id === respostaId ? { ...m, content: m.content + trecho } : m));
        });
      });

      // A persistência acontece depois da resposta, e não é crítica: uma falha
      // ao gravar não pode apagar da tela uma conversa que já aconteceu.
      try {
        const convId = conversationId ?? (await createConversation(userId, texto));
        if (!conversationId) setConversationId(convId);
        await saveMessage(convId, "user", texto);
        await saveMessage(convId, "assistant", resposta);
      } catch {
        // Silencioso de propósito — ver acima.
      }

      return resposta;
    },
    // Sem `onSuccess`: a resposta já entrou na lista trecho a trecho enquanto
    // chegava. Acrescentá-la de novo aqui a duplicaria na tela.
    onError: (error) => {
      // Descarta a pergunta sem resposta e o pedaço de resposta que chegou
      // antes do erro. Cortar só o último item não basta: se o stream falhou no
      // meio, o último item é a resposta parcial e a pergunta ficaria pendurada
      // como se ainda estivesse sendo respondida.
      const descartar = (prev: ChatMessage[]) => {
        const corte = prev.findIndex((m) => m.id === perguntaPendente.current);
        return corte === -1 ? prev : prev.slice(0, corte);
      };

      if (error instanceof CoachUnavailableError) {
        setUnavailable(error.message);
        setMessages(descartar);
        return;
      }
      toast.error(error.message);
      setMessages(descartar);
    },
  });

  /** Pergunta pronta: a resposta sai dos dados da pessoa, sem IA. */
  const [respondendo, setRespondendo] = useState(false);
  const perguntar = async (key: FaqKey) => {
    if (respondendo || enviar.isPending) return;
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

  const submeter = (texto: string) => {
    const limpo = texto.trim();
    if (!limpo || enviar.isPending) return;
    setDraft("");
    enviar.mutate(limpo);
  };

  return (
    <>
      <PageHeader title="Treinador" description="Tire dúvidas sobre treino e alimentação." />

      <PageBody>
        <div className="flex flex-col" style={{ minHeight: "60dvh" }}>
          <div className="flex-1 space-y-4 pb-4">
            {messages.length === 0 ? (
              <Welcome onPick={perguntar} />
            ) : (
              messages.map((m) => <Bubble key={m.id} message={m} />)
            )}

            {unavailable && (
              <p className="flex gap-2.5 rounded-[1.25rem] border border-border p-4 text-sm text-muted-foreground">
                <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span>
                  As perguntas livres usam o treinador com IA, que ainda não está ativado neste
                  app. As <b className="text-foreground">perguntas rápidas</b> funcionam sempre —
                  elas usam os seus dados.
                </span>
              </p>
            )}

            {(enviar.isPending || respondendo) && (
              <div className="flex gap-3">
                <Avatar role="assistant" />
                <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-muted px-4 py-3">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Pensando…</span>
                </div>
              </div>
            )}

            {/* Âncora do auto-scroll. Um elemento de altura zero no fim da lista
                é o alvo mais confiável: não depende de qual ancestral rola. */}
            <div ref={fimDaLista} aria-hidden />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submeter(draft);
            }}
            className="sticky bottom-0 bg-background pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2"
          >
            {messages.length > 0 && (
              <div className="-mx-4 mb-2 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                {COACH_FAQ.map((q) => (
                  <button
                    key={q.key}
                    type="button"
                    onClick={() => void perguntar(q.key)}
                    disabled={respondendo || enviar.isPending}
                    className="shrink-0 rounded-full border border-border bg-card px-3.5 py-2 text-sm font-medium transition-colors hover:border-primary/40 disabled:opacity-50"
                  >
                    {q.pergunta}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2 rounded-2xl border-2 border-border bg-card p-2 focus-within:border-primary/50">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  // Enter envia, Shift+Enter quebra linha: é o que a pessoa
                  // espera de um chat, e o oposto do que um textarea faz.
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submeter(draft);
                  }
                }}
                rows={1}
                placeholder="Escreva sua pergunta…"
                aria-label="Sua pergunta"
                className="max-h-32 flex-1 resize-none bg-transparent px-2 py-2 text-base outline-none [scrollbar-width:none] placeholder:text-muted-foreground"
              />
              <Button
                type="submit"
                size="icon"
                className="size-10 shrink-0 rounded-xl"
                disabled={!draft.trim() || enviar.isPending}
                aria-label="Enviar pergunta"
              >
                <ArrowUp className="size-5" />
              </Button>
            </div>

            <p className="mt-2 px-1 text-center text-[11px] leading-relaxed text-muted-foreground">
              Seu treino e seu cardápio são calculados pelo app, não por IA. O treinador conversa
              sobre eles — e não substitui orientação médica.
            </p>
          </form>
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
