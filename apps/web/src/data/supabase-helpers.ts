/**
 * Helpers da camada de acesso a dados.
 *
 * O motivo de existirem: o padrão anterior
 *
 * ```ts
 * const { data } = await supabase.from("recipes").select("*");
 * return data ?? [];
 * ```
 *
 * **descarta o `error`**. Uma falha de rede, um token expirado ou uma policy de
 * RLS bloqueando viram `data === null` → `[]` → a tela mostra "Nenhuma receita
 * ainda". O React Query nunca entra em estado de erro porque a `queryFn`
 * resolveu com sucesso, então não há retry nem mensagem — o usuário conclui que
 * perdeu os dados.
 *
 * `unwrap`/`unwrapList` lançam o erro, devolvendo ao React Query o controle de
 * retry e de estado de erro.
 */
import type {
  PostgrestError,
  PostgrestResponse,
  PostgrestSingleResponse,
} from "@supabase/supabase-js";

/** Erro de banco com contexto de qual operação falhou. */
export class DataError extends Error {
  readonly code: string | undefined;
  readonly details: string | undefined;

  constructor(operation: string, cause: PostgrestError) {
    super(traduzirErro(cause));
    this.name = "DataError";
    this.code = cause.code;
    this.details = cause.details;
    this.cause = cause;
    // Mantém a mensagem crua nos logs, sem poluir a UI.
    console.error(`[data] ${operation} falhou:`, cause);
  }
}

/**
 * Desembrulha uma resposta `.single()`, lançando `DataError` em caso de falha.
 *
 * Os tipos de resposta do supabase-js são uniões discriminadas
 * (`{ data, error: null } | { data: null, error }`), então precisam ser
 * recebidos pelo alias genérico oficial — uma assinatura estrutural própria
 * faria a inferência de `T` colapsar para `never`.
 */
export function unwrap<T>(operation: string, result: PostgrestSingleResponse<T>): T {
  if (result.error) throw new DataError(operation, result.error);
  if (result.data === null) throw new DataError(operation, notFound());
  return result.data;
}

/** Igual a `unwrap`, mas para listas: ausência de dados vira lista vazia. */
export function unwrapList<T>(operation: string, result: PostgrestResponse<T>): T[] {
  if (result.error) throw new DataError(operation, result.error);
  return result.data ?? [];
}

/**
 * Desembrulha uma leitura opcional (`maybeSingle`): `null` é resultado válido.
 *
 * O parâmetro é `PostgrestSingleResponse<T>` — e não `PostgrestMaybeSingleResponse`,
 * que é definido como `PostgrestSingleResponse<T | null>` e faria a inferência
 * de `T` ficar ambígua. O `| null` já vem embutido em `T`.
 */
export function unwrapMaybe<T>(operation: string, result: PostgrestSingleResponse<T>): T {
  if (result.error) throw new DataError(operation, result.error);
  return result.data;
}

function notFound(): PostgrestError {
  return {
    message: "Registro não encontrado.",
    details: "",
    hint: "",
    code: "PGRST116",
    name: "PostgrestError",
  } as PostgrestError;
}

/** Lança se a mutação falhou. Usado onde não há retorno relevante. */
export function assertOk(operation: string, result: { error: PostgrestError | null }): void {
  if (result.error) throw new DataError(operation, result.error);
}

/**
 * Colunas `NUMERIC` do Postgres chegam como **string** no JS. Converter com
 * `Number()` cru transforma `null` em `0` e `undefined` em `NaN`, o que já
 * causou totais errados. Este helper é explícito quanto ao fallback.
 */
export function num(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Mensagens do Postgres/PostgREST traduzidas para algo acionável em pt-BR. */
function traduzirErro(error: PostgrestError): string {
  switch (error.code) {
    case "23505":
      return "Esse registro já existe.";
    case "23503":
      return "Não é possível concluir: o item está em uso por outro registro.";
    case "23514":
      return "Valor fora da faixa permitida.";
    case "42501":
    case "PGRST301":
      return "Sem permissão para acessar estes dados. Tente entrar novamente.";
    case "PGRST116":
      return "Registro não encontrado.";
    default:
      if (/fetch|network|Failed to fetch/i.test(error.message)) {
        return "Sem conexão com o servidor. Verifique sua internet.";
      }
      return error.message || "Não foi possível concluir a operação.";
  }
}

/** Extrai uma mensagem apresentável de qualquer erro (para toasts). */
export function errorMessage(error: unknown): string {
  if (error instanceof DataError) return error.message;
  if (error instanceof Error) return error.message;
  return "Algo deu errado. Tente novamente.";
}
