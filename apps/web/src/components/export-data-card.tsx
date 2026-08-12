/**
 * Exportação de dados — exibida no perfil.
 *
 * Poder levar os próprios dados embora é requisito de confiança num app que
 * acumula anos de histórico, e a LGPD garante esse direito. Também serve de
 * backup manual enquanto não há sincronização multi-dispositivo.
 */
import { useState } from "react";
import { Download, FileJson, FileSpreadsheet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { errorMessage } from "@/data/supabase-helpers";
import {
  downloadFile,
  exportFilename,
  fetchExportBundle,
  toCsv,
  type ExportFormat,
} from "@/data/export";

export function ExportDataCard() {
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  const exportar = async (format: ExportFormat) => {
    setExporting(format);
    try {
      const bundle = await fetchExportBundle();

      if (format === "json") {
        downloadFile(
          JSON.stringify(bundle, null, 2),
          exportFilename("dados", "json"),
          "application/json",
        );
      } else {
        // CSV é uma tabela — um arquivo por conjunto seria melhor, mas exigiria
        // um zip. Concatenar com cabeçalhos de seção mantém tudo num arquivo só
        // e ainda abre no Excel.
        const secoes: [string, readonly unknown[]][] = [
          ["Pesos", bundle.pesos],
          ["Medidas", bundle.medidas],
          ["Treinos", bundle.treinos],
          ["Séries", bundle.series],
          ["Diário alimentar", bundle.diarioAlimentar],
          ["Receitas", bundle.receitas],
        ];
        const csv = secoes
          .filter(([, rows]) => rows.length > 0)
          .map(([titulo, rows]) => `## ${titulo}\n${toCsv(rows)}`)
          .join("\n\n");
        downloadFile(csv, exportFilename("dados", "csv"), "text/csv");
      }

      toast.success("Exportação concluída", {
        description: "O arquivo foi baixado para o seu dispositivo.",
      });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setExporting(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Download className="size-4" aria-hidden />
          Seus dados
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Baixe tudo o que você registrou: treinos, séries, diário alimentar, receitas, pesos e
          medidas. Seus dados são seus — leve-os quando quiser.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => void exportar("json")}
            disabled={exporting !== null}
          >
            <FileJson className="mr-1.5 size-4" />
            {exporting === "json" ? "Exportando…" : "Exportar JSON"}
          </Button>
          <Button
            variant="outline"
            onClick={() => void exportar("csv")}
            disabled={exporting !== null}
          >
            <FileSpreadsheet className="mr-1.5 size-4" />
            {exporting === "csv" ? "Exportando…" : "Exportar CSV"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          JSON preserva a estrutura completa (ideal para backup ou migração). CSV abre direto no
          Excel e no Google Planilhas.
        </p>
      </CardContent>
    </Card>
  );
}
