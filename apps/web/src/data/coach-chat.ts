import { supabase } from "@/integrations/supabase/client";
import { assertOk, unwrap, unwrapList } from "@/data/supabase-helpers";

/**
 * Conversa com o treinador.
 *
 * A chamada passa pela Edge Function `coach`, nunca direto pela API do modelo:
 * a chave não pode existir no navegador. A função valida o JWT, monta o
 * contexto lendo o banco sob RLS e responde.
 */

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export class CoachUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoachUnavailableError";
  }
}

/**
 * Envia a conversa e devolve a resposta, entregando o texto conforme chega.
 *
 * O histórico vai inteiro a cada chamada — a API é sem estado. A função corta
 * as mensagens mais antigas do lado do servidor, onde o limite pertence.
 *
 * `supabase.functions.invoke` não serve aqui: ele lê o corpo inteiro antes de
 * devolver, o que anula o streaming da Edge Function. Daí o `fetch` direto,
 * montando à mão o que o `invoke` faria — a URL da função e o JWT do usuário.
 *
 * `onDelta` é opcional. Sem ele o comportamento é o de antes: a promise resolve
 * com a resposta completa.
 */
export async function sendToCoach(
  messages: readonly ChatMessage[],
  onDelta?: (trecho: string) => void,
): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Entre novamente.");

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/coach`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
  } catch {
    throw new Error("Não foi possível falar com o treinador.");
  }

  // 503 é o caso "chave não configurada": tem tratamento próprio na UI, porque
  // não é uma falha — é uma funcionalidade não instalada.
  if (res.status === 503) {
    const corpo = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new CoachUnavailableError(
      corpo?.message ?? "O treinador com IA ainda não foi configurado neste projeto.",
    );
  }

  if (!res.ok || !res.body) {
    const corpo = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(corpo?.error ?? "Não foi possível falar com o treinador.");
  }

  return await lerSse(res.body, onDelta);
}

/**
 * Lê o SSE da Anthropic repassado pela Edge Function e concatena o texto.
 *
 * Só `content_block_delta` de tipo `text_delta` interessa. Os outros eventos
 * (início e fim de bloco, uso de tokens, blocos de raciocínio) são ignorados de
 * propósito: o chat mostra a resposta, não o processo.
 */
async function lerSse(
  body: ReadableStream<Uint8Array>,
  onDelta?: (trecho: string) => void,
): Promise<string> {
  // `TextDecoder` com `stream: true` em vez de `pipeThrough(TextDecoderStream)`:
  // além de evitar um incompatibilidade de tipos entre os ReadableStream do lib
  // DOM, ele guarda sozinho um caractere multibyte partido entre dois chunks —
  // um "ã" cortado no meio viraria lixo se cada chunk fosse decodificado à parte.
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let texto = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Um chunk da rede não respeita a fronteira das linhas: a última pode
      // estar pela metade, então ela volta para o buffer em vez de ser parseada.
      const linhas = buffer.split("\n");
      buffer = linhas.pop() ?? "";

      for (const linha of linhas) {
        if (!linha.startsWith("data:")) continue;
        const payload = linha.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        try {
          const evento = JSON.parse(payload) as {
            type?: string;
            delta?: { type?: string; text?: string };
          };
          if (evento.type === "content_block_delta" && evento.delta?.type === "text_delta") {
            const trecho = evento.delta.text ?? "";
            texto += trecho;
            onDelta?.(trecho);
          }
        } catch {
          // Linha truncada ou evento desconhecido: ignorar é melhor que
          // derrubar uma resposta que está chegando bem.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!texto) throw new Error("Resposta vazia do treinador.");
  return texto;
}

// ------------------------------------------------------------ persistência

export async function fetchConversations() {
  return unwrapList(
    "carregar conversas",
    await supabase
      .from("ai_conversations")
      .select("id, title, updated_at")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(20),
  );
}

export async function fetchMessages(conversationId: string): Promise<ChatMessage[]> {
  const rows = unwrapList(
    "carregar mensagens",
    await supabase
      .from("ai_messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at"),
  );

  return rows.map((r) => ({
    id: r.id,
    role: r.role as "user" | "assistant",
    content: r.content,
    createdAt: r.created_at,
  }));
}

/**
 * Cria a conversa usando a primeira pergunta como título.
 *
 * "Nova conversa" repetido dez vezes na lista é inútil; a pergunta que a
 * originou é o que faz alguém reencontrá-la.
 */
export async function createConversation(userId: string, firstMessage: string): Promise<string> {
  const titulo = firstMessage.trim().slice(0, 60);
  const row = unwrap(
    "criar conversa",
    await supabase
      .from("ai_conversations")
      .insert({ user_id: userId, title: titulo || "Nova conversa" })
      .select("id")
      .single(),
  );
  return row.id;
}

export async function saveMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
): Promise<void> {
  assertOk(
    "salvar mensagem",
    await supabase.from("ai_messages").insert({ conversation_id: conversationId, role, content }),
  );

  // Reordena a lista de conversas por atividade real, não por criação.
  assertOk(
    "atualizar conversa",
    await supabase
      .from("ai_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId),
  );
}

export async function deleteConversation(id: string): Promise<void> {
  assertOk(
    "excluir conversa",
    await supabase
      .from("ai_conversations")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id),
  );
}
