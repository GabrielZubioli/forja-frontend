/**
 * Importação de histórico de outros apps (Strong, Hevy, FitNotes…).
 *
 * O parse é do domínio (`parseWorkoutCsv`); aqui ficam as três decisões que
 * dependem do banco:
 *
 * 1. **Exercício:** casa com o catálogo pelo nome em português ou inglês;
 *    o que não casar vira exercício próprio (privado), para nada se perder.
 * 2. **Duplicata:** treino que já existe com o mesmo início é pulado — importar
 *    o mesmo arquivo duas vezes não duplica o histórico.
 * 3. **Lotes:** sessões e séries vão em blocos, não uma requisição por linha.
 */
import { supabase } from "@/integrations/supabase/client";
import { assertOk, unwrapList } from "@/data/supabase-helpers";
import { guessEquipment, matchExercise, sessionVolume, type ImportResult } from "@forja/domain";

export interface ImportSummary {
  workouts: number;
  sets: number;
  duplicates: number;
  newExercises: string[];
}

const PAGE = 1000;

export async function importWorkouts(userId: string, parsed: ImportResult): Promise<ImportSummary> {
  const resumo: ImportSummary = { workouts: 0, sets: 0, duplicates: 0, newExercises: [] };
  if (parsed.workouts.length === 0) return resumo;

  // 1. Catálogo visível (público + próprios), paginado.
  const catalogo: { id: string; names: string[] }[] = [];
  for (let de = 0; ; de += PAGE) {
    const pagina = unwrapList(
      "carregar catálogo de exercícios",
      await supabase
        .from("exercises")
        .select("id, name, name_en, equipment")
        .is("deleted_at", null)
        .range(de, de + PAGE - 1),
    );
    // O equipamento do catálogo entra no nome em inglês: "Lat Pulldown (Cable)"
    // casa com "Wide-Grip Lat Pulldown" mesmo sem "cable" no nome.
    catalogo.push(
      ...pagina.map((e) => ({
        id: e.id,
        names: [e.name, e.name_en, e.name_en && `${e.equipment} ${e.name_en}`].filter(
          Boolean,
        ) as string[],
      })),
    );
    if (pagina.length < PAGE) break;
  }

  const idPorNome = new Map<string, string>();
  const novos: string[] = [];
  for (const nome of new Set(parsed.workouts.flatMap((w) => w.exercises.map((e) => e.name)))) {
    const achado = matchExercise(nome, catalogo);
    if (achado) idPorNome.set(nome, achado.id);
    else novos.push(nome);
  }
  if (novos.length > 0) {
    const criados = unwrapList(
      "criar exercícios importados",
      await supabase
        .from("exercises")
        .insert(
          novos.map((name) => ({
            name,
            owner_id: userId,
            is_public: false,
            primary_muscle: "full_body" as const,
            equipment: guessEquipment(name),
          })),
        )
        .select("id, name"),
    );
    for (const c of criados) idPorNome.set(c.name, c.id);
    resumo.newExercises = novos;
  }

  // 2. Duplicatas: inícios já existentes no período do arquivo.
  const inicios = parsed.workouts.map((w) => new Date(w.startedAt).toISOString()).sort();
  const existentes = new Set(
    unwrapList(
      "verificar treinos já importados",
      await supabase
        .from("workout_sessions")
        .select("started_at")
        .is("deleted_at", null)
        .gte("started_at", inicios[0]!)
        .lte("started_at", inicios[inicios.length - 1]!),
    ).map((s) => new Date(s.started_at).getTime()),
  );

  const aImportar = parsed.workouts.filter((w) => {
    const dup = existentes.has(new Date(w.startedAt).getTime());
    if (dup) resumo.duplicates++;
    return !dup;
  });

  // 3. Sessões em lotes de 200; as séries de cada lote em seguida.
  for (let i = 0; i < aImportar.length; i += 200) {
    const lote = aImportar.slice(i, i + 200);
    // ponytail: confia que o INSERT … RETURNING devolve na ordem enviada (é o que o
    // Postgres faz); se um dia não for, casar por started_at.
    const sessoes = unwrapList(
      "gravar treinos importados",
      await supabase
        .from("workout_sessions")
        .insert(
          lote.map((w) => {
            const inicio = new Date(w.startedAt);
            const duracao = w.durationSeconds ?? 3600;
            return {
              user_id: userId,
              name: w.name,
              started_at: inicio.toISOString(),
              ended_at: new Date(inicio.getTime() + duracao * 1000).toISOString(),
              duration_seconds: Math.min(duracao, 86_400),
              total_volume_kg: sessionVolume(
                w.exercises.flatMap((e) =>
                  e.sets.map((s) => ({
                    weightKg: s.weightKg,
                    reps: s.reps,
                    setType: s.warmup ? "warmup" : "working",
                    completed: true,
                  })),
                ),
              ),
            };
          }),
        )
        .select("id"),
    );

    const series = lote.flatMap((w, k) =>
      w.exercises.flatMap((e, posicao) =>
        e.sets.map((s, idx) => ({
          session_id: sessoes[k]!.id,
          exercise_id: idPorNome.get(e.name)!,
          position: posicao,
          set_index: idx + 1,
          set_type: s.warmup ? ("warmup" as const) : ("working" as const),
          // Fora das faixas do banco vira vazio (ex.: carga negativa de exercício
          // assistido no Strong) em vez de derrubar a importação inteira.
          weight_kg: dentro(s.weightKg, 0, 1000),
          reps: dentro(s.reps === null ? null : Math.round(s.reps), 0, 1000),
          distance_m: dentro(s.distanceM, 0, 500_000),
          duration_seconds: dentro(s.durationSeconds, 0, 86_400),
          rpe: dentro(s.rpe, 0, 10),
          completed: true,
        })),
      ),
    );
    for (let j = 0; j < series.length; j += 500) {
      assertOk(
        "gravar séries importadas",
        await supabase.from("workout_sets").insert(series.slice(j, j + 500)),
      );
    }
    resumo.workouts += lote.length;
    resumo.sets += series.length;
  }

  return resumo;
}

function dentro(v: number | null, min: number, max: number): number | null {
  return v !== null && v >= min && v <= max ? v : null;
}
