/**
 * Importação de histórico de outros apps (Strong, Hevy, FitNotes e CSVs
 * parecidos) — para quem troca de app não começar do zero.
 *
 * Puro: recebe o texto do arquivo e devolve treinos normalizados. Casar os
 * exercícios com o catálogo e gravar é trabalho da camada de dados.
 *
 * Os formatos são reconhecidos pelos **cabeçalhos**, não pelo nome do app:
 * cada coluna aceita os apelidos que esses apps usam (`exercise name`,
 * `exercise_title`, `exercise` …). Assim um CSV montado à mão também entra.
 */

export interface ImportedSet {
  weightKg: number | null;
  reps: number | null;
  distanceM: number | null;
  durationSeconds: number | null;
  rpe: number | null;
  warmup: boolean;
}

export interface ImportedExercise {
  name: string;
  sets: ImportedSet[];
}

export interface ImportedWorkout {
  name: string;
  /** Início no horário local, `YYYY-MM-DDTHH:MM:SS` (sem fuso). */
  startedAt: string;
  durationSeconds: number | null;
  exercises: ImportedExercise[];
}

export interface ImportResult {
  workouts: ImportedWorkout[];
  /** Linhas puladas e por quê — mostradas à pessoa, não engolidas. */
  skipped: { line: number; reason: string }[];
}

type Field =
  | "exercise"
  | "date"
  | "start"
  | "end"
  | "workout"
  | "duration"
  | "weightKg"
  | "weightLb"
  | "weight"
  | "unit"
  | "reps"
  | "distanceKm"
  | "distanceM"
  | "distance"
  | "distanceUnit"
  | "seconds"
  | "rpe"
  | "setType";

const ALIASES: Record<Field, string[]> = {
  exercise: ["exercise", "exercise name", "exercise title", "exercise_title", "exercise_name"],
  date: ["date", "workout date"],
  start: ["start time", "start date", "start_time"],
  end: ["end time", "end_time"],
  workout: ["workout name", "title", "workout"],
  duration: ["duration"],
  weightKg: ["weight kg", "weight (kg)", "weight (kgs)", "weight_kg"],
  weightLb: ["weight lbs", "weight lb", "weight (lbs)", "weight_lbs"],
  weight: ["weight"],
  unit: ["weight unit", "unit"],
  reps: ["reps", "repetitions"],
  distanceKm: ["distance km", "distance_km"],
  distanceM: ["distance m", "distance_m"],
  distance: ["distance"],
  distanceUnit: ["distance unit"],
  seconds: ["seconds", "duration_seconds", "time", "duration seconds"],
  rpe: ["rpe", "rpe rating"],
  setType: ["set type", "set_type"],
};

const LB_TO_KG = 0.45359237;

/**
 * Lê o CSV e agrupa as linhas (uma por série) em treinos.
 *
 * @param defaultUnit unidade de uma coluna `weight` sem unidade declarada
 *   (o Strong exporta na unidade configurada no app).
 */
export function parseWorkoutCsv(text: string, defaultUnit: "kg" | "lb" = "kg"): ImportResult {
  const linhas = parseCsv(text.replace(/^\uFEFF/, ""));
  const skipped: ImportResult["skipped"] = [];
  if (linhas.length < 2) return { workouts: [], skipped };

  const cabecalho = linhas[0]!.map((h) => h.trim().toLowerCase());
  const col = {} as Partial<Record<Field, number>>;
  for (const [field, nomes] of Object.entries(ALIASES) as [Field, string[]][]) {
    const i = cabecalho.findIndex((h) => nomes.includes(h));
    if (i >= 0) col[field] = i;
  }
  if (col.exercise === undefined || (col.date === undefined && col.start === undefined)) {
    return {
      workouts: [],
      skipped: [{ line: 1, reason: "Cabeçalho sem colunas de exercício e data." }],
    };
  }

  const porTreino = new Map<string, ImportedWorkout>();
  for (let n = 1; n < linhas.length; n++) {
    const l = linhas[n]!;
    if (l.every((c) => c.trim() === "")) continue;
    const pega = (f: Field) => (col[f] === undefined ? "" : (l[col[f]!] ?? "").trim());

    const nome = pega("exercise");
    const inicio = parseDateTime(pega("start") || pega("date"));
    if (!nome || !inicio) {
      skipped.push({ line: n + 1, reason: !nome ? "sem exercício" : "data não reconhecida" });
      continue;
    }

    const chave = `${inicio}|${pega("workout")}`;
    let treino = porTreino.get(chave);
    if (!treino) {
      const fim = parseDateTime(pega("end"));
      treino = {
        name: pega("workout") || "Treino importado",
        startedAt: inicio,
        durationSeconds:
          parseDuration(pega("duration")) ??
          (fim ? Math.max(0, (Date.parse(fim) - Date.parse(inicio)) / 1000) : null),
        exercises: [],
      };
      porTreino.set(chave, treino);
    }

    let exercicio = treino.exercises.find((e) => e.name === nome);
    if (!exercicio) {
      exercicio = { name: nome, sets: [] };
      treino.exercises.push(exercicio);
    }

    const unidade = pega("unit").toLowerCase().startsWith("lb") ? "lb" : defaultUnit;
    const peso =
      num(pega("weightKg")) ??
      mult(num(pega("weightLb")), LB_TO_KG) ??
      mult(num(pega("weight")), unidade === "lb" ? LB_TO_KG : 1);
    // Coluna `distance` sem unidade: km, como Strong e FitNotes exportam por padrão.
    const distUnit = pega("distanceUnit").toLowerCase();
    const fatorDist = distUnit === "m" ? 1 : /^mi/.test(distUnit) ? 1609.344 : 1000;
    const distancia =
      mult(num(pega("distanceKm")), 1000) ??
      num(pega("distanceM")) ??
      mult(num(pega("distance")), fatorDist);

    exercicio.sets.push({
      weightKg: peso === null ? null : Math.round(peso * 100) / 100,
      reps: num(pega("reps")),
      distanceM: distancia,
      durationSeconds: parseDuration(pega("seconds")),
      rpe: num(pega("rpe")),
      warmup: /warm/i.test(pega("setType")),
    });
  }

  const workouts = [...porTreino.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  return { workouts, skipped };
}

/** CSV RFC 4180 (aspas, aspas duplicadas, quebra de linha dentro de aspas); `,` ou `;`. */
export function parseCsv(text: string): string[][] {
  const primeira = text.slice(0, text.indexOf("\n") >>> 0);
  const sep = (primeira.match(/;/g)?.length ?? 0) > (primeira.match(/,/g)?.length ?? 0) ? ";" : ",";
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let aspas = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (aspas) {
      if (c === '"' && text[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else campo += c;
  }
  if (campo !== "" || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas;
}

const MESES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** `2024-01-05 18:30[:00]`, `2024-01-05T18:30`, `2024-01-05` ou `5 Jan 2024, 18:30` → local ISO. */
export function parseDateTime(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return iso(m[1]!, m[2]!, m[3]!, m[4], m[5], m[6]);
  m = t.match(/^(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4})(?:,? (\d{1,2}):(\d{2}))?/);
  if (m) {
    const mes = MESES.indexOf(m[2]!.toLowerCase()) + 1;
    if (mes === 0) return null;
    return iso(m[3]!, String(mes), m[1]!, m[4], m[5]);
  }
  return null;
}

function iso(y: string, mo: string, d: string, h = "12", mi = "00", s = "00"): string {
  const p = (v: string) => v.padStart(2, "0");
  return `${y}-${p(mo)}-${p(d)}T${p(h)}:${p(mi)}:${p(s)}`;
}

/** `3600`, `1:05:00`, `45:10`, `1h 5m`, `45m` → segundos. */
export function parseDuration(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(Number(t));
  const partes = t.split(":").map(Number);
  if (partes.length > 1 && partes.every(Number.isFinite)) {
    return partes.reduce((acc, v) => acc * 60 + v, 0);
  }
  const h = Number(t.match(/(\d+)\s*h/)?.[1] ?? 0);
  const min = Number(t.match(/(\d+)\s*m(?!s)/)?.[1] ?? 0);
  const sec = Number(t.match(/(\d+)\s*s/)?.[1] ?? 0);
  const total = h * 3600 + min * 60 + sec;
  return total > 0 ? total : null;
}

function num(s: string): number | null {
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function mult(n: number | null, f: number): number | null {
  return n === null ? null : n * f;
}

/**
 * Casa o nome de outro app com um exercício do catálogo.
 *
 * "Bench Press (Barbell)" e "Barbell Bench Press - Medium Grip" são o mesmo
 * movimento: o equipamento entre parênteses vai para a frente, variações depois
 * de " - " saem, e compara-se o conjunto de palavras. Exige o mesmo
 * equipamento quando os dois o dizem, para não casar halter com barra.
 */
export function matchExercise<T extends { names: readonly string[] }>(
  source: string,
  candidates: readonly T[],
): T | null {
  const alvo = tokens(source);
  if (alvo.size === 0) return null;
  let melhor: T | null = null;
  let melhorNota = 0;
  for (const c of candidates) {
    for (const nome of c.names) {
      const t = tokens(nome);
      if (!equipamentoCompativel(alvo, t)) continue;
      const nota = jaccard(alvo, t);
      if (nota > melhorNota) {
        melhorNota = nota;
        melhor = c;
      }
    }
  }
  return melhorNota >= 0.75 ? melhor : null;
}

const EQUIPAMENTOS = ["barbell", "dumbbell", "cable", "machine", "kettlebell", "band", "smith"];
const VAZIAS = new Set(["the", "a", "with", "on", "of", "de", "com", "no", "na", "do", "da"]);
/** Pegada é variação do mesmo exercício: "Lat Pulldown" é a puxada aberta comum. */
const MODIFICADORES = new Set(["wide", "close", "medium", "narrow", "grip", "standard"]);

function tokens(nome: string): Set<string> {
  const semVariacao = nome.split(" - ")[0]!;
  const limpo = semVariacao
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[()[\],.-]/g, " ");
  return new Set(
    limpo
      .split(/\s+/)
      .map((w) => w.replace(/s$/, "")) // dumbbells → dumbbell
      .filter((w) => w && !VAZIAS.has(w) && !MODIFICADORES.has(w)),
  );
}

function equipamentoCompativel(a: Set<string>, b: Set<string>): boolean {
  const ea = EQUIPAMENTOS.filter((e) => a.has(e));
  const eb = EQUIPAMENTOS.filter((e) => b.has(e));
  return ea.length === 0 || eb.length === 0 || ea.some((e) => eb.includes(e));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Equipamento do Forja inferido do nome, para exercícios que não casaram. */
export function guessEquipment(
  name: string,
): "barbell" | "dumbbell" | "cable" | "machine" | "kettlebell" | "band" | "bodyweight" | "other" {
  const t = tokens(name);
  if (t.has("barbell") || t.has("smith")) return "barbell";
  for (const e of ["dumbbell", "cable", "machine", "kettlebell", "band"] as const) {
    if (t.has(e)) return e;
  }
  if (t.has("bodyweight") || t.has("assisted")) return "bodyweight";
  return "other";
}
