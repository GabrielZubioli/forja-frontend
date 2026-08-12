/**
 * Exportação dos dados do usuário.
 *
 * Duas razões para existir. A prática: um app de fitness acumula anos de
 * histórico e o usuário precisa poder levá-lo embora — a ausência disso é um
 * argumento contra adotar o produto. A legal: a LGPD prevê o direito à
 * portabilidade dos dados pessoais em formato de uso comum.
 *
 * A exportação roda inteiramente no cliente, respeitando o RLS: cada consulta
 * traz apenas o que aquele usuário já poderia ler.
 */
import { supabase } from "@/integrations/supabase/client";
import { unwrapList, unwrapMaybe } from "@/data/supabase-helpers";
import { todayISO } from "@/lib/date";

export type ExportFormat = "json" | "csv";

/** Limite por tabela — evita estourar a memória em contas com anos de histórico. */
const MAX_ROWS = 20_000;

export type ExportBundle = {
  exportadoEm: string;
  perfil: unknown;
  pesos: unknown[];
  medidas: unknown[];
  treinos: unknown[];
  series: unknown[];
  templates: unknown[];
  diarioAlimentar: unknown[];
  receitas: unknown[];
};

export async function fetchExportBundle(): Promise<ExportBundle> {
  const [perfil, pesos, medidas, treinos, series, templates, diario, receitas] = await Promise.all([
    supabase
      .from("profiles")
      .select("*")
      .maybeSingle()
      .then((r) => unwrapMaybe("exportar perfil", r)),
    supabase
      .from("body_weights")
      .select("log_date, weight_kg, created_at")
      .order("log_date")
      .limit(MAX_ROWS)
      .then((r) => unwrapList("exportar pesos", r)),
    supabase
      .from("body_measurements")
      .select("*")
      .order("log_date")
      .limit(MAX_ROWS)
      .then((r) => unwrapList("exportar medidas", r)),
    supabase
      .from("workout_sessions")
      .select("id, name, started_at, ended_at, duration_seconds, total_volume_kg, notes")
      .is("deleted_at", null)
      .order("started_at")
      .limit(MAX_ROWS)
      .then((r) => unwrapList("exportar treinos", r)),
    supabase
      .from("workout_sets")
      .select(
        "session_id, position, set_index, set_type, weight_kg, reps, rpe, is_pr, completed, exercises(name), workout_sessions!inner(started_at, deleted_at)",
      )
      .is("workout_sessions.deleted_at", null)
      .limit(MAX_ROWS)
      .then((r) => unwrapList("exportar séries", r)),
    supabase
      .from("workout_templates")
      .select(
        "id, name, notes, workout_template_exercises(position, target_sets, target_reps, rest_seconds, exercises(name))",
      )
      .is("deleted_at", null)
      .limit(MAX_ROWS)
      .then((r) => unwrapList("exportar templates", r)),
    supabase
      .from("food_log_entries")
      .select(
        "log_date, meal_type, grams, servings, notes, foods(name, brand, serving_size_g, kcal, protein_g, carbs_g, fat_g, fiber_g)",
      )
      .order("log_date")
      .limit(MAX_ROWS)
      .then((r) => unwrapList("exportar diário", r)),
    supabase
      .from("recipes")
      .select("id, name, servings, notes, recipe_items(grams, foods(name))")
      .is("deleted_at", null)
      .limit(MAX_ROWS)
      .then((r) => unwrapList("exportar receitas", r)),
  ]);

  return {
    exportadoEm: new Date().toISOString(),
    perfil,
    pesos,
    medidas,
    treinos,
    series,
    templates,
    diarioAlimentar: diario,
    receitas,
  };
}

/**
 * Converte uma lista de objetos em CSV.
 *
 * Campos aninhados (ex.: `foods.name` vindo de um embed do PostgREST) são
 * achatados com notação de ponto, para o arquivo abrir de forma útil no Excel.
 */
export function toCsv(rows: readonly unknown[]): string {
  if (rows.length === 0) return "";

  const flattened = rows.map((row) => flatten(row as Record<string, unknown>));
  const columns = Array.from(new Set(flattened.flatMap((r) => Object.keys(r))));

  const header = columns.map(escapeCsv).join(",");
  const body = flattened
    .map((row) => columns.map((col) => escapeCsv(row[col])).join(","))
    .join("\n");

  // BOM para o Excel reconhecer UTF-8 e não corromper acentos. Escapado em vez
  // de literal: o caractere invisível é indistinguível de um erro de digitação.
  return `\uFEFF${header}\n${body}`;
}

function flatten(value: Record<string, unknown>, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === "object" && !Array.isArray(val)) {
      Object.assign(out, flatten(val as Record<string, unknown>, path));
    } else if (Array.isArray(val)) {
      out[path] = JSON.stringify(val);
    } else {
      out[path] = val;
    }
  }
  return out;
}

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  // Aspas, vírgulas e quebras de linha exigem envolver o campo em aspas.
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Dispara o download de um arquivo gerado no cliente. */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Libera a memória do blob assim que o navegador processa o clique.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Nome de arquivo padronizado e datado. */
export function exportFilename(scope: string, format: ExportFormat): string {
  return `forja-${scope}-${todayISO()}.${format}`;
}
