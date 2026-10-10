import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowUp, Loader2, User } from "lucide-react";
import { CoachIcon } from "@/components/coach/coach-icon";
import { PageBody, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
      { title: "Treinador — Forja" },
      { name: "description", content: "Tire dúvidas sobre treino e alimentação." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CoachPage,
});

/** Perguntas de partida. Uma tela de chat em branco não sugere o que perguntar. */
const SUGESTOES = [
  "Posso trocar agachamento livre por leg press?",
  "Estou com dor no ombro. O que ajusto no treino?",
  "Como aumento a proteína sem estourar as calorias?",
  "Quanto tempo devo descansar entre séries?",
  "Vale a pena treinar em jejum?",
];

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

  const submeter = (texto: string) => {
    const limpo = texto.trim();
    if (!limpo || enviar.isPending) return;
    setDraft("");
    enviar.mutate(limpo);
  };

  if (unavailable) return <NotConfigured message={unavailable} />;

  return (
    <>
      <PageHeader title="Treinador" description="Tire dúvidas sobre treino e alimentação." />

      <PageBody>
        <div className="flex flex-col" style={{ minHeight: "60dvh" }}>
          <div className="flex-1 space-y-4 pb-4">
            {messages.length === 0 ? (
              <Welcome onPick={submeter} />
            ) : (
              messages.map((m) => <Bubble key={m.id} message={m} />)
            )}

            {enviar.isPending && (
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
                placeholder="Pergunte sobre treino, dieta ou progresso…"
                aria-label="Sua pergunta"
                className="max-h-32 flex-1 resize-none bg-transparent px-2 py-2 text-base outline-none placeholder:text-muted-foreground"
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

function Welcome({ onPick }: { onPick: (texto: string) => void }) {
  return (
    <div className="py-6 text-center">
      <span
        className="mx-auto grid size-14 place-items-center rounded-2xl"
        style={{ background: "var(--gradient-primary)" }}
        aria-hidden
      >
        <CoachIcon className="size-7 text-primary-foreground" />
      </span>
      <h2 className="mt-4 text-lg font-bold tracking-tight">Como posso ajudar?</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
        Conheço seu plano, suas metas, suas lesões e suas restrições. Pergunte à vontade.
      </p>

      <div className="mt-6 space-y-2">
        {SUGESTOES.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            style={{ animationDelay: `${i * 60}ms` }}
            className="w-full animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards rounded-xl border border-border px-4 py-3 text-left text-sm transition-colors duration-300 hover:border-primary/40 hover:bg-accent/50"
          >
            {s}
          </button>
        ))}
      </div>
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

function NotConfigured({ message }: { message: string }) {
  return (
    <>
      <PageHeader title="Treinador" />
      <PageBody>
        <Card className="mx-auto max-w-lg">
          <CardContent className="p-6 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground">
              <CoachIcon className="size-6" aria-hidden />
            </span>
            <h2 className="mt-4 font-bold">Treinador ainda não configurado</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{message}</p>

            <div className="mt-5 rounded-xl bg-muted/50 p-4 text-left">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Para ativar
              </p>
              <ol className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                <li>
                  1. Obtenha uma chave em{" "}
                  <span className="break-all font-mono text-xs">console.anthropic.com</span>
                </li>
                <li>
                  2.{" "}
                  <span className="break-all font-mono text-xs">
                    npx supabase secrets set ANTHROPIC_API_KEY=…
                  </span>
                </li>
                <li>
                  3.{" "}
                  <span className="break-all font-mono text-xs">
                    npx supabase functions deploy coach
                  </span>
                </li>
              </ol>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Enquanto isso, todo o resto do app funciona normalmente — inclusive as recomendações
              automáticas na tela inicial, que não dependem de IA.
            </p>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
