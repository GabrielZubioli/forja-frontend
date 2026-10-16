import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
const { DataError, errorMessage } = await import("./supabase-helpers");

/** Erros que o Supabase devolve em inglês nunca chegam crus à tela. */
describe("errorMessage", () => {
  const banco = (code: string, message: string) =>
    new DataError("teste", {
      code,
      message,
      details: "",
      hint: "",
      name: "PostgrestError",
    } as never);

  it("traduz erros do banco e mantém as mensagens das nossas regras", () => {
    expect(errorMessage(banco("23505", "duplicate key value"))).toBe("Esse registro já existe.");
    expect(errorMessage(banco("P0001", "Muitas operações seguidas."))).toBe(
      "Muitas operações seguidas.",
    );
    expect(errorMessage(banco("XX999", "some internal english error"))).toBe(
      "Não foi possível concluir a operação. Tente de novo.",
    );
  });

  it("traduz erros do Auth pelo código e pelo texto", () => {
    const auth = (code: string | undefined, message: string) =>
      Object.assign(new Error(message), { name: "AuthApiError", code, __isAuthError: true });
    expect(errorMessage(auth("invalid_credentials", "Invalid login credentials"))).toBe(
      "E-mail ou senha incorretos.",
    );
    expect(errorMessage(auth(undefined, "User already registered"))).toMatch(/já tem conta/);
    expect(
      errorMessage(
        auth(undefined, "For security purposes, you can only request this after 30 seconds"),
      ),
    ).toMatch(/Muitas tentativas/);
  });

  it("traduz Storage, funções do servidor e falta de conexão", () => {
    const err = (name: string, message: string) => Object.assign(new Error(message), { name });
    expect(errorMessage(err("StorageApiError", "Payload too large"))).toBe(
      "Arquivo grande demais.",
    );
    expect(
      errorMessage(err("FunctionsHttpError", "Edge Function returned a non-2xx status code")),
    ).toBe("Não foi possível concluir a operação. Tente de novo.");
    expect(errorMessage(new TypeError("Failed to fetch"))).toMatch(/Sem conexão/);
  });

  it("mantém nossas próprias mensagens", () => {
    expect(errorMessage(new Error("Dê um nome à rotina."))).toBe("Dê um nome à rotina.");
  });
});
