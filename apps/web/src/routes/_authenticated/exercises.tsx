import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/data/query-keys";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChipGroup } from "@/components/ui/chip-group";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/query-boundary";
import { Loader2, Search, SearchX, SlidersHorizontal, X } from "lucide-react";
import { ExerciseMediaView } from "@/components/workouts/exercise-media-view";
import { exerciseMedia } from "@/data/exercise-media";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CATEGORY_LABELS,
  EQUIPMENT_LABELS,
  MUSCLE_LABELS,
  label,
  type MuscleValue,
} from "@/lib/labels";

export const Route = createFileRoute("/_authenticated/exercises")({
  head: () => ({
    meta: [
      { title: "Biblioteca de exercícios — Forja" },
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
  const [muscles, setMuscles] = useState<string[]>([]);
  const [equipment, setEquipment] = useState<string[]>([]);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

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
    setMuscles([]);
    setEquipment([]);
  };

  const sentinelaRef = useInfiniteScroll(() => {
    if (lista.hasNextPage && !lista.isFetchingNextPage) void lista.fetchNextPage();
  });

  return (
    <>
      <PageHeader
        wide
        title="Biblioteca de exercícios"
        description="Busque por nome, músculo ou equipamento."
      />
      <PageBody wide>
        <div className="mb-4 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                placeholder="Buscar exercício…"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                className="pl-9 pr-9"
                aria-label="Buscar exercício"
              />
              {lista.isFetching && !lista.isFetchingNextPage && (
                <Loader2
                  className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
                  aria-hidden
                />
              )}
              {term && !lista.isFetching && (
                <button
                  type="button"
                  onClick={() => setTerm("")}
                  aria-label="Limpar busca"
                  className="press-feedback absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            <Button
              variant={filtrosAtivos > 0 ? "soft" : "outline"}
              onClick={() => setFiltrosAbertos((v) => !v)}
              aria-expanded={filtrosAbertos}
            >
              <SlidersHorizontal aria-hidden />
              Filtros
              {filtrosAtivos > 0 && (
                <span className="ml-0.5 grid size-5 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                  {filtrosAtivos}
                </span>
              )}
            </Button>
          </div>

          {filtrosAbertos && (
            <div className="animate-rise space-y-4 rounded-xl border border-border bg-surface p-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Músculo</p>
                <ChipGroup
                  label="Filtrar por músculo"
                  options={FILTERABLE_MUSCLES.map((m) => ({ value: m, label: MUSCLE_LABELS[m] }))}
                  selected={muscles as MuscleValue[]}
                  onChange={(v) => setMuscles(v)}
                />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Equipamento</p>
                <ChipGroup
                  label="Filtrar por equipamento"
                  options={FILTERABLE_EQUIPMENT.map((e) => ({
                    value: e,
                    label: label(EQUIPMENT_LABELS, e),
                  }))}
                  selected={equipment as (typeof FILTERABLE_EQUIPMENT)[number][]}
                  onChange={(v) => setEquipment(v)}
                />
              </div>

              {filtrosAtivos > 0 && (
                <Button variant="ghost" size="sm" onClick={limparFiltros}>
                  <X aria-hidden />
                  Limpar filtros
                </Button>
              )}
            </div>
          )}
        </div>

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
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {exercicios.map((ex) => (
                <ExerciseCard key={ex.id} exercise={ex} />
              ))}
            </div>

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

function ExerciseCard({ exercise }: { exercise: ExerciseRow }) {
  const media = exerciseMedia({
    name: exercise.name,
    imageUrls: exercise.image_urls,
    externalId: exercise.external_id,
    mediaId: exercise.media_id,
    mediaRef: exercise.media_ref,
    mediaSource: exercise.media_source,
    videoUrl: exercise.video_url,
  });

  return (
    <Card variant="interactive" className="overflow-hidden">
      <Link
        to="/exercises/$id"
        params={{ id: exercise.id }}
        className="block"
        aria-label={`Abrir ${exercise.name}`}
      >
        <ExerciseMediaView media={media} name={exercise.name} />

        <CardContent className="p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 text-balance font-semibold leading-tight">{exercise.name}</p>
            {exercise.owner_id && (
              <Badge variant="outline" className="shrink-0">
                Meu
              </Badge>
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="soft">{label(MUSCLE_LABELS, exercise.primary_muscle)}</Badge>
            <Badge variant="outline">{label(EQUIPMENT_LABELS, exercise.equipment)}</Badge>
            {exercise.category !== "strength" && (
              <Badge variant="outline">{label(CATEGORY_LABELS, exercise.category)}</Badge>
            )}
          </div>
        </CardContent>
      </Link>
    </Card>
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
