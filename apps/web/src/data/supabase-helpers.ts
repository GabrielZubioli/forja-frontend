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
    case "23502":
      return "Preencha todos os campos obrigatórios.";
    case "22001":
      return "Texto longo demais.";
    case "22P02":
    case "22007":
    case "22008":
      return "Valor em formato inválido.";
    case "57014":
      return "O servidor demorou para responder. Tente de novo.";
    case "PGRST303":
      return SESSAO_EXPIRADA;
    // Mensagens das nossas próprias regras (`raise exception`), já em pt-BR.
    case "P0001":
      return error.message || FALHA_GENERICA;
    default:
      if (/fetch|network/i.test(error.message)) return SEM_CONEXAO;
      if (/jwt expired|jwt/i.test(error.message)) return SESSAO_EXPIRADA;
      // O resto vem do banco em inglês: não chega cru à tela.
      return FALHA_GENERICA;
  }
}

const FALHA_GENERICA = "Não foi possível concluir a operação. Tente de novo.";
const SEM_CONEXAO = "Sem conexão com o servidor. Verifique sua internet.";
const SESSAO_EXPIRADA = "Sua sessão expirou. Entre de novo.";

/** Erros do Supabase Auth (cadastro, login, senha), pelo código e, sem ele, pelo texto. */
const ERROS_AUTH: Record<string, string> = {
  invalid_credentials: "E-mail ou senha incorretos.",
  email_not_confirmed: "Confirme seu e-mail para entrar.",
  user_already_exists: "Este e-mail já tem conta. Faça login para continuar.",
  email_exists: "Este e-mail já tem conta. Faça login para continuar.",
  weak_password: "Senha fraca: use pelo menos 8 caracteres, com letras e números.",
  same_password: "A nova senha precisa ser diferente da anterior.",
  over_email_send_rate_limit: "Muitas tentativas. Aguarde um pouco e tente de novo.",
  over_request_rate_limit: "Muitas tentativas. Aguarde um pouco e tente de novo.",
  email_address_invalid: "E-mail inválido.",
  validation_failed: "Confira os dados informados.",
  signup_disabled: "Novos cadastros estão desativados no momento.",
  session_not_found: SESSAO_EXPIRADA,
  session_expired: SESSAO_EXPIRADA,
  refresh_token_not_found: SESSAO_EXPIRADA,
  bad_jwt: SESSAO_EXPIRADA,
  otp_expired: "O link expirou ou já foi usado. Peça um novo.",
  user_not_found: "Conta não encontrada.",
  email_address_not_authorized: "Não foi possível enviar e-mail para este endereço agora.",
};

function traduzirAuth(code: string | undefined, message: string): string {
  if (code && ERROS_AUTH[code]) return ERROS_AUTH[code];
  if (/rate limit|security purposes/i.test(message)) return ERROS_AUTH.over_request_rate_limit!;
  if (/already registered/i.test(message)) return ERROS_AUTH.user_already_exists!;
  if (/invalid login/i.test(message)) return ERROS_AUTH.invalid_credentials!;
  if (/not confirmed/i.test(message)) return ERROS_AUTH.email_not_confirmed!;
  if (/password should|weak password/i.test(message)) return ERROS_AUTH.weak_password!;
  if (/different from the old/i.test(message)) return ERROS_AUTH.same_password!;
  if (/fetch|network/i.test(message)) return SEM_CONEXAO;
  return FALHA_GENERICA;
}

function traduzirStorage(message: string): string {
  if (/too large|maximum allowed size|payload/i.test(message)) return "Arquivo grande demais.";
  if (/mime|content type|not supported/i.test(message)) return "Formato de arquivo não suportado.";
  if (/already exists/i.test(message)) return "Esse arquivo já existe.";
  if (/fetch|network/i.test(message)) return SEM_CONEXAO;
  return "Não foi possível enviar o arquivo. Tente de novo.";
}

/**
 * Extrai uma mensagem apresentável — sempre em pt-BR — de qualquer erro (para
 * toasts e telas). Erros do Auth e do Storage chegam do Supabase em inglês e
 * são traduzidos aqui, num lugar só; os nossos (`new Error("…")`) já são pt-BR.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof DataError) return error.message;
  if (error && typeof error === "object") {
    const e = error as { name?: string; code?: string; message?: string; __isAuthError?: boolean };
    const msg = e.message ?? "";
    if (e.__isAuthError || /^Auth/.test(e.name ?? "")) return traduzirAuth(e.code, msg);
    if (/^Storage/.test(e.name ?? "")) return traduzirStorage(msg);
    // Funções do servidor: "Edge Function returned a non-2xx status code" etc.
    if (/^Functions/.test(e.name ?? "")) {
      return /fetch|network|relay/i.test(e.name + msg) ? SEM_CONEXAO : FALHA_GENERICA;
    }
    if (e.name === "TypeError" && /fetch|network|load failed/i.test(msg)) return SEM_CONEXAO;
    if (error instanceof Error) return msg || FALHA_GENERICA;
  }
  return "Algo deu errado. Tente novamente.";
}
