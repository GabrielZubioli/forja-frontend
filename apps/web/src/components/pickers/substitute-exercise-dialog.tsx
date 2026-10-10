/**
 * Substituição de exercício dentro de um treino em andamento.
 *
 * O aparelho está ocupado, dói o ombro naquele ângulo, a academia não tem a
 * barra — antes disso a única saída era apagar o exercício e adicionar outro,
 * perdendo as séries já registradas. Aqui a troca preserva séries, peso, reps e
 * posição: muda só qual movimento está sendo feito.
 *
 * As alternativas são filtradas pelo **mesmo músculo primário**, ordenadas por
 * proximidade de equipamento, para a sugestão fazer sentido sem o usuário
 * precisar pensar.
 */
import { type ReactNode, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Repeat, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { unwrapList } from "@/data/supabase-helpers";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ErrorState } from "@/components/query-boundary";
import { EQUIPMENT_LABELS, MUSCLE_LABELS, label } from "@/lib/labels";

export type SubstituteCandidate = {
  id: string;
  name: string;
  primary_muscle: string;
  equipment: string;
  category: string;
};

export function SubstituteExerciseDialog({
  currentExerciseId,
  currentExerciseName,
  primaryMuscle,
  currentEquipment,
  onSubstitute,
  isPending,
  trigger,
}: {
  currentExerciseId: string;
  currentExerciseName: string;
  primaryMuscle: string;
  currentEquipment?: string;
  onSubstitute: (exercise: SubstituteCandidate) => void | Promise<void>;
  isPending?: boolean;
  /** Gatilho próprio (ex.: item de menu). Padrão: botão com ícone de troca. */
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const debouncedTerm = useDebouncedValue(term.trim(), 250);

  const alternatives = useQuery({
    queryKey: ["substitutes", primaryMuscle, currentExerciseId, debouncedTerm],
    enabled: open,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      let query = supabase
        .from("exercises")
        .select("id, name, primary_muscle, equipment, category")
        .is("deleted_at", null)
        .eq("primary_muscle", primaryMuscle as never)
        .neq("id", currentExerciseId)
        .order("name")
        .limit(50);
      if (debouncedTerm) query = query.ilike("name", `%${debouncedTerm}%`);

      const rows = unwrapList("buscar alternativas", await query) as SubstituteCandidate[];

      // Mesmo equipamento primeiro: é a troca com menor mudança de padrão.
      if (!currentEquipment) return rows;
      return [...rows].sort((a, b) => {
        const pesoA = a.equipment === currentEquipment ? 0 : 1;
        const pesoB = b.equipment === currentEquipment ? 0 : 1;
        return pesoA - pesoB || a.name.localeCompare(b.name, "pt-BR");
      });
    },
  });

  const escolher = async (exercise: SubstituteCandidate) => {
    await onSubstitute(exercise);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label={`Substituir ${currentExerciseName} por outro exercício`}
            disabled={isPending}
          >
            <Repeat className="size-4" />
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Substituir exercício</DialogTitle>
          <DialogDescription>
            As séries já registradas de <b>{currentExerciseName}</b> são mantidas — muda apenas o
            movimento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={`Alternativas para ${label(MUSCLE_LABELS, primaryMuscle).toLowerCase()}…`}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="pl-9"
              autoFocus
              aria-label="Buscar exercício alternativo"
            />
            {alternatives.isFetching && (
              <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>

          <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
            {alternatives.isPending ? (
              <div className="space-y-3 p-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            ) : alternatives.isError ? (
              <div className="p-3">
                <ErrorState
                  message="Falha ao buscar alternativas."
                  onRetry={alternatives.refetch}
                  compact
                />
              </div>
            ) : alternatives.data.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Nenhuma alternativa para {label(MUSCLE_LABELS, primaryMuscle).toLowerCase()}
                {debouncedTerm ? ` com “${debouncedTerm}”` : ""}.
              </p>
            ) : (
              <ul>
                {alternatives.data.map((exercise) => (
                  <li key={exercise.id}>
                    <button
                      type="button"
                      onClick={() => void escolher(exercise)}
                      className="flex w-full items-center justify-between gap-3 border-b border-border/50 px-4 py-2.5 text-left transition-colors last:border-b-0 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    >
                      <span className="min-w-0 truncate font-medium">{exercise.name}</span>
                      <Badge variant="outline" className="shrink-0">
                        {label(EQUIPMENT_LABELS, exercise.equipment)}
                      </Badge>
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
