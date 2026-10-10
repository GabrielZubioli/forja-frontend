import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/data/query-keys";
import { assertOk, errorMessage, num, unwrap, unwrapList } from "@/data/supabase-helpers";
import { useCurrentUserId } from "@/hooks/use-current-user";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/confirm-button";
import { ErrorState } from "@/components/query-boundary";
import { ExercisePicker } from "@/components/pickers/exercise-picker";
import { Plus, Trash2, ArrowUp, ArrowDown, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MUSCLE_LABELS, label } from "@/lib/labels";

export const Route = createFileRoute("/_authenticated/workouts_/templates/$id")({
  head: () => ({
    meta: [
      { title: "Editar template — Habitual Fit" },
      { name: "description", content: "Monte e edite seus templates de treino." },
      { property: "og:title", content: "Editar template — Habitual Fit" },
      { property: "og:description", content: "Adicione exercícios, séries e reps alvo." },
    ],
  }),
  component: TemplateEditor,
});

const DEFAULTS = { targetSets: 3, targetReps: 10, restSeconds: 90 };

type TemplateItem = {
  id: string;
  template_id: string;
  exercise_id: string;
  position: number;
  target_sets: number | null;
  target_reps: number | null;
  rest_seconds: number | null;
  notes: string | null;
  superset_group: number | null;
  exercises: { id: string; name: string; category: string; primary_muscle: string };
};

function TemplateEditor() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const userId = useCurrentUserId();
  const isNew = id === "new";

  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  const template = useQuery({
    queryKey: queryKeys.workouts.template(id),
    enabled: !isNew,
    queryFn: async () =>
      unwrap(
        "carregar template",
        await supabase.from("workout_templates").select("*").eq("id", id).single(),
      ),
  });

  const items = useQuery({
    queryKey: queryKeys.workouts.templateItems(id),
    enabled: !isNew,
    queryFn: async () =>
      unwrapList(
        "carregar exercícios do template",
        await supabase
          .from("workout_template_exercises")
          .select("*, exercises(id, name, category, primary_muscle)")
          .eq("template_id", id)
          .order("position"),
      ) as TemplateItem[],
  });

  useEffect(() => {
    if (!template.data) return;
    setName(template.data.name);
    setNotes(template.data.notes ?? "");
  }, [template.data]);

  const itemsKey = queryKeys.workouts.templateItems(id);
  const invalidateItems = () => qc.invalidateQueries({ queryKey: itemsKey });

  const createTemplate = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Dê um nome ao template.");
      const created = unwrap(
        "criar template",
        await supabase
          .from("workout_templates")
          .insert({ user_id: userId, name: trimmed, notes: notes.trim() || null })
          .select("id")
          .single(),
      );
      return created.id;
    },
    onSuccess: (newId) => {
      toast.success("Template criado — agora adicione os exercícios");
      void qc.invalidateQueries({ queryKey: queryKeys.workouts.templates() });
      void navigate({ to: "/workouts/templates/$id", params: { id: newId }, replace: true });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const saveTemplate = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Dê um nome ao template.");
      assertOk(
        "salvar template",
        await supabase
          .from("workout_templates")
          .update({ name: trimmed, notes: notes.trim() || null })
          .eq("id", id),
      );
    },
    onSuccess: () => {
      toast.success("Template salvo");
      void qc.invalidateQueries({ queryKey: queryKeys.workouts.templates() });
      void qc.invalidateQueries({ queryKey: queryKeys.workouts.template(id) });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const addExercise = useMutation({
    mutationFn: async (exerciseId: string) => {
      const position = (items.data?.at(-1)?.position ?? 0) + 1;
      assertOk(
        "adicionar exercício",
        await supabase.from("workout_template_exercises").insert({
          template_id: id,
          exercise_id: exerciseId,
          position,
          target_sets: DEFAULTS.targetSets,
          target_reps: DEFAULTS.targetReps,
          rest_seconds: DEFAULTS.restSeconds,
        }),
      );
    },
    onSuccess: () => void invalidateItems(),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const updateItem = useMutation({
    mutationFn: async (patch: Partial<TemplateItem> & { id: string }) => {
      const { id: itemId, exercises: _exercises, ...changes } = patch;
      assertOk(
        "atualizar exercício",
        await supabase.from("workout_template_exercises").update(changes).eq("id", itemId),
      );
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: itemsKey });
      const previous = qc.getQueryData<TemplateItem[]>(itemsKey);
      qc.setQueryData<TemplateItem[]>(itemsKey, (current) =>
        (current ?? []).map((it) => (it.id === patch.id ? { ...it, ...patch } : it)),
      );
      return { previous };
    },
    onError: (e, _patch, context) => {
      if (context?.previous) qc.setQueryData(itemsKey, context.previous);
      toast.error(errorMessage(e));
    },
    onSettled: () => void invalidateItems(),
  });

  const deleteItem = useMutation({
    mutationFn: async (itemId: string) => {
      assertOk(
        "remover exercício",
        await supabase.from("workout_template_exercises").delete().eq("id", itemId),
      );
    },
    onSuccess: () => void invalidateItems(),
    onError: (e) => toast.error(errorMessage(e)),
  });

  /**
   * Troca dois exercícios de posição.
   *
   * `position` tem restrição de unicidade por template, então a troca direta
   * colidiria — daí o valor temporário `-1`. A lista é reordenada de forma
   * otimista para que a seta responda na hora, em vez de esperar três
   * requisições sequenciais mais o refetch.
   */
  const swap = useMutation({
    mutationFn: async ({ a, b }: { a: TemplateItem; b: TemplateItem }) => {
      const table = () => supabase.from("workout_template_exercises");
      assertOk("reordenar (1/3)", await table().update({ position: -1 }).eq("id", a.id));
      assertOk("reordenar (2/3)", await table().update({ position: a.position }).eq("id", b.id));
      assertOk("reordenar (3/3)", await table().update({ position: b.position }).eq("id", a.id));
    },
    onMutate: async ({ a, b }) => {
      await qc.cancelQueries({ queryKey: itemsKey });
      const previous = qc.getQueryData<TemplateItem[]>(itemsKey);
      qc.setQueryData<TemplateItem[]>(itemsKey, (current) =>
        (current ?? [])
          .map((it) => {
            if (it.id === a.id) return { ...it, position: b.position };
            if (it.id === b.id) return { ...it, position: a.position };
            return it;
          })
          .sort((x, y) => x.position - y.position),
      );
      return { previous };
    },
    onError: (e, _vars, context) => {
      if (context?.previous) qc.setQueryData(itemsKey, context.previous);
      toast.error(errorMessage(e));
    },
    onSettled: () => void invalidateItems(),
  });

  const list = items.data ?? [];

  return (
    <>
      <PageHeader
        title={isNew ? "Novo template" : name || "Template"}
        description="Monte a sequência, séries alvo e descanso. Ao iniciar o treino, tudo isso é copiado para a sessão."
        action={
          <>
            <Button variant="outline" asChild>
              <Link to="/plan">Voltar</Link>
            </Button>
            {isNew ? (
              <Button onClick={() => createTemplate.mutate()} disabled={createTemplate.isPending}>
                <Save className="mr-1 size-4" />
                Criar
              </Button>
            ) : (
              <Button onClick={() => saveTemplate.mutate()} disabled={saveTemplate.isPending}>
                <Save className="mr-1 size-4" />
                Salvar
              </Button>
            )}
          </>
        }
      />
      <PageBody>
        {template.isError ? (
          <ErrorState message={errorMessage(template.error)} onRetry={template.refetch} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardContent className="space-y-3 p-4">
                <div className="space-y-1.5">
                  <Label htmlFor="tpl-name">Nome</Label>
                  <Input
                    id="tpl-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Push A"
                    autoFocus={isNew}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tpl-notes">Notas</Label>
                  <Textarea
                    id="tpl-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Observações do treino"
                    rows={4}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardContent className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold">Exercícios</h2>
                  {!isNew && (
                    <ExercisePicker
                      onPick={(ex) => addExercise.mutateAsync(ex.id)}
                      trigger={
                        <Button size="sm">
                          <Plus className="mr-1 size-4" />
                          Adicionar
                        </Button>
                      }
                    />
                  )}
                </div>

                {isNew ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Dê um nome e toque em <b>Criar</b> para começar a adicionar exercícios.
                  </p>
                ) : items.isPending ? (
                  <div className="space-y-2">
                    {[0, 1, 2].map((i) => (
                      <Skeleton key={i} className="h-28 w-full rounded-lg" />
                    ))}
                  </div>
                ) : items.isError ? (
                  <ErrorState message={errorMessage(items.error)} onRetry={items.refetch} compact />
                ) : list.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum exercício ainda. Adicione o primeiro para montar sua rotina.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {list.map((it, index) => (
                      <li key={it.id} className="rounded-lg border border-border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">
                              {index + 1}. {it.exercises.name}
                            </p>
                            <Badge variant="secondary" className="mt-1">
                              {label(MUSCLE_LABELS, it.exercises.primary_muscle)}
                            </Badge>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              disabled={index === 0 || swap.isPending}
                              onClick={() => swap.mutate({ a: it, b: list[index - 1] })}
                              aria-label={`Mover ${it.exercises.name} para cima`}
                            >
                              <ArrowUp className="size-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              disabled={index === list.length - 1 || swap.isPending}
                              onClick={() => swap.mutate({ a: it, b: list[index + 1] })}
                              aria-label={`Mover ${it.exercises.name} para baixo`}
                            >
                              <ArrowDown className="size-4" />
                            </Button>
                            <ConfirmButton
                              aria-label={`Remover ${it.exercises.name} do template`}
                              title="Remover exercício?"
                              description={`“${it.exercises.name}” sai deste template. Treinos já registrados não são afetados.`}
                              confirmLabel="Remover"
                              onConfirm={() => deleteItem.mutate(it.id)}
                            >
                              <Trash2 className="size-4" />
                            </ConfirmButton>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-2">
                          <NumberField
                            label="Séries"
                            id={`sets-${it.id}`}
                            value={it.target_sets}
                            min={1}
                            max={12}
                            onCommit={(v) => updateItem.mutate({ id: it.id, target_sets: v })}
                          />
                          <NumberField
                            label="Reps"
                            id={`reps-${it.id}`}
                            value={it.target_reps}
                            min={1}
                            max={100}
                            onCommit={(v) => updateItem.mutate({ id: it.id, target_reps: v })}
                          />
                          <NumberField
                            label="Descanso (s)"
                            id={`rest-${it.id}`}
                            value={it.rest_seconds}
                            min={0}
                            max={900}
                            onCommit={(v) => updateItem.mutate({ id: it.id, rest_seconds: v })}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </PageBody>
    </>
  );
}

/** Campo numérico que valida a faixa antes de gravar e reverte entradas inválidas. */
function NumberField({
  label: fieldLabel,
  id,
  value,
  min,
  max,
  onCommit,
}: {
  label: string;
  id: string;
  value: number | null;
  min: number;
  max: number;
  onCommit: (value: number | null) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {fieldLabel}
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        defaultValue={value ?? ""}
        onBlur={(e) => {
          const raw = e.target.value;
          if (raw === "") return onCommit(null);
          const parsed = Number(raw);
          if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
            toast.error(`${fieldLabel}: informe um valor entre ${min} e ${max}.`);
            e.target.value = String(value ?? "");
            return;
          }
          if (parsed !== num(value, Number.NaN)) onCommit(parsed);
        }}
      />
    </div>
  );
}
