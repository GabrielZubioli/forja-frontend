import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Pencil, Play, Plus, Trash2, Wand2, X } from "lucide-react";
import { TRAINING_PROGRAMS, WEEKDAY_LABELS, weekdayOf, type Weekday } from "@forja/domain";
import { queryKeys } from "@/data/query-keys";
import { errorMessage } from "@/data/supabase-helpers";
import {
  createTemplate,
  deleteTemplate,
  ensureActiveRoutine,
  renameRoutine,
  renameTemplate,
  setTemplateIcon,
  setTemplateWeekdays,
  splitDisplayName,
} from "@/data/routines";
import { addTemplateItem, fetchWorkoutWeek, type WorkoutWeek } from "@/data/workout-week";
import { openWorkoutForTemplate } from "@/data/workout-session";
import { useCurrentUserId } from "@/hooks/use-current-user";
import { PageBody, PageHeader, headerIconClass } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ErrorState } from "@/components/query-boundary";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { NoRoutineCard } from "@/components/home/today-workout-card";
import { ExercisePicker } from "@/components/pickers/exercise-picker";
import { RoutineExerciseRow, estimarDuracao } from "@/components/workouts/routine-exercise-row";
import { RoutineIcon, RoutineIconPicker } from "@/components/workouts/routine-icon";
import { todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";

/**
 * O Plano: a semana e as rotinas.
 *
 * Duas abas, como nos apps de academia que se usa com uma mão:
 *
 * - **Agenda** — o que se faz em cada dia: cada rotina tem os seus dias
 *   (segunda = Peito, quarta = Costas…). Dia sem rotina é descanso.
 * - **Rotinas** — o conteúdo de cada uma: exercícios, séries, descanso.
 */
export const Route = createFileRoute("/_authenticated/plan")({
  head: () => ({
    meta: [
      { title: "Plano — Habitual Fit" },
      { name: "description", content: "Sua rotina semanal e as rotinas de treino." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PlanPage,
});

/** Segunda primeiro, domingo por último. */
const ORDEM_SEMANA: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

function PlanPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const userId = useCurrentUserId();
  const [aba, setAba] = useState<"agenda" | "rotinas">("agenda");
  const [aberta, setAberta] = useState<string | null>(null);
  /** Diálogo de nome aberto: renomear o plano, renomear uma rotina ou criar uma. */
  const [nomeando, setNomeando] = useState<
    | { tipo: "plano" }
    | { tipo: "rotina"; templateId: string; letter: string | null; atual: string }
    | { tipo: "nova" }
    | null
  >(null);

  const week = useQuery({
    queryKey: [...queryKeys.workouts.all, "week"],
    queryFn: async () => {
      const atual = await fetchWorkoutWeek();
      const vazia =
        !atual || atual.splits.length === 0 || atual.splits.every((s) => s.exercises.length === 0);
      if (!vazia) return atual;
      // Rotina quebrada (geração que falhou): remonta a partir do questionário.
      await ensureActiveRoutine(userId);
      return fetchWorkoutWeek();
    },
  });

  const invalidar = () => qc.invalidateQueries({ queryKey: queryKeys.workouts.all });

  const abrir = useMutation({
    mutationFn: (templateId: string) => openWorkoutForTemplate(userId, templateId),
    onSuccess: (id) => {
      void invalidar();
      void navigate({ to: "/workouts/session/$id", params: { id } });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  // Começar um treino abre uma sessão: pergunta antes, para um toque sem querer
  // na agenda não virar treino iniciado.
  const [iniciar, setIniciar] = useState<{ templateId: string; nome: string } | null>(null);
  const pedirInicio = (templateId: string) => {
    const s = week.data?.splits.find((x) => x.templateId === templateId);
    setIniciar({ templateId, nome: s ? splitDisplayName(s.name) : "este treino" });
  };

  /** Rotina com a exclusão pedida, aguardando confirmação. */
  const [excluindo, setExcluindo] = useState<{ templateId: string; nome: string } | null>(null);
  const excluir = useMutation({
    mutationFn: (templateId: string) => deleteTemplate(templateId),
    onSuccess: () => {
      setAberta(null);
      toast.success("Rotina excluída");
      void invalidar();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const salvar = useMutation({
    mutationFn: (acao: () => Promise<void>) => acao(),
    onSuccess: () => void invalidar(),
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (week.isPending) return <PlanSkeleton />;
  if (week.isError) {
    return (
      <PageBody>
        <ErrorState message={errorMessage(week.error)} onRetry={week.refetch} />
      </PageBody>
    );
  }

  const header = (
    <PageHeader
      title="Plano"
      description={week.data?.routineName ?? "Sua rotina semanal"}
      action={
        <Link
          to="/workouts/routines/new"
          className={headerIconClass}
          aria-label="Montar um plano novo"
        >
          <Wand2 />
        </Link>
      }
    />
  );

  if (!week.data || week.data.splits.length === 0) {
    return (
      <>
        {header}
        <PageBody>
          <NoRoutineCard />
        </PageBody>
      </>
    );
  }

  const dados = week.data;

  const salvarNome = async (nome: string) => {
    if (!nomeando) return;
    if (nomeando.tipo === "plano") await renameRoutine(dados.routineId, nome);
    else if (nomeando.tipo === "rotina")
      await renameTemplate(nomeando.templateId, nomeando.letter, nome);
    else {
      const id = await createTemplate(userId, dados.routineId, dados.splits, nome);
      setAba("rotinas");
      setAberta(id);
      toast.success("Rotina criada. Adicione os exercícios.");
    }
    await invalidar();
    setNomeando(null);
  };
  const hoje = weekdayOf(todayISO());

  return (
    <>
      {header}
      <PageBody>
        <Segmented
          value={aba}
          onChange={setAba}
          options={[
            { value: "agenda", label: "Agenda" },
            { value: "rotinas", label: "Rotinas" },
          ]}
          label="Seção do plano"
        />

        {aba === "agenda" ? (
          <section aria-label="Agenda da semana" className="mt-5">
            <p className="px-1 text-sm text-muted-foreground">
              Cada rotina tem os seus dias. Dia sem rotina é descanso.
            </p>

            <h2 className="mb-3 mt-5 flex items-center gap-2 px-1 text-lg font-bold">
              <span className="h-5 w-1.5 rounded-full bg-primary" aria-hidden />
              Agenda da semana
            </h2>
            <ul className="space-y-3">
              {ORDEM_SEMANA.map((dia) => (
                <li key={dia}>
                  <DiaFixo
                    dia={dia}
                    dados={dados}
                    onAdd={(templateId, dias) =>
                      salvar.mutate(() => setTemplateWeekdays(templateId, [...dias, dia]))
                    }
                    onRemove={(templateId, dias) =>
                      salvar.mutate(() =>
                        setTemplateWeekdays(
                          templateId,
                          dias.filter((d) => d !== dia),
                        ),
                      )
                    }
                    onStart={pedirInicio}
                    isToday={dia === hoje}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section aria-label="Rotinas" className="mt-5">
            <ul className="space-y-3">
              {dados.splits.map((split) => {
                const expandida = aberta === split.templateId;
                return (
                  <li key={split.templateId} className="rounded-[1.25rem] bg-card">
                    <div className="flex items-center gap-2 p-4">
                      <RoutineIconPicker
                        icon={split.icon}
                        name={splitDisplayName(split.name)}
                        onChange={(icon) =>
                          salvar.mutate(() => setTemplateIcon(split.templateId, icon))
                        }
                      />
                      <button
                        type="button"
                        onClick={() => setAberta(expandida ? null : split.templateId)}
                        aria-expanded={expandida}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block truncate text-lg font-semibold">
                          {split.name.replace(/^[A-Z]\s*—\s*/, "")}
                        </span>
                        <span className="block text-sm text-muted-foreground">
                          {split.exercises.length}{" "}
                          {split.exercises.length === 1 ? "exercício" : "exercícios"} ·{" "}
                          {estimarDuracao(split)}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setNomeando({
                            tipo: "rotina",
                            templateId: split.templateId,
                            letter: split.letter,
                            atual: splitDisplayName(split.name),
                          })
                        }
                        aria-label={`Renomear ${splitDisplayName(split.name)}`}
                        className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-elevated"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <Button
                        size="icon"
                        className="shrink-0 rounded-full"
                        onClick={() => pedirInicio(split.templateId)}
                        disabled={abrir.isPending || split.exercises.length === 0}
                        aria-label={`Começar ${splitDisplayName(split.name)}`}
                      >
                        <Play className="size-4 fill-current" aria-hidden />
                      </Button>
                      <button
                        type="button"
                        onClick={() => setAberta(expandida ? null : split.templateId)}
                        aria-label={expandida ? "Fechar rotina" : "Editar rotina"}
                        className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-elevated"
                      >
                        <ChevronDown
                          className={cn("size-5 transition-transform", expandida && "rotate-180")}
                        />
                      </button>
                    </div>

                    {expandida && (
                      <div className="border-t border-border/60 p-3">
                        <ul className="space-y-2.5">
                          {split.exercises.map((exercise, i) => (
                            <RoutineExerciseRow
                              key={exercise.itemId}
                              exercise={exercise}
                              index={i}
                              templateId={split.templateId}
                              onOpenDetail={() =>
                                void navigate({
                                  to: "/exercises/$id",
                                  params: { id: exercise.exerciseId },
                                })
                              }
                              onChanged={invalidar}
                            />
                          ))}
                        </ul>
                        <ExercisePicker
                          title="Adicionar exercício"
                          onPick={async (exercise) => {
                            await addTemplateItem(
                              split.templateId,
                              exercise.id,
                              split.exercises.length + 1,
                            );
                            toast.success("Exercício adicionado");
                            await invalidar();
                          }}
                          trigger={
                            <Button variant="ghost" className="mt-2 w-full text-primary">
                              <Plus className="mr-1.5 size-4" aria-hidden />
                              Adicionar exercício
                            </Button>
                          }
                        />
                        {/* A última rotina fica: um plano sem nenhuma seria remontado
                            do zero a partir do questionário. */}
                        {dados.splits.length > 1 && (
                          <Button
                            variant="ghost"
                            className="mt-1 w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() =>
                              setExcluindo({
                                templateId: split.templateId,
                                nome: splitDisplayName(split.name),
                              })
                            }
                          >
                            <Trash2 className="mr-1.5 size-4" aria-hidden />
                            Excluir rotina
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <button
              type="button"
              onClick={() => setNomeando({ tipo: "nova" })}
              className="mt-3 flex w-full items-center gap-3 rounded-[1.25rem] border border-dashed border-border p-4 text-left text-primary transition-colors hover:bg-card"
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/15">
                <Plus className="size-6" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-semibold">Criar rotina personalizada</span>
                <span className="block text-sm text-muted-foreground">
                  Dê um nome e escolha os exercícios
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setNomeando({ tipo: "plano" })}
              className="mt-3 flex w-full items-center gap-2 px-1 py-2 text-muted-foreground hover:text-foreground"
            >
              <Pencil className="size-4" aria-hidden />
              Renomear o plano “{dados.routineName}”
            </button>

            <h2 className="mb-3 mt-8 px-1 text-lg text-muted-foreground">Programas prontos</h2>
            <ul className="space-y-3">
              {TRAINING_PROGRAMS.map((p) => (
                <li key={p.slug}>
                  <Link
                    to="/workouts/routines/new"
                    search={{ programa: p.slug }}
                    className="flex items-center gap-3 rounded-[1.25rem] bg-card p-4 transition-colors hover:bg-elevated"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{p.name}</span>
                      <span className="block text-sm text-muted-foreground">
                        {p.input.daysPerWeek}× por semana · {p.weeks} semanas
                      </span>
                    </span>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </PageBody>

      <ConfirmDialog
        open={iniciar !== null}
        onOpenChange={(o) => !o && setIniciar(null)}
        title="Deseja iniciar esse treino?"
        description={
          iniciar ? `${iniciar.nome} começa agora e o cronômetro passa a contar.` : undefined
        }
        confirmLabel="Iniciar treino"
        onConfirm={() => iniciar && abrir.mutate(iniciar.templateId)}
      />

      <ConfirmDialog
        open={excluindo !== null}
        onOpenChange={(o) => !o && setExcluindo(null)}
        title="Excluir esta rotina?"
        description={
          excluindo
            ? `“${excluindo.nome}” sai do plano e dos dias da semana. Os treinos que você já fez com ela continuam no histórico.`
            : undefined
        }
        confirmLabel="Excluir rotina"
        destructive
        onConfirm={() => excluindo && excluir.mutate(excluindo.templateId)}
      />

      <NomeDialog
        key={nomeando ? JSON.stringify(nomeando) : "fechado"}
        open={nomeando !== null}
        onOpenChange={(o) => !o && setNomeando(null)}
        titulo={
          nomeando?.tipo === "plano"
            ? "Nome do plano"
            : nomeando?.tipo === "nova"
              ? "Nova rotina"
              : "Nome da rotina"
        }
        inicial={
          nomeando?.tipo === "plano"
            ? dados.routineName
            : nomeando?.tipo === "rotina"
              ? nomeando.atual
              : ""
        }
        confirmar={nomeando?.tipo === "nova" ? "Criar" : "Salvar"}
        onSave={salvarNome}
      />
    </>
  );
}

/** Dia na semana fixa: as rotinas dele, remover, adicionar; ou "Descanso". */
function DiaFixo({
  dia,
  dados,
  onAdd,
  onRemove,
  onStart,
  isToday,
}: {
  dia: Weekday;
  dados: WorkoutWeek;
  onAdd: (templateId: string, diasAtuais: number[]) => void;
  onRemove: (templateId: string, diasAtuais: number[]) => void;
  onStart: (templateId: string) => void;
  isToday: boolean;
}) {
  const doDia = dados.splits.filter((s) => s.weekdays.includes(dia));
  const outras = dados.splits.filter((s) => !s.weekdays.includes(dia));

  const adicionar = (gatilho: ReactNode) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{gatilho}</DropdownMenuTrigger>
      <DropdownMenuContent align={doDia.length === 0 ? "end" : "start"}>
        <DropdownMenuLabel>Rotina para {WEEKDAY_LABELS[dia].toLowerCase()}</DropdownMenuLabel>
        {outras.length === 0 ? (
          <DropdownMenuItem disabled>Todas as rotinas já estão neste dia</DropdownMenuItem>
        ) : (
          outras.map((s) => (
            <DropdownMenuItem key={s.templateId} onSelect={() => onAdd(s.templateId, s.weekdays)}>
              {s.name.replace(/^[A-Z]\s*—\s*/, "")}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // Dia livre: o card é só informação; vincular uma rotina é no botão "+".
  if (doDia.length === 0) {
    return (
      <div
        className={cn(
          "flex w-full items-center gap-3 rounded-[1.25rem] border border-dashed py-3 pl-5 pr-3",
          isToday ? "border-primary bg-primary/10" : "border-border bg-card/60",
        )}
      >
        <span className="flex-1 text-xl font-medium">
          {WEEKDAY_LABELS[dia]}
          {isToday && (
            <span className="ml-2 rounded-full bg-[#01D798] px-2 py-0.5 align-middle text-xs font-extrabold text-[#020306]">
              hoje
            </span>
          )}
        </span>
        <span className="rounded-full bg-elevated px-3 py-1 text-sm font-medium text-muted-foreground">
          Descanso
        </span>
        {adicionar(
          <button
            type="button"
            aria-label={`Vincular uma rotina a ${WEEKDAY_LABELS[dia].toLowerCase()}`}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/15 text-primary transition-colors hover:bg-primary/25"
          >
            <Plus className="size-5" aria-hidden />
          </button>,
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[1.25rem] p-5",
        isToday ? "border-2 border-primary bg-card" : "border border-primary/15 bg-card",
      )}
    >
      <div className="relative mb-2 flex items-baseline justify-between">
        <h3 className="text-xl font-bold">
          {WEEKDAY_LABELS[dia]}
          {isToday && (
            <span className="ml-2 rounded-full bg-[#01D798] px-2 py-0.5 align-middle text-xs font-extrabold text-[#020306]">
              hoje
            </span>
          )}
        </h3>
        <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-bold text-primary">
          {doDia.length} {doDia.length === 1 ? "rotina" : "rotinas"}
        </span>
      </div>
      <ul className="relative space-y-1">
        {doDia.map((s) => (
          <li key={s.templateId} className="flex items-center gap-3 py-1.5">
            <RoutineIcon icon={s.icon} name={splitDisplayName(s.name)} />
            <button
              type="button"
              onClick={() => onStart(s.templateId)}
              className="min-w-0 flex-1 text-left"
              aria-label={`Começar ${s.name}`}
            >
              <span className="block truncate text-lg">{s.name.replace(/^[A-Z]\s*—\s*/, "")}</span>
              <span className="block text-sm text-muted-foreground">
                {s.exercises.length} {s.exercises.length === 1 ? "exercício" : "exercícios"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onRemove(s.templateId, s.weekdays)}
              aria-label={`Tirar ${s.name} de ${WEEKDAY_LABELS[dia].toLowerCase()}`}
              className="grid size-10 place-items-center rounded-full text-foreground hover:bg-elevated"
            >
              <X className="size-5" />
            </button>
          </li>
        ))}
      </ul>
      {outras.length > 0 &&
        adicionar(
          <button
            type="button"
            className="mt-2 flex items-center gap-2 px-1 py-1 text-lg text-primary"
          >
            <Plus className="size-5" aria-hidden />
            Adicionar rotina
          </button>,
        )}
    </div>
  );
}

/** Diálogo com um campo de nome — renomear o plano, uma rotina, ou criar uma. */
function NomeDialog({
  open,
  onOpenChange,
  titulo,
  inicial,
  confirmar,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  titulo: string;
  inicial: string;
  confirmar: string;
  onSave: (nome: string) => Promise<void>;
}) {
  const [nome, setNome] = useState(inicial);
  const salvar = useMutation({
    mutationFn: () => onSave(nome),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            salvar.mutate();
          }}
        >
          <Input
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={60}
            placeholder="Ex.: Peito e tríceps"
            aria-label={titulo}
            className="h-12 text-lg"
          />
          <DialogFooter className="mt-4">
            <Button type="submit" disabled={!nome.trim() || salvar.isPending} className="w-full">
              {confirmar}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Controle segmentado (duas ou três opções lado a lado). */
function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  small = false,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
  small?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex rounded-2xl border border-primary/20 bg-card p-1"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => value !== o.value && onChange(o.value)}
          className={cn(
            "flex-1 rounded-xl font-medium transition-all duration-300",
            small ? "py-2 text-sm" : "py-3 text-base",
            value === o.value
              ? "bg-primary font-bold text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PlanSkeleton() {
  return (
    <>
      <PageHeader title="Plano" description="Sua rotina semanal" />
      <PageBody>
        <Skeleton className="mb-6 h-24 w-full rounded-[1.5rem]" />
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-[1.25rem]" />
          ))}
        </div>
      </PageBody>
    </>
  );
}
