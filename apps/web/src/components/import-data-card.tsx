/**
 * Importar histórico de outro app — exibida no perfil, junto da exportação.
 *
 * Quem troca de app não quer recomeçar do zero: Strong, Hevy, FitNotes e CSVs
 * parecidos entram aqui. Importar o mesmo arquivo de novo não duplica nada.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { parseWorkoutCsv } from "@forja/domain";
import { importWorkouts, type ImportSummary } from "@/data/import";
import { queryKeys } from "@/data/query-keys";
import { errorMessage } from "@/data/supabase-helpers";
import { useCurrentUserId } from "@/hooks/use-current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/** Limite de tamanho: um histórico de anos do Strong tem poucos MB. */
const MAX_BYTES = 20 * 1024 * 1024;

export function ImportDataCard() {
  const userId = useCurrentUserId();
  const qc = useQueryClient();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [unidade, setUnidade] = useState<"kg" | "lb">("kg");
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<(ImportSummary & { skipped: number }) | null>(null);

  const importar = async () => {
    if (!arquivo) return;
    if (arquivo.size > MAX_BYTES) {
      toast.error("Arquivo grande demais", { description: "O limite é 20 MB." });
      return;
    }
    setImportando(true);
    setResultado(null);
    try {
      const parsed = parseWorkoutCsv(await arquivo.text(), unidade);
      if (parsed.workouts.length === 0) {
        toast.error("Nenhum treino encontrado", {
          description: "Confira se é o CSV exportado pelo app (com colunas de data e exercício).",
        });
        return;
      }
      const resumo = await importWorkouts(userId, parsed);
      setResultado({ ...resumo, skipped: parsed.skipped.length });
      void qc.invalidateQueries({ queryKey: queryKeys.workouts.all });
      void qc.invalidateQueries({ queryKey: queryKeys.exercises.all });
      toast.success(`${resumo.workouts} treinos importados`);
    } catch (e) {
      toast.error("Não foi possível importar", { description: errorMessage(e) });
    } finally {
      setImportando(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Importar de outro app</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Traga seu histórico do Strong, Hevy ou FitNotes: exporte o CSV no app e envie aqui. Os
          exercícios são reconhecidos pelo nome; os que não estiverem na biblioteca viram exercícios
          seus.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="block">
            <span className="sr-only">Arquivo CSV</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
              className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Pesos em</span>
            <select
              value={unidade}
              onChange={(e) => setUnidade(e.target.value as "kg" | "lb")}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="kg">kg</option>
              <option value="lb">lb</option>
            </select>
          </label>
          <Button onClick={() => void importar()} disabled={!arquivo || importando}>
            <Upload className="mr-1.5 size-4" aria-hidden />
            {importando ? "Importando…" : "Importar"}
          </Button>
        </div>
        {resultado && (
          <p className="text-sm" role="status">
            {resultado.workouts} treinos e {resultado.sets} séries importados
            {resultado.duplicates > 0 && ` · ${resultado.duplicates} já existiam`}
            {resultado.skipped > 0 && ` · ${resultado.skipped} linhas ignoradas`}
            {resultado.newExercises.length > 0 &&
              ` · ${resultado.newExercises.length} exercícios novos criados`}
            .
          </p>
        )}
      </CardContent>
    </Card>
  );
}
