import { answersSchema, EMPTY_ANSWERS, type Answers } from "./schema";

/**
 * Persistência do rascunho do questionário.
 *
 * ## Por que o rascunho existe antes da conta
 *
 * O app abre **direto no questionário**: nada de login, cadastro ou tela
 * inicial. Isso significa que, durante todo o preenchimento, não há usuário —
 * e portanto não há banco onde gravar. O rascunho vive no navegador até o
 * cadastro, e só então é transferido para o servidor.
 *
 * O ganho é de conversão: pedir e-mail e senha antes de a pessoa ver qualquer
 * valor é o maior ponto de desistência de um app fitness. Aqui ela responde,
 * vê o plano sendo montado e só cadastra para **guardá-lo**.
 *
 * ## O custo, e como ele é tratado
 *
 * Quem responder tudo e fechar o navegador antes de cadastrar perde o rascunho
 * se o `localStorage` for limpo. É aceitável: o questionário leva ~2 minutos e
 * é retomável enquanto o armazenamento existir.
 */

const KEY = "forja:onboarding-draft";
const VERSION = 1;

interface Draft {
  version: number;
  answers: unknown;
  updatedAt: string;
}

/** SSR e navegadores com armazenamento bloqueado (aba anônima estrita). */
function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    // Acessar `localStorage` já lança quando o site está bloqueado por política.
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadDraft(): Answers {
  const store = storage();
  if (!store) return EMPTY_ANSWERS;

  try {
    const raw = store.getItem(KEY);
    if (!raw) return EMPTY_ANSWERS;

    const draft = JSON.parse(raw) as Draft;
    // Rascunho de uma versão anterior do questionário: descartar é mais seguro
    // que tentar migrar respostas cujo significado pode ter mudado.
    if (draft.version !== VERSION) return EMPTY_ANSWERS;

    const parsed = answersSchema.safeParse(draft.answers);
    return parsed.success ? parsed.data : EMPTY_ANSWERS;
  } catch {
    // Armazenamento corrompido não pode derrubar a primeira tela do app.
    return EMPTY_ANSWERS;
  }
}

export function saveDraft(answers: Answers): void {
  const store = storage();
  if (!store) return;
  try {
    const draft: Draft = { version: VERSION, answers, updatedAt: new Date().toISOString() };
    store.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Cota estourada ou modo privado: o questionário continua funcionando em
    // memória. Perder a retomada é muito melhor que travar o preenchimento.
  }
}

export function clearDraft(): void {
  storage()?.removeItem(KEY);
}

/** Passo em que o usuário parou, para retomar de onde saiu. */
const STEP_KEY = "forja:onboarding-step";

export function loadStep(): number {
  const raw = storage()?.getItem(STEP_KEY);
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

export function saveStep(step: number): void {
  try {
    storage()?.setItem(STEP_KEY, String(step));
  } catch {
    /* ver acima */
  }
}

export function clearStep(): void {
  storage()?.removeItem(STEP_KEY);
}
