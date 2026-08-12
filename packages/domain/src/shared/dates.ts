/**
 * Utilitários de data em UTC. O app armazena tudo em UTC (ver decisões de
 * produção) e converte para o fuso do usuário apenas na borda de exibição.
 *
 * Uma "chave de dia" é uma string `YYYY-MM-DD` interpretada em UTC — usada
 * pelas colunas `log_date` (peso, diário alimentar, medidas).
 */

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

/** Converte um `Date` para a chave de dia UTC `YYYY-MM-DD`. */
export function utcDayKey(date: Date): string {
  const key = date.toISOString().slice(0, 10);
  return key;
}

/** Interpreta uma chave de dia `YYYY-MM-DD` como meia-noite UTC. */
export function parseUtcDayKey(key: string): Date {
  if (!DAY_KEY_RE.test(key)) {
    throw new RangeError(`Chave de dia inválida (esperado YYYY-MM-DD): ${key}`);
  }
  return new Date(`${key}T00:00:00.000Z`);
}

/** Soma `days` (pode ser negativo) a uma chave de dia UTC. */
export function addUtcDays(key: string, days: number): string {
  const base = parseUtcDayKey(key).getTime();
  return utcDayKey(new Date(base + days * MS_PER_DAY));
}

/** Número de dias inteiros entre duas chaves de dia (b - a). */
export function daysBetweenUtc(a: string, b: string): number {
  const diff = parseUtcDayKey(b).getTime() - parseUtcDayKey(a).getTime();
  return Math.round(diff / MS_PER_DAY);
}

/** Idade em anos completos entre a data de nascimento e a referência. */
export function yearsBetween(birthISO: string, ref: Date = new Date()): number {
  const b = new Date(birthISO);
  let age = ref.getUTCFullYear() - b.getUTCFullYear();
  const m = ref.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && ref.getUTCDate() < b.getUTCDate())) age--;
  return age;
}
