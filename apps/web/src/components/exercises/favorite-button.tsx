import { Heart } from "lucide-react";
import { useFavoritos } from "@/data/exercise-favorites";
import { cn } from "@/lib/utils";

/** Coração de favoritar: cheio em vermelho quando favorito. */
export function FavoriteButton({
  exerciseId,
  nome,
  className,
}: {
  exerciseId: string;
  nome: string;
  className?: string;
}) {
  const { ids, alternar } = useFavoritos();
  const ativo = ids.has(exerciseId);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        alternar(exerciseId);
      }}
      aria-pressed={ativo}
      aria-label={ativo ? `Tirar ${nome} dos favoritos` : `Favoritar ${nome}`}
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full transition-transform active:scale-90",
        className,
      )}
    >
      <Heart
        className={cn(
          "size-5 transition-colors",
          ativo ? "fill-[#FF4D6D] text-[#FF4D6D]" : "text-muted-foreground",
        )}
      />
    </button>
  );
}
