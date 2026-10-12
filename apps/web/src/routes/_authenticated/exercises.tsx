import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight, Dumbbell, Heart, Loader2, Plus, Search, SearchX, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/data/query-keys";
import { errorMessage } from "@/data/supabase-helpers";
import { fetchActiveRoutine, type ActiveRoutine } from "@/data/routines";
import { addTemplateItem } from "@/data/workout-week";
import { useFavoritos } from "@/data/exercise-favorites";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { PageBody, PageHeader } from "@/components/page-header";
import { BackButton } from "@/components/back-button";
import { BodyMap } from "@/components/body-map/body-map";
import { FavoriteButton } from "@/components/exercises/favorite-button";
import { CreateExerciseDialog } from "@/components/create-exercise-dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { EQUIPMENT_LABELS, MUSCLE_LABELS, label } from "@/lib/labels";

type Aba = "musculos" | "equipamentos" | "favoritos";

export const Route = createFileRoute("/_authenticated/exercises")({
  head: () => ({
    meta: [
      { title: "Exercícios — Habitual Fit" },
      { name: "description", content: "Mais de mil exercícios com demonstração animada." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { aba?: Aba; grupo?: string; equipamento?: string } => ({
    aba: s.aba === "equipamentos" || s.aba === "favoritos" ? s.aba : undefined,
    grupo: typeof s.grupo === "string" ? s.grupo : undefined,
    equipamento: typeof s.equipamento === "string" ? s.equipamento : undefined,
  }),
  component: ExerciseLibrary,
});

/** Grupos musculares da navegação: cada um junta os músculos do catálogo que fazem parte dele. */
const GRUPOS = [
  { key: "peito", nome: "Peito", musculos: ["chest"], recorte: { view: "front" as const, box: [150, 215, 424, 318] as const } },
  { key: "costas", nome: "Costas", musculos: ["back", "lats", "lower_back"], recorte: { view: "back" as const, box: [110, 190, 504, 378] as const } },
  { key: "ombros", nome: "Ombros", musculos: ["shoulders", "front_delts", "side_delts", "rear_delts"], recorte: { view: "front" as const, box: [90, 170, 544, 408] as const } },
  { key: "biceps", nome: "Bíceps", musculos: ["biceps"], recorte: { view: "front" as const, box: [30, 230, 664, 498] as const } },
  { key: "triceps", nome: "Tríceps", musculos: ["triceps"], recorte: { view: "back" as const, box: [30, 230, 664, 498] as const } },
  { key: "antebraco", nome: "Antebraço", musculos: ["forearms"], recorte: { view: "front" as const, box: [10, 430, 704, 528] as const } },
  { key: "abdomen", nome: "Abdômen", musculos: ["abs", "core", "obliques"], recorte: { view: "front" as const, box: [140, 370, 444, 333] as const } },
  { key: "quadriceps", nome: "Quadríceps", musculos: ["quads"], recorte: { view: "front" as const, box: [110, 690, 504, 378] as const } },
  { key: "posterior", nome: "Posterior de coxa", musculos: ["hamstrings"], recorte: { view: "back" as const, box: [110, 740, 504, 378] as const } },
  { key: "gluteos", nome: "Glúteos", musculos: ["glutes", "abductors", "adductors"], recorte: { view: "back" as const, box: [140, 600, 444, 333] as const } },
  { key: "panturrilhas", nome: "Panturrilhas", musculos: ["calves"], recorte: { view: "back" as const, box: [140, 1000, 444, 333] as const } },
  { key: "trapezio", nome: "Trapézio e pescoço", musculos: ["traps", "neck"], recorte: { view: "back" as const, box: [130, 110, 464, 348] as const } },
  { key: "cardio", nome: "Cardio e corpo todo", musculos: ["cardio", "full_body"] },
] as const;

const EQUIPAMENTOS = [
  { key: "barbell", nome: "Barra" },
  { key: "dumbbell", nome: "Halteres" },
  { key: "machine", nome: "Máquinas" },
  { key: "cable", nome: "Polia" },
  { key: "bodyweight", nome: "Peso corporal" },
  { key: "kettlebell", nome: "Kettlebell" },
  { key: "band", nome: "Elásticos" },
  { key: "cardio", nome: "Cardio" },
  { key: "other", nome: "Outros acessórios" },
] as const;

/** Estrutura de treino → equipamentos que ela tem. */
const ESTRUTURAS = [
  { key: "completa", nome: "Academia completa", equipamentos: EQUIPAMENTOS.map((e) => e.key) },
  {
    key: "pequena",
    nome: "Academia pequena",
    equipamentos: ["barbell", "dumbbell", "bodyweight", "kettlebell", "band", "other"],
  },
  { key: "sem", nome: "Sem equipamento", equipamentos: ["bodyweight"] },
] as const;

const NIVEIS = [
  { value: "beginner", label: "Iniciante" },
  { value: "intermediate", label: "Intermediário" },
  { value: "advanced", label: "Avançado" },
];

const PAGE_SIZE = 24;
const CAMPOS =
  "id, name, name_en, primary_muscle, secondary_muscles, equipment, category, owner_id, image_urls, external_id, media_id, media_ref, media_source, video_url";

function ExerciseLibrary() {
  const { aba = "musculos", grupo, equipamento } = Route.useSearch();
  const navigate = useNavigate({ from: "/exercises" });
  const [term, setTerm] = useState("");
  const termo = useDebouncedValue(term.trim(), 300);

  const rotina = useQuery({ queryKey: queryKeys.workouts.activeRoutine(), queryFn: fetchActiveRoutine });

  // Quantos exercícios há por músculo e por equipamento (uma leitura só, leve).
  const contagem = useQuery({
    queryKey: [...queryKeys.exercises.all, "contagem"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exercises")
        .select("primary_muscle, equipment")
        .is("deleted_at", null)
        .limit(5000);
      if (error) throw error;
      const porMusculo = new Map<string, number>();
      const porEquip = new Map<string, number>();
      for (const r of data ?? []) {
        if (r.primary_muscle) porMusculo.set(r.primary_muscle, (porMusculo.get(r.primary_muscle) ?? 0) + 1);
        if (r.equipment) porEquip.set(r.equipment, (porEquip.get(r.equipment) ?? 0) + 1);
      }
      return { total: data?.length ?? 0, porMusculo, porEquip };
    },
  });

  const g = GRUPOS.find((x) => x.key === grupo);
  const e = EQUIPAMENTOS.find((x) => x.key === equipamento);
  if (g || e) {
    return (
      <TelaFiltrada
        titulo={g ? g.nome : e!.nome}
        musculos={g ? [...g.musculos] : undefined}
        equipamento={e?.key}
        rotina={rotina.data ?? null}
      />
    );
  }

  const irPara = (a: Aba) => void navigate({ search: { aba: a === "musculos" ? undefined : a } });

  return (
    <>
      <PageHeader
        title="Exercícios"
        description={
          contagem.data ? `${contagem.data.total.toLocaleString("pt-BR")} exercícios com demonstração` : undefined
        }
      />
      <PageBody>
        <Busca term={term} setTerm={setTerm} carregando={false} />

        {termo ? (
          <BuscaComFiltros termo={termo} rotina={rotina.data ?? null} />
        ) : (
          <>
            <div role="tablist" aria-label="Navegar exercícios" className="mt-4 flex rounded-2xl bg-card p-1">
              {(
                [
                  ["musculos", "Músculos"],
                  ["equipamentos", "Equipamentos"],
                  ["favoritos", "Favoritos"],
                ] as const
              ).map(([v, rotulo]) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={aba === v}
                  onClick={() => irPara(v)}
                  className={cn(
                    "flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors",
                    aba === v ? "bg-primary font-bold text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  {rotulo}
                </button>
              ))}
            </div>

            <div className="mt-4 animate-in fade-in duration-300" key={aba}>
              {aba === "musculos" && (
                <AbaMusculos porMusculo={contagem.data?.porMusculo} />
              )}
              {aba === "equipamentos" && <AbaEquipamentos porEquip={contagem.data?.porEquip} />}
              {aba === "favoritos" && <AbaFavoritos rotina={rotina.data ?? null} />}
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}

function Busca({
  term,
  setTerm,
  carregando,
}: {
  term: string;
  setTerm: (t: string) => void;
  carregando: boolean;
}) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        placeholder="Buscar exercício…"
        value={term}
        onChange={(ev) => setTerm(ev.target.value)}
        className="h-13 rounded-2xl border-transparent bg-card pl-12 pr-10 text-base"
        aria-label="Buscar exercício"
      />
      {carregando ? (
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
  );
}

/** Grupos musculares em cards com o corpo destacando os músculos do grupo. */
function AbaMusculos({ porMusculo }: { porMusculo?: Map<string, number> }) {
  return (
    <>
      <ul className="grid grid-cols-2 gap-2.5">
        {GRUPOS.map((g, i) => {
          const n = porMusculo ? g.musculos.reduce((s, m) => s + (porMusculo.get(m) ?? 0), 0) : null;
          return (
            <li
              key={g.key}
              className="animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards duration-300"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <Link
                to="/exercises"
                search={{ grupo: g.key }}
                className="flex h-full flex-col items-center rounded-[1.25rem] bg-card p-3 text-center transition-colors hover:bg-elevated active:scale-[0.98]"
              >
                {/* A região do grupo, aproximada (costas da cintura para cima etc.). */}
                <span className="block aspect-[4/3] w-full overflow-hidden rounded-xl bg-elevated">
                  <BodyMap
                    muscles={g.musculos.map((m) => ({ muscle: m, intensity: 1 }))}
                    showLegend={false}
                    showToggle={false}
                    recorte={"recorte" in g ? g.recorte : undefined}
                    className="pointer-events-none size-full"
                  />
                </span>
                <span className="mt-2 font-bold leading-tight">{g.nome}</span>
                <span className="text-xs text-muted-foreground">
                  {n === null ? "…" : `${n} ${n === 1 ? "exercício" : "exercícios"}`}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <CriarExercicio />
    </>
  );
}

/** Equipamentos com a foto do exercício mais popular de cada um, filtrados pela estrutura. */
function AbaEquipamentos({ porEquip }: { porEquip?: Map<string, number> }) {
  const [estrutura, setEstrutura] = useState<(typeof ESTRUTURAS)[number]["key"]>("completa");
  const disponiveis = ESTRUTURAS.find((x) => x.key === estrutura)!.equipamentos as readonly string[];
  return (
    <>
      <div role="radiogroup" aria-label="Estrutura de treino" className="grid grid-cols-3 gap-1 rounded-2xl bg-card p-1">
        {ESTRUTURAS.map((x) => (
          <button
            key={x.key}
            type="button"
            role="radio"
            aria-checked={estrutura === x.key}
            onClick={() => setEstrutura(x.key)}
            className={cn(
              "rounded-xl px-1 py-2 text-xs font-semibold leading-tight transition-colors",
              estrutura === x.key ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
          >
            {x.nome}
          </button>
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-2.5">
        {EQUIPAMENTOS.filter((e) => disponiveis.includes(e.key)).map((e, i) => (
          <li
            key={e.key}
            className="animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards duration-300"
            style={{ animationDelay: `${i * 30}ms` }}
          >
            <CartaoEquipamento equipamento={e} n={porEquip?.get(e.key) ?? null} />
          </li>
        ))}
      </ul>
    </>
  );
}

function CartaoEquipamento({
  equipamento,
  n,
}: {
  equipamento: (typeof EQUIPAMENTOS)[number];
  n: number | null;
}) {
  const capa = useQuery({
    queryKey: [...queryKeys.exercises.all, "capa", equipamento.key],
    staleTime: Infinity,
    queryFn: async () => {
      const { data } = await supabase
        .from("exercises")
        .select(CAMPOS)
        .is("deleted_at", null)
        .eq("equipment", equipamento.key as never)
        .order("popularity", { ascending: false })
        .limit(6);
      for (const ex of data ?? []) {
        const m = miniaturaDe(ex);
        if (m) return m;
      }
      return null;
    },
  });
  return (
    <Link
      to="/exercises"
      search={{ equipamento: equipamento.key }}
      className="block overflow-hidden rounded-[1.25rem] bg-card transition-colors hover:bg-elevated active:scale-[0.98]"
    >
      <span className="block aspect-[4/3] bg-white">
        {capa.data ? (
          <img src={capa.data} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <span className="grid size-full place-items-center bg-elevated">
            <Dumbbell className="size-8 text-muted-foreground" aria-hidden />
          </span>
        )}
      </span>
      <span className="block p-3">
        <span className="block font-bold leading-tight">{equipamento.nome}</span>
        <span className="text-xs text-muted-foreground">
          {n === null ? "…" : `${n} ${n === 1 ? "exercício" : "exercícios"}`}
        </span>
      </span>
    </Link>
  );
}

function AbaFavoritos({ rotina }: { rotina: ActiveRoutine | null }) {
  const { ordem, carregando } = useFavoritos();
  const exercicios = useQuery({
    queryKey: [...queryKeys.exercises.all, "favoritos", ordem],
    enabled: ordem.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("exercises").select(CAMPOS).in("id", ordem);
      if (error) throw error;
      const porId = new Map((data ?? []).map((x) => [x.id, x]));
      return ordem.flatMap((id) => {
        const x = porId.get(id);
        return x ? [x as ExerciseRow] : [];
      });
    },
  });

  if (carregando || (ordem.length > 0 && exercicios.isPending)) return <CardGridSkeleton count={3} />;
  if (ordem.length === 0) {
    return (
      <EmptyState
        icon={<Heart className="size-6" />}
        title="Nenhum favorito ainda"
        description="Toque no coração de um exercício para guardá-lo aqui."
      />
    );
  }
  return (
    <ul className="space-y-2.5">
      {(exercicios.data ?? []).map((ex) => (
        <ExerciseListRow key={ex.id} exercise={ex} rotina={rotina} />
      ))}
    </ul>
  );
}

/** Tela de um grupo muscular ou de um equipamento: busca, filtros e a lista. */
function TelaFiltrada({
  titulo,
  musculos,
  equipamento,
  rotina,
}: {
  titulo: string;
  musculos?: string[];
  equipamento?: string;
  rotina: ActiveRoutine | null;
}) {
  const [term, setTerm] = useState("");
  const termo = useDebouncedValue(term.trim(), 300);
  const [nivel, setNivel] = useState<string | null>(null);
  const [equip, setEquip] = useState<string | null>(null);
  const [grupo, setGrupo] = useState<string | null>(null);

  const musculosFiltro = musculos ?? (grupo ? [...GRUPOS.find((g) => g.key === grupo)!.musculos] : undefined);
  const equipFiltro = equipamento ? [equipamento] : equip ? [equip] : undefined;

  return (
    <PageBody>
      <div className="flex items-center gap-3 pb-3 pt-2">
        <BackButton fallback="/exercises" />
        <h1 className="min-w-0 truncate text-2xl font-extrabold">{titulo}</h1>
      </div>
      <Busca term={term} setTerm={setTerm} carregando={false} />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Seletor rotulo="Nível" valor={nivel} onChange={setNivel} todos="Nível" opcoes={NIVEIS} />
        {musculos ? (
          <Seletor
            rotulo="Equipamento"
            valor={equip}
            onChange={setEquip}
            todos="Equipamento"
            opcoes={EQUIPAMENTOS.map((e) => ({ value: e.key, label: e.nome }))}
          />
        ) : (
          <Seletor
            rotulo="Grupo muscular"
            valor={grupo}
            onChange={setGrupo}
            todos="Músculo"
            opcoes={GRUPOS.map((g) => ({ value: g.key, label: g.nome }))}
          />
        )}
      </div>
      <div className="mt-4">
        <ListaExercicios
          termo={termo}
          musculos={musculosFiltro}
          equipamentos={equipFiltro}
          nivel={nivel}
          rotina={rotina}
        />
      </div>
    </PageBody>
  );
}

/** Lista paginada por rolagem com os filtros recebidos. */
function ListaExercicios({
  termo,
  musculos,
  equipamentos,
  nivel,
  rotina,
}: {
  termo: string;
  musculos?: string[];
  equipamentos?: string[];
  nivel?: string | null;
  rotina: ActiveRoutine | null;
}) {
  const lista = useInfiniteQuery({
    queryKey: [...queryKeys.exercises.all, "lista", termo, musculos ?? [], equipamentos ?? [], nivel ?? ""],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      let query = supabase
        .from("exercises")
        .select(CAMPOS)
        .is("deleted_at", null)
        // Popularidade antes do nome: o supino reto vem antes das variações exóticas.
        .order("popularity", { ascending: false })
        .order("name")
        .range(pageParam * PAGE_SIZE, pageParam * PAGE_SIZE + PAGE_SIZE - 1);
      if (termo) {
        // Busca no nome em português e no original em inglês.
        const escapado = termo.replace(/[%,()]/g, " ");
        query = query.or(`name.ilike.%${escapado}%,name_en.ilike.%${escapado}%`);
      }
      if (musculos?.length) query = query.in("primary_muscle", musculos as never[]);
      if (equipamentos?.length) query = query.in("equipment", equipamentos as never[]);
      if (nivel) query = query.eq("level", nivel as "beginner");
      const { data, error } = await query;
      if (error) throw new Error(`Não foi possível carregar os exercícios: ${error.message}`);
      return data ?? [];
    },
    getNextPageParam: (ultima, todas) => (ultima.length < PAGE_SIZE ? undefined : todas.length),
  });
  const exercicios = useMemo(() => lista.data?.pages.flat() ?? [], [lista.data]);
  const sentinelaRef = useInfiniteScroll(() => {
    if (lista.hasNextPage && !lista.isFetchingNextPage) void lista.fetchNextPage();
  });

  if (lista.isError) {
    return (
      <ErrorState
        message={lista.error instanceof Error ? lista.error.message : "Erro ao carregar."}
        onRetry={lista.refetch}
      />
    );
  }
  if (lista.isPending) return <CardGridSkeleton count={6} />;
  if (exercicios.length === 0) {
    return (
      <EmptyState
        icon={<SearchX className="size-6" />}
        title="Nenhum exercício encontrado"
        description={
          termo
            ? `Nada corresponde a “${termo}”. A busca também aceita o nome em inglês.`
            : "Nenhum exercício com esta combinação de filtros."
        }
      />
    );
  }
  return (
    <>
      <ul className="space-y-2.5">
        {exercicios.map((ex) => (
          <ExerciseListRow key={ex.id} exercise={ex} rotina={rotina} />
        ))}
      </ul>
      <div ref={sentinelaRef} className="h-px" aria-hidden />
      {lista.isFetchingNextPage && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline size-4 animate-spin" aria-hidden />
          Carregando mais…
        </p>
      )}
    </>
  );
}

function CriarExercicio() {
  return (
    <CreateExerciseDialog
      trigger={
        <button
          type="button"
          className="mt-3 flex w-full items-center gap-4 rounded-[1.25rem] border border-dashed border-primary/40 p-3 text-left transition-colors hover:bg-primary/5"
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
            <Sparkles className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">Criar seu exercício</span>
            <span className="block text-sm text-muted-foreground">Nome e músculo, sem animação</span>
          </span>
          <ChevronRight className="mr-1 size-5 shrink-0 text-primary" aria-hidden />
        </button>
      }
    />
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

function miniaturaDe(exercise: ExerciseRow): string | null {
  const media = exerciseMedia({
    name: exercise.name,
    imageUrls: exercise.image_urls,
    externalId: exercise.external_id,
    mediaId: exercise.media_id,
    mediaRef: exercise.media_ref,
    mediaSource: exercise.media_source,
    videoUrl: exercise.video_url,
  });
  return media.gif ?? media.images[0] ?? null;
}

/** Uma linha: miniatura, nome, "músculo · equipamento", favorito e "+ Plano". */
function ExerciseListRow({ exercise, rotina }: { exercise: ExerciseRow; rotina: ActiveRoutine | null }) {
  const qc = useQueryClient();
  const miniatura = miniaturaDe(exercise);

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
    <li className="flex items-center gap-3 rounded-[1.25rem] bg-card p-3">
      <Link
        to="/exercises/$id"
        params={{ id: exercise.id }}
        className="flex min-w-0 flex-1 items-center gap-3.5"
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
          <span className="block font-semibold leading-snug">{exercise.name}</span>
          <span className="block text-sm text-muted-foreground">
            {label(MUSCLE_LABELS, exercise.primary_muscle)} · {label(EQUIPMENT_LABELS, exercise.equipment)}
            {exercise.owner_id && " · seu"}
          </span>
        </span>
      </Link>
      <FavoriteButton exerciseId={exercise.id} nome={exercise.name} />
      {rotina && rotina.templates.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="grid size-10 shrink-0 place-items-center rounded-full border border-primary/40 text-primary transition-colors hover:bg-primary/10"
              aria-label={`Adicionar ${exercise.name} a uma rotina`}
            >
              <Plus className="size-5" aria-hidden />
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

/** Busca geral com filtros de nível e grupo muscular. */
function BuscaComFiltros({ termo, rotina }: { termo: string; rotina: ActiveRoutine | null }) {
  const [nivel, setNivel] = useState<string | null>(null);
  const [grupo, setGrupo] = useState<string | null>(null);
  const musculos = grupo ? [...GRUPOS.find((g) => g.key === grupo)!.musculos] : undefined;
  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Seletor rotulo="Nível" valor={nivel} onChange={setNivel} todos="Nível" opcoes={NIVEIS} />
        <Seletor
          rotulo="Grupo muscular"
          valor={grupo}
          onChange={setGrupo}
          todos="Músculo"
          opcoes={GRUPOS.map((g) => ({ value: g.key, label: g.nome }))}
        />
      </div>
      <div className="mt-4">
        <ListaExercicios termo={termo} musculos={musculos} nivel={nivel} rotina={rotina} />
      </div>
    </>
  );
}

/** Filtro compacto: um select que ocupa a largura da sua coluna. */
function Seletor({
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
  return (
    <Select value={valor ?? "todos"} onValueChange={(v) => onChange(v === "todos" ? null : v)}>
      <SelectTrigger
        aria-label={rotulo}
        className={cn(
          "h-11 w-full min-w-0 rounded-2xl border-transparent bg-card text-sm font-semibold",
          valor && "border-primary/50 text-primary",
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="todos">{todos}</SelectItem>
        {opcoes.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Dispara uma função quando o elemento observado entra na tela (rolagem
 * infinita). A margem de 400 px começa a próxima página antes de a atual acabar.
 */
function useInfiniteScroll(onReach: () => void) {
  const ref = useRef<HTMLDivElement>(null);
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

