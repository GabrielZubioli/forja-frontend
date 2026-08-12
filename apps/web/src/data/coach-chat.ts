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
 * Envia a conversa e devolve a resposta.
 *
 * O histórico vai inteiro a cada chamada — a API é sem estado. A função corta
 * as mensagens mais antigas do lado do servidor, onde o limite pertence.
 */
export async function sendToCoach(messages: readonly ChatMessage[]): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{
    content?: string;
    error?: string;
    message?: string;
  }>("coach", {
    body: { messages: messages.map((m) => ({ role: m.role, content: m.content })) },
  });

  if (error) {
    // 503 é o caso "chave não configurada": tem tratamento próprio na UI,
    // porque não é uma falha — é uma funcionalidade não instalada.
    const status = (error as { context?: { status?: number } }).context?.status;
    if (status === 503) {
      throw new CoachUnavailableError(
        "O treinador com IA ainda não foi configurado neste projeto.",
      );
    }
    throw new Error(error.message || "Não foi possível falar com o treinador.");
  }

  if (data?.error === "unavailable") {
    throw new CoachUnavailableError(data.message ?? "Treinador indisponível.");
  }
  if (!data?.content) throw new Error(data?.error ?? "Resposta vazia do treinador.");

  return data.content;
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
