/**
 * Utilitários de data do app.
 *
 * Duas regras que valem em todo o projeto:
 *
 * 1. **Datas de registro (`log_date`) são locais, não UTC.** As colunas `DATE`
 *    do Postgres representam "o dia do usuário". Usar
 *    `new Date().toISOString().slice(0, 10)` quebra isso: no Brasil (UTC−3),
 *    das 21h à meia-noite o valor já é o dia seguinte, e um jantar registrado
 *    às 22h cairia no diário de amanhã.
 * 2. **Todo texto de data é pt-BR.** `date-fns` sem `locale` produz
 *    "Tuesday, 29 de July".
 */
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

/** Formato das colunas `DATE` do Postgres. */
export const ISO_DATE = "yyyy-MM-dd";

/** Data de hoje (`YYYY-MM-DD`) **no fuso do usuário**. */
export function todayISO(): string {
  return format(new Date(), ISO_DATE);
}

/** Converte um `Date` para a chave `YYYY-MM-DD` local. */
export function toISODate(date: Date): string {
  return format(date, ISO_DATE);
}

/**
 * Converte uma chave `YYYY-MM-DD` vinda do banco num `Date` **local**.
 *
 * `new Date("2026-07-29")` é interpretado como meia-noite UTC — que no Brasil é
 * dia 28 às 21h. `parseISO` com o sufixo de hora evita o deslocamento.
 */
export function fromISODate(isoDate: string): Date {
  return parseISO(`${isoDate}T00:00:00`);
}

/** Formata uma data (ou chave ISO) em pt-BR. */
export function formatDate(value: string | Date, pattern: string): string {
  const date = typeof value === "string" ? asDate(value) : value;
  return format(date, pattern, { locale: ptBR });
}

/**
 * Aceita tanto uma chave `YYYY-MM-DD` (interpretada como data local) quanto um
 * timestamp ISO completo (interpretado normalmente, com fuso).
 */
function asDate(value: string): Date {
  return value.length === 10 ? fromISODate(value) : new Date(value);
}

// --- Formatos usados na UI (mantêm a apresentação consistente entre telas) ---

/** `29/07/2026` */
export const formatShortDate = (v: string | Date) => formatDate(v, "dd/MM/yyyy");
/** `29/07` — eixos de gráfico e listas densas */
export const formatDayMonth = (v: string | Date) => formatDate(v, "dd/MM");
/** `29 de julho, 14:30` */
export const formatDateTime = (v: string | Date) => formatDate(v, "dd 'de' MMMM',' HH:mm");
/** `quarta-feira, 29 de julho` */
export const formatWeekday = (v: string | Date) => formatDate(v, "EEEE',' dd 'de' MMMM");
/** `quarta, 29 de julho` — cabeçalho da tela inicial, sem o "-feira" que ocupa linha */
export const formatLongDate = (v: string | Date) =>
  formatDate(v, "EEEE',' d 'de' MMMM").replace("-feira", "");
/** `qua` — faixa compacta da semana */
export const formatWeekdayShort = (v: string | Date) => formatDate(v, "EEEEEE");

/** Duração em segundos → `1h 12min` / `45min` / `30s`. */
export function formatDuration(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.round(Number(seconds ?? 0)));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}min` : `${hours}h`;
}

/** Segundos → `mm:ss`, para cronômetros. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
