/**
 * Seletor de exercício — usado na sessão ao vivo e no editor de template.
 *
 * Havia dois `AddExerciseDialog` separados: o da sessão tinha filtro por
 * músculo, o do template não; as listas de músculos, os limites e o tratamento
 * de "nada encontrado" divergiam. Este componente unifica os dois.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/data/query-keys";
import { unwrapList } from "@/data/supabase-helpers";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { MUSCLE_LABELS, EQUIPMENT_LABELS, type MuscleValue } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorState } from "@/components/query-boundary";
import { exerciseMedia } from "@/data/exercise-media";

export type PickedExercise = {
  id: string;
  name: string;
  category: string;
  primaryMuscle: string;
};

/** Músculos oferecidos como filtro — os que de fato têm exercícios no seed. */
const FILTERABLE_MUSCLES: MuscleValue[] = [
  "chest",
  "back",
  "lats",
  "shoulders",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "core",
  "abs",
  "cardio",
];

export function ExercisePicker({
  trigger,
  title = "Adicionar exercício",
  showMuscleFilter = true,
  muscle: initialMuscle,
  onPick,
}: {
  trigger: ReactNode;
  title?: string;
  showMuscleFilter?: boolean;
  /**
   * Músculo pré-selecionado. Ao trocar um exercício, filtrar pelo mesmo grupo
   * é quase sempre o que se quer — abrir a lista completa de 880 obrigaria o
   * usuário a refazer o filtro toda vez.
   */
  muscle?: string;
  onPick: (exercise: PickedExercise) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [muscle, setMuscle] = useState<string>(initialMuscle ?? "all");

  const debouncedTerm = useDebouncedValue(term.trim(), 300);

  useEffect(() => {
    if (open) return;
    const reset = setTimeout(() => {
      setTerm("");
      setMuscle(initialMuscle ?? "all");
    }, 150);
    return () => clearTimeout(reset);
  }, [open, initialMuscle]);

  const exercises = useQuery({
    queryKey: queryKeys.exercises.search(debouncedTerm, muscle),
    enabled: open,
    queryFn: async () => {
      let query = supabase
        .from("exercises")
        .select(
          "id, name, name_en, primary_muscle, equipment, category, image_urls, external_id, media_id, media_ref, media_source, video_url, popularity",
        )
        .is("deleted_at", null)
        // Popularidade antes do nome: com 880 exercícios, a ordem alfabética
        // coloca variações obscuras acima dos movimentos que todo mundo faz.
        .order("popularity", { ascending: false })
        .order("name")
        .limit(60);
      if (debouncedTerm) {
        // Busca também pelo nome original: quem treina há anos procura por
        // "romanian deadlift", não por "terra romeno".
        query = query.or(`name.ilike.%${debouncedTerm}%,name_en.ilike.%${debouncedTerm}%`);
      }
      if (muscle !== "all") query = query.eq("primary_muscle", muscle as never);
      return unwrapList("buscar exercícios", await query);
    },
  });

  const pick = async (ex: {
    id: string;
    name: string;
    category: string;
    primary_muscle: string;
  }) => {
    await onPick({
      id: ex.id,
      name: ex.name,
      category: ex.category,
      primaryMuscle: ex.primary_muscle,
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar exercício…"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                className="pl-9"
                autoFocus
                aria-label="Buscar exercício"
              />
              {exercises.isFetching && (
                <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>
            {showMuscleFilter && (
              <Select value={muscle} onValueChange={setMuscle}>
                <SelectTrigger className="sm:w-48" aria-label="Filtrar por músculo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os músculos</SelectItem>
                  {FILTERABLE_MUSCLES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {MUSCLE_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto rounded-lg border border-border">
            {exercises.isPending ? (
              <div className="space-y-3 p-4">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center justify-between gap-4">
                    <Skeleton className="h-4 w-2/5" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                ))}
              </div>
            ) : exercises.isError ? (
              <div className="p-3">
                <ErrorState
                  message="Falha ao buscar exercícios."
                  onRetry={exercises.refetch}
                  compact
                />
              </div>
            ) : exercises.data.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Nenhum exercício encontrado{debouncedTerm ? ` para “${debouncedTerm}”` : ""}.
              </p>
            ) : (
              <ul>
                {exercises.data.map((ex) => (
                  <li key={ex.id}>
                    <button
                      type="button"
                      onClick={() => void pick(ex)}
                      className="flex w-full items-center gap-3 border-b border-border/50 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    >
                      {/* A miniatura resolve o problema que o nome sozinho não
                          resolve: reconhecer o movimento sem abrir a ficha.

                          Vem da camada de mídia, não de `image_urls` direto: a
                          maior parte do catálogo tem a imagem numa fonte
                          externa e a coluna vazia — lendo a coluna, a lista
                          apareceria com um retângulo cinza em quase toda
                          linha. */}
                      <PickerThumb exercise={ex} />

                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{ex.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {MUSCLE_LABELS[ex.primary_muscle as MuscleValue] ?? ex.primary_muscle}
                          {" · "}
                          {EQUIPMENT_LABELS[ex.equipment as keyof typeof EQUIPMENT_LABELS] ??
                            ex.equipment}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Miniatura estática do exercício.
 *
 * Nunca o GIF: a lista mostra dezenas de itens por vez e animar todos custaria
 * megabytes e a fluidez da rolagem. Quem quer ver o movimento abre a ficha.
 */
function PickerThumb({
  exercise,
}: {
  exercise: {
    name: string;
    image_urls: string[] | null;
    external_id: string | null;
    media_id: string | null;
    media_ref: string | null;
    media_source: string | null;
  };
}) {
  const media = exerciseMedia({
    name: exercise.name,
    imageUrls: exercise.image_urls,
    externalId: exercise.external_id,
    mediaId: exercise.media_id,
    mediaRef: exercise.media_ref,
    mediaSource: exercise.media_source,
  });
  const thumb = media.images[0];

  if (!thumb) return <span className="size-14 shrink-0 rounded-md bg-muted" aria-hidden />;

  return (
    <img
      src={thumb}
      alt=""
      loading="lazy"
      decoding="async"
      width={56}
      height={56}
      className="size-14 shrink-0 rounded-md bg-muted object-contain"
    />
  );
}
