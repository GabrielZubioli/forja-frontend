import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dumbbell, Loader2, Plus, SearchX, Search, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/data/query-keys";
import { errorMessage } from "@/data/supabase-helpers";
import { fetchActiveRoutine, type ActiveRoutine } from "@/data/routines";
import { addTemplateItem } from "@/data/workout-week";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { PageBody, PageHeader } from "@/components/page-header";
import { CreateExerciseDialog } from "@/components/create-exercise-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/query-boundary";
import { exerciseMedia } from "@/data/exercise-media";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { EQUIPMENT_LABELS, MUSCLE_LABELS, label, type MuscleValue } from "@/lib/labels";

export const Route = createFileRoute("/_authenticated/exercises")({
  head: () => ({
    meta: [
      { title: "Exercícios — Forja" },
      { name: "description", content: "Mais de mil exercícios com demonstração animada." },
    ],
  }),
  component: ExerciseLibrary,
});

/**
 * Músculos oferecidos como filtro.
 *
 * Não são todos os valores do enum: `front_delts`, `side_delts` e afins são
 * precisão que só interessa a quem monta o plano, não a quem procura um
 * exercício. Filtro com 24 opções não é filtro, é uma segunda lista para
 * navegar antes da lista.
 */
const FILTERABLE_MUSCLES: MuscleValue[] = [
  "chest",
  "back",
  "lats",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "abs",
  "core",
  "traps",
  "lower_back",
  "cardio",
];

const FILTERABLE_EQUIPMENT = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "bodyweight",
  "kettlebell",
  "band",
  "other",
] as const;

/**
 * Quantos exercícios por página.
 *
 * A biblioteca passou de ~70 para mais de 1.400 itens. Trazer tudo de uma vez
 * seria alguns megabytes de JSON e um `<div>` com 1.400 filhos — o celular
 * engasga na rolagem antes mesmo de a rede terminar. A paginação por rolagem
 * mantém o custo constante, independentemente do tamanho do catálogo.
 */
const PAGE_SIZE = 24;

function ExerciseLibrary() {
  const [term, setTerm] = useState("");
  const [muscle, setMuscle] = useState<string | null>(null);
  const [equip, setEquip] = useState<string | null>(null);
  const muscles = useMemo(() => (muscle ? [muscle] : []), [muscle]);
  const equipment = useMemo(() => (equip ? [equip] : []), [equip]);

  const total = useQuery({
    queryKey: [...queryKeys.exercises.all, "count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("exercises")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null);
      if (error) throw error;
      return count ?? 0;
    },
  });
  const rotina = useQuery({
    queryKey: queryKeys.workouts.activeRoutine(),
    queryFn: fetchActiveRoutine,
  });

  // Sem debounce, cada tecla disparava uma requisição ao Supabase.
  const debouncedTerm = useDebouncedValue(term.trim(), 300);

  const lista = useInfiniteQuery({
    queryKey: queryKeys.exercises.library(debouncedTerm, muscles, equipment),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      let query = supabase
        .from("exercises")
        .select(
          "id, name, name_en, primary_muscle, secondary_muscles, equipment, category, owner_id, image_urls, external_id, media_id, media_ref, media_source, video_url",
        )
        .is("deleted_at", null)
        // Popularidade antes do nome: em ordem alfabética a primeira tela da
        // biblioteca seria "3/4 Abdominal" e variações exóticas, e o supino
        // reto ficaria a dezenas de rolagens de distância.
        .order("popularity", { ascending: false })
        .order("name")
        .range(pageParam * PAGE_SIZE, pageParam * PAGE_SIZE + PAGE_SIZE - 1);

      if (debouncedTerm) {
        // Busca no nome em português **e** no original em inglês: quem treina
        // há anos procura por "romanian deadlift", não por "terra romeno".
        const escapado = debouncedTerm.replace(/[%,()]/g, " ");
        query = query.or(`name.ilike.%${escapado}%,name_en.ilike.%${escapado}%`);
      }
      if (muscles.length > 0) query = query.in("primary_muscle", muscles as never[]);
      if (equipment.length > 0) query = query.in("equipment", equipment as never[]);

      const { data, error } = await query;
      if (error) throw new Error(`Não foi possível carregar os exercícios: ${error.message}`);
      return data ?? [];
    },
    // Uma página menor que o tamanho pedido significa que o catálogo acabou.
    getNextPageParam: (ultima, todas) => (ultima.length < PAGE_SIZE ? undefined : todas.length),
  });

  const exercicios = useMemo(() => lista.data?.pages.flat() ?? [], [lista.data]);

  const filtrosAtivos = muscles.length + equipment.length;
  const limparFiltros = () => {
    setMuscle(null);
    setEquip(null);
  };

  const sentinelaRef = useInfiniteScroll(() => {
    if (lista.hasNextPage && !lista.isFetchingNextPage) void lista.fetchNextPage();
  });

  return (
    <>
      <PageHeader
        title="Exercícios"
        description={
          total.data
            ? `${total.data.toLocaleString("pt-BR")} exercícios com demonstração`
            : undefined
        }
      />
      <PageBody>
        <div className="mb-4 space-y-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              placeholder="Buscar…"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="h-14 rounded-2xl border-transparent bg-card pl-12 pr-10 text-lg"
              aria-label="Buscar exercício"
            />
            {lista.isFetching && !lista.isFetchingNextPage ? (
              <Loader2
                className="absolute right-4 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
                aria-hidden
              />
            ) : (
              term && (
                <button
                  type="button"
                  onClick={() => setTerm("")}
                  aria-label="Limpar busca"
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              )
            )}
          </div>

          <FilaDeChips
            rotulo="Filtrar por músculo"
            todos="Todos"
            valor={muscle}
            onChange={setMuscle}
            opcoes={FILTERABLE_MUSCLES.map((m) => ({ value: m, label: MUSCLE_LABELS[m] }))}
          />
          <FilaDeChips
            rotulo="Filtrar por equipamento"
            todos="Qualquer equipamento"
            valor={equip}
            onChange={setEquip}
            opcoes={FILTERABLE_EQUIPMENT.map((e) => ({
              value: e,
              label: label(EQUIPMENT_LABELS, e),
            }))}
          />
        </div>

        <CreateExerciseDialog
          trigger={
            <button
              type="button"
              className="mb-3 flex w-full items-center gap-4 rounded-[1.25rem] bg-card p-3 text-left transition-colors hover:bg-elevated"
            >
              <span className="grid size-16 shrink-0 place-items-center rounded-xl bg-elevated text-muted-foreground">
                <Sparkles className="size-6" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg">Criar seu exercício</span>
                <span className="block text-muted-foreground">nome e músculo, sem animação</span>
              </span>
              <Plus className="mr-2 size-6 shrink-0" aria-hidden />
            </button>
          }
        />

        {lista.isError ? (
          <ErrorState
            message={lista.error instanceof Error ? lista.error.message : "Erro ao carregar."}
            onRetry={lista.refetch}
          />
        ) : lista.isPending ? (
          <CardGridSkeleton count={6} />
        ) : exercicios.length === 0 ? (
          <EmptyState
            icon={<SearchX className="size-6" />}
            title="Nenhum exercício encontrado"
            description={
              debouncedTerm
                ? `Nada corresponde a “${debouncedTerm}”. Tente outro termo — a busca também aceita o nome em inglês.`
                : "Nenhum exercício com esta combinação de filtros."
            }
            action={
              filtrosAtivos > 0 ? (
                <Button variant="outline" onClick={limparFiltros}>
                  Limpar filtros
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <ul className="space-y-3">
              {exercicios.map((ex) => (
                <ExerciseListRow key={ex.id} exercise={ex} rotina={rotina.data ?? null} />
              ))}
            </ul>

            {/* Sentinela: entra na viewport e dispara a próxima página. */}
            <div ref={sentinelaRef} className="h-px" aria-hidden />

            {lista.isFetchingNextPage && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 inline size-4 animate-spin" aria-hidden />
                Carregando mais…
              </p>
            )}

            {!lista.hasNextPage && exercicios.length > PAGE_SIZE && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {exercicios.length} exercícios — fim da lista.
              </p>
            )}
          </>
        )}
      </PageBody>
    </>
  );
}

type ExerciseRow = {
  id: string;
  name: string;
  name_en: string | null;
  primary_muscle: string | null;
  secondary_muscles: string[] | null;
  equipment: string | null;
  category: string | null;
  owner_id: string | null;
  image_urls: string[] | null;
  external_id: string | null;
  media_id: string | null;
  media_ref: string | null;
  media_source: string | null;
  video_url: string | null;
};

/** Uma linha: miniatura, nome, "músculo · equipamento" e "+ Plano". */
function ExerciseListRow({
  exercise,
  rotina,
}: {
  exercise: ExerciseRow;
  rotina: ActiveRoutine | null;
}) {
  const qc = useQueryClient();
  const media = exerciseMedia({
    name: exercise.name,
    imageUrls: exercise.image_urls,
    externalId: exercise.external_id,
    mediaId: exercise.media_id,
    mediaRef: exercise.media_ref,
    mediaSource: exercise.media_source,
    videoUrl: exercise.video_url,
  });
  const miniatura = media.gif ?? media.images[0] ?? null;

  const adicionar = useMutation({
    mutationFn: (t: { id: string; exerciseCount: number }) =>
      addTemplateItem(t.id, exercise.id, t.exerciseCount + 1),
    onSuccess: (_d, t) => {
      const nome = (rotina?.templates.find((x) => x.id === t.id)?.name ?? "a rotina").replace(
        /^[A-Z]\s*—\s*/,
        "",
      );
      toast.success(`Adicionado a ${nome}`);
      void qc.invalidateQueries({ queryKey: queryKeys.workouts.all });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <li className="flex items-center gap-4 rounded-[1.25rem] bg-card p-3">
      <Link
        to="/exercises/$id"
        params={{ id: exercise.id }}
        className="flex min-w-0 flex-1 items-center gap-4"
        aria-label={`Abrir ${exercise.name}`}
      >
        <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-white">
          {miniatura ? (
            <img src={miniatura} alt="" loading="lazy" className="size-full object-cover" />
          ) : (
            <Dumbbell className="size-6 text-neutral-400" aria-hidden />
          )}
        </span>
        <span className="min-w-0">
          <span className="block text-lg leading-snug">{exercise.name}</span>
          <span className="block text-muted-foreground">
            {label(MUSCLE_LABELS, exercise.primary_muscle)} ·{" "}
            {label(EQUIPMENT_LABELS, exercise.equipment)}
            {exercise.owner_id && " · seu"}
          </span>
        </span>
      </Link>
      {rotina && rotina.templates.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="shrink-0 rounded-xl bg-primary-soft px-4 py-2.5 text-lg font-bold text-primary-soft-foreground"
              aria-label={`Adicionar ${exercise.name} a uma rotina`}
            >
              + Plano
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Adicionar à rotina</DropdownMenuLabel>
            {rotina.templates.map((t) => (
              <DropdownMenuItem key={t.id} onSelect={() => adicionar.mutate(t)}>
                {t.name.replace(/^[A-Z]\s*—\s*/, "")}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}

/** Uma fila de chips de escolha única, rolando na horizontal. */
function FilaDeChips({
  rotulo,
  todos,
  valor,
  onChange,
  opcoes,
}: {
  rotulo: string;
  todos: string;
  valor: string | null;
  onChange: (v: string | null) => void;
  opcoes: { value: string; label: string }[];
}) {
  const chip = (ativo: boolean) =>
    cn(
      "shrink-0 rounded-full px-4 py-2 text-lg transition-colors",
      ativo ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-elevated",
    );
  return (
    <div
      role="radiogroup"
      aria-label={rotulo}
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
    >
      <button
        type="button"
        role="radio"
        aria-checked={valor === null}
        onClick={() => onChange(null)}
        className={chip(valor === null)}
      >
        {todos}
      </button>
      {opcoes.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={valor === o.value}
          onClick={() => onChange(valor === o.value ? null : o.value)}
          className={chip(valor === o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Dispara uma função quando o elemento observado entra na tela.
 *
 * Rolagem infinita em vez de um botão "carregar mais": o gesto de rolar já é o
 * que a pessoa está fazendo, e a lista é longa o bastante para o botão virar
 * uma interrupção a cada 24 itens.
 *
 * A margem de 400 px faz a próxima página começar a carregar **antes** de a
 * atual acabar — o objetivo é que a lista nunca pareça terminar.
 */
function useInfiniteScroll(onReach: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  // A função muda a cada render; guardá-la numa ref evita reconectar o
  // observador (e perder o estado dele) a cada renderização.
  const callbackRef = useRef(onReach);
  callbackRef.current = onReach;

  useEffect(() => {
    const alvo = ref.current;
    if (!alvo || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entradas) => {
        if (entradas[0]?.isIntersecting) callbackRef.current();
      },
      { rootMargin: "400px" },
    );

    observer.observe(alvo);
    return () => observer.disconnect();
  }, []);

  return ref;
}
