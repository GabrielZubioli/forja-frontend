import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { createOwnExercise } from "@/data/workouts";
import { queryKeys } from "@/data/query-keys";
import { errorMessage } from "@/data/supabase-helpers";
import { useCurrentUserId } from "@/hooks/use-current-user";
import { Constants, type Enums } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EQUIPMENT_LABELS, MUSCLE_LABELS, label } from "@/lib/labels";

const SELECT =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** O aparelho da sua academia que não está no catálogo vira um exercício seu. */
export function CreateExerciseDialog() {
  const userId = useCurrentUserId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [musculo, setMusculo] = useState<Enums<"muscle_t">>("chest");
  const [equipamento, setEquipamento] = useState<Enums<"equipment_t">>("machine");

  const criar = useMutation({
    mutationFn: () =>
      createOwnExercise(userId, { name: nome, primaryMuscle: musculo, equipment: equipamento }),
    onSuccess: (id) => {
      toast.success("Exercício criado", { description: "Ele já aparece na busca e nas trocas." });
      void qc.invalidateQueries({ queryKey: queryKeys.exercises.all });
      setAberto(false);
      setNome("");
      void navigate({ to: "/exercises/$id", params: { id } });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const nomeValido = nome.trim().length >= 2 && nome.trim().length <= 80;

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="mr-1.5 size-4" aria-hidden />
          Criar exercício
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo exercício</DialogTitle>
          <DialogDescription>
            Para o aparelho ou variação que não está na biblioteca. Só você vê.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (nomeValido) criar.mutate();
          }}
        >
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Nome</span>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={80}
              placeholder="Ex.: Remada articulada Hammer"
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Músculo principal</span>
            <select
              className={SELECT}
              value={musculo}
              onChange={(e) => setMusculo(e.target.value as Enums<"muscle_t">)}
            >
              {Constants.public.Enums.muscle_t.map((valor) => (
                <option key={valor} value={valor}>
                  {label(MUSCLE_LABELS, valor)}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Equipamento</span>
            <select
              className={SELECT}
              value={equipamento}
              onChange={(e) => setEquipamento(e.target.value as Enums<"equipment_t">)}
            >
              {Constants.public.Enums.equipment_t.map((valor) => (
                <option key={valor} value={valor}>
                  {label(EQUIPMENT_LABELS, valor)}
                </option>
              ))}
            </select>
          </label>
          <DialogFooter>
            <Button type="submit" disabled={!nomeValido || criar.isPending}>
              {criar.isPending ? "Criando…" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
