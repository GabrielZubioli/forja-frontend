import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, GripVertical, Info, MoreVertical, Repeat, Timer, Trash2 } from "lucide-react";
import { errorMessage } from "@/data/supabase-helpers";
import {
  duplicateTemplateItem,
  removeTemplateItem,
  swapTemplateExercise,
  updateTemplateItem,
  type WeekExercise,
  type WeekSplit,
} from "@/data/workout-week";
import { exerciseImages } from "@/data/exercise-media";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmButton } from "@/components/confirm-button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ExerciseDemo } from "@/components/workouts/exercise-demo-images";
import { ExercisePicker } from "@/components/pickers/exercise-picker";
import { EQUIPMENT_LABELS, label } from "@/lib/labels";

/**
 * Uma linha de exercício.
 *
 * Séries, repetições, carga e descanso são editáveis **no lugar**, sem abrir
 * diálogo. Ajustar o descanso de 90 para 120 segundos é uma decisão de dois
 * segundos que não merece uma tela; empurrá-la para um modal é o que faz o
 * usuário desistir de personalizar e acabar seguindo um plano que não serve.
 */
export function RoutineExerciseRow({
  exercise,
  index,
  templateId,
  onOpenDetail,
  onChanged,
}: {
  exercise: WeekExercise;
  index: number;
  templateId: string;
  onOpenDetail: () => void;
  onChanged: () => void | Promise<unknown>;
}) {
  const [expandido, setExpandido] = useState(false);
  const [confirmarRemocao, setConfirmarRemocao] = useState(false);

  const salvar = useMutation({
    mutationFn: (patch: Parameters<typeof updateTemplateItem>[1]) =>
      updateTemplateItem(exercise.itemId, patch),
    onSuccess: () => void onChanged(),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remover = useMutation({
    mutationFn: () => removeTemplateItem(exercise.itemId),
    onSuccess: () => {
      toast.success("Exercício removido");
      void onChanged();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const duplicar = useMutation({
    mutationFn: () => duplicateTemplateItem(exercise, templateId),
    onSuccess: () => {
      toast.success("Exercício duplicado");
      void onChanged();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const trocar = useMutation({
    mutationFn: (newId: string) => swapTemplateExercise(exercise.itemId, newId),
    onSuccess: () => {
      toast.success("Exercício trocado — séries e descanso preservados");
      void onChanged();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const faixaReps =
    exercise.targetRepMin && exercise.targetRepMax
      ? `${exercise.targetRepMin}–${exercise.targetRepMax}`
      : String(exercise.targetReps);

  return (
    <li>
      <Card className="overflow-hidden transition-shadow hover:shadow-sm">
        <CardContent className="p-3">
          <div className="flex gap-3">
            <span className="mt-1 hidden text-muted-foreground sm:block" aria-hidden>
              <GripVertical className="size-4" />
            </span>

            <button
              type="button"
              onClick={onOpenDetail}
              className="shrink-0"
              aria-label={`Ver detalhes de ${exercise.name}`}
            >
              <ExerciseDemo
                images={exerciseImages(exercise.name, exercise.imageUrls)}
                name={exercise.name}
                autoPlay={false}
                interactive={false}
                className="w-20 sm:w-24"
              />
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <button type="button" onClick={onOpenDetail} className="min-w-0 flex-1 text-left">
                  <p className="text-balance font-semibold leading-snug">
                    <span className="mr-1.5 text-muted-foreground">{index + 1}.</span>
                    {exercise.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {label(EQUIPMENT_LABELS, exercise.equipment)}
                    {exercise.supersetGroup !== null && " · em supersérie"}
                  </p>
                </button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 shrink-0"
                      aria-label={`Opções de ${exercise.name}`}
                    >
                      <MoreVertical className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={onOpenDetail}>
                      <Info className="mr-2 size-4" />
                      Ver execução
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setExpandido((v) => !v)}>
                      <Timer className="mr-2 size-4" />
                      {expandido ? "Ocultar ajustes" : "Ajustar séries e descanso"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => duplicar.mutate()}>
                      <Copy className="mr-2 size-4" />
                      Duplicar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <ExercisePicker
                      title={`Trocar ${exercise.name}`}
                      muscle={exercise.primaryMuscle}
                      onPick={async (ex) => trocar.mutateAsync(ex.id)}
                      trigger={
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                          <Repeat className="mr-2 size-4" />
                          Trocar exercício
                        </DropdownMenuItem>
                      }
                    />
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => setConfirmarRemocao(true)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 size-4" />
                      Remover do plano
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" className="tabular-nums font-normal">
                  {exercise.targetSets} × {faixaReps}
                </Badge>
                <Badge variant="outline" className="tabular-nums font-normal">
                  {exercise.restSeconds}s descanso
                </Badge>
                {exercise.targetRpe && (
                  <Badge variant="outline" className="tabular-nums font-normal">
                    RPE {exercise.targetRpe}
                  </Badge>
                )}
                {exercise.cadence && (
                  <Badge variant="outline" className="tabular-nums font-normal">
                    {exercise.cadence}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {expandido && (
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 sm:grid-cols-4">
              <NumberInput
                label="Séries"
                value={exercise.targetSets}
                min={1}
                max={12}
                onCommit={(v) => salvar.mutate({ target_sets: v })}
              />
              <NumberInput
                label="Repetições"
                value={exercise.targetReps}
                min={1}
                max={100}
                onCommit={(v) => salvar.mutate({ target_reps: v })}
              />
              <NumberInput
                label="Descanso (s)"
                value={exercise.restSeconds}
                min={0}
                max={600}
                step={15}
                onCommit={(v) => salvar.mutate({ rest_seconds: v })}
              />
              <NumberInput
                label="RPE alvo"
                value={exercise.targetRpe ?? 8}
                min={1}
                max={10}
                onCommit={(v) => salvar.mutate({ target_rpe: v })}
              />

              <div className="col-span-2 flex items-end sm:col-span-4">
                <ConfirmButton
                  aria-label={`Remover ${exercise.name} do treino`}
                  title="Remover do treino?"
                  description={`“${exercise.name}” sai desta divisão. Seu histórico de séries continua salvo.`}
                  confirmLabel="Remover"
                  onConfirm={() => remover.mutate()}
                >
                  <Trash2 className="mr-1.5 size-4" />
                  Remover exercício
                </ConfirmButton>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={confirmarRemocao}
        onOpenChange={setConfirmarRemocao}
        title="Remover do plano?"
        description={`“${exercise.name}” sai desta rotina. Seu histórico de séries continua salvo.`}
        confirmLabel="Remover"
        destructive
        onConfirm={() => remover.mutate()}
      />
    </li>
  );
}

/**
 * Campo numérico que grava ao sair do foco, não a cada tecla.
 *
 * Gravar a cada dígito produziria uma escrita por caractere — "120" viraria
 * três requisições, e o valor intermediário "1" chegaria a ser persistido.
 */
function NumberInput({
  label: labelText,
  value,
  min,
  max,
  step = 1,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{labelText}</span>
      <Input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = Number(draft);
          if (!Number.isFinite(n)) return setDraft(String(value));
          const clamped = Math.max(min, Math.min(max, n));
          setDraft(String(clamped));
          if (clamped !== value) onCommit(clamped);
        }}
        className="h-10 tabular-nums"
      />
    </label>
  );
}

/**
 * Duração estimada do treino.
 *
 * Soma o descanso prescrito com ~35 s por série de execução. É uma
 * aproximação declarada como tal ("~45 min"), não uma promessa: o tempo real
 * depende de fila no aparelho e de conversa entre séries.
 */
export function estimarDuracao(split: WeekSplit): string {
  const segundos = split.exercises.reduce(
    (total, e) => total + e.targetSets * (e.restSeconds + 35),
    0,
  );
  return `~${Math.round(segundos / 60)} min`;
}
