import { Trash2 } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/confirm-button";
import { PHOTO_ANGLE_LABELS, label } from "@/lib/labels";
import { formatShortDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { PhotoSession, ProgressPhoto } from "@/data/progress-photos";

/**
 * Linha do tempo da evolução.
 *
 * ## Por que linha do tempo e não grade
 *
 * Uma grade de miniaturas ordenada por data mostra as mesmas fotos e não conta
 * história nenhuma: tudo tem o mesmo peso e nada indica distância no tempo. Na
 * linha, cada parada é uma data com o peso daquele dia ao lado das fotos — a
 * leitura "agosto 65 kg, setembro 67, outubro 69" acontece sozinha, de cima
 * para baixo, sem que nada precise ser calculado.
 *
 * ## A variação entre paradas
 *
 * Cada sessão mostra o quanto mudou desde a anterior, não desde o começo. É a
 * informação que a pessoa procura ao olhar duas fotos vizinhas — e a acumulada
 * desde o início já está no cabeçalho do perfil.
 */
export function PhotoTimeline({
  sessions,
  urls,
  selection,
  onToggleSelect,
  onDelete,
}: {
  sessions: readonly PhotoSession[];
  urls: Record<string, string>;
  /** Datas escolhidas para comparação, na ordem em que foram escolhidas. */
  selection: readonly string[];
  onToggleSelect: (date: string) => void;
  onDelete: (photo: ProgressPhoto) => void;
}) {
  return (
    <ol className="relative space-y-6">
      {/* A linha vertical liga as paradas. `aria-hidden` porque é desenho: a
          sequência já está na semântica da lista ordenada. */}
      <span
        className="absolute inset-y-2 left-[7px] w-0.5 rounded-full bg-border"
        aria-hidden
      />

      {sessions.map((sessao, i) => {
        const anterior = sessions[i + 1];
        const delta =
          sessao.weightKg !== null && anterior?.weightKg != null
            ? sessao.weightKg - anterior.weightKg
            : null;
        const selecionada = selection.includes(sessao.date);
        const ordemSelecao = selection.indexOf(sessao.date);

        return (
          <li
            key={sessao.date}
            className="relative pl-7 animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-500"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <span
              className={cn(
                "absolute left-0 top-1.5 size-[15px] rounded-full border-2 border-background transition-all",
                selecionada || i === 0
                  ? "bg-primary"
                  : "bg-primary/40",
                selecionada && "scale-125",
              )}
              aria-hidden
            />

            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h3 className="font-bold">{formatShortDate(sessao.date)}</h3>

              {sessao.weightKg !== null && (
                <span className="text-sm tabular-nums text-muted-foreground">
                  {sessao.weightKg.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg
                </span>
              )}

              {delta !== null && delta !== 0 && (
                <Badge variant={delta > 0 ? "soft" : "outline"} className="tabular-nums">
                  {delta > 0 ? "+" : ""}
                  {delta.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg
                </Badge>
              )}

              <button
                type="button"
                onClick={() => onToggleSelect(sessao.date)}
                aria-pressed={selecionada}
                className={cn(
                  "press-feedback ml-auto rounded-full border px-3 py-1 text-xs font-bold cursor-pointer transition-colors",
                  selecionada
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-primary/40 text-primary hover:bg-primary/10",
                )}
              >
                {selecionada ? `Comparando ${ordemSelecao + 1}` : "Comparar"}
              </button>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {sessao.photos.map((foto) => {
                const descricao = `${label(PHOTO_ANGLE_LABELS, foto.angle)}, ${formatShortDate(foto.log_date)}`;
                const url = urls[foto.storage_path];

                return (
                  <figure
                    key={foto.id}
                    className={cn(
                      "group relative overflow-hidden rounded-2xl border-2 transition-all duration-300",
                      selecionada ? "border-primary" : "border-transparent",
                    )}
                  >
                    {url ? (
                      <img
                        src={url}
                        alt={`Foto de progresso — ${descricao}`}
                        width={300}
                        height={400}
                        loading="lazy"
                        className="aspect-[3/4] w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <Skeleton className="aspect-[3/4] w-full rounded-none" />
                    )}

                    <figcaption className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/55 px-2 pb-1.5 pt-6 text-[11px] font-semibold text-white">
                      <span className="truncate rounded-full bg-[#01D798] px-2 py-0.5 text-[#020306]">{label(PHOTO_ANGLE_LABELS, foto.angle)}</span>
                      <ConfirmButton
                        aria-label={`Excluir foto: ${descricao}`}
                        title="Excluir esta foto?"
                        description="A imagem é removida permanentemente do armazenamento."
                        className="size-6 shrink-0 text-white hover:bg-white/20 hover:text-white"
                        onConfirm={() => onDelete(foto)}
                      >
                        <Trash2 className="size-3" />
                      </ConfirmButton>
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
