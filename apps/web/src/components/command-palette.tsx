/**
 * Paleta de comandos (⌘K / Ctrl+K).
 *
 * O `cmdk` já era dependência do projeto e nunca havia sido usado. Num app com
 * seis seções, quatro entidades pesquisáveis e ações repetitivas (iniciar
 * treino, registrar peso, abrir o diário de ontem), a navegação por cliques
 * cobra um pedágio constante — especialmente no desktop.
 *
 * Três tipos de resultado no mesmo campo:
 *  - **Ações** — o que o usuário quer *fazer* (iniciar treino, registrar peso).
 *  - **Navegação** — as seções do app.
 *  - **Busca ao vivo** — exercícios, alimentos, receitas e treinos do histórico,
 *    consultados com debounce só quando há termo digitado.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Dumbbell,
  HeartPulse,
  LayoutDashboard,
  Play,
  Plus,
  Scale,
  User,
  Utensils,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/data/query-keys";
import { errorMessage, unwrapList } from "@/data/supabase-helpers";
import { startBlankSession } from "@/data/workouts";
import { useCurrentUserId } from "@/hooks/use-current-user";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { MUSCLE_LABELS, label } from "@/lib/labels";
import { formatShortDate } from "@/lib/date";
import { toast } from "sonner";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Início", icon: LayoutDashboard },
  { to: "/plan", label: "Plano", icon: Dumbbell },
  { to: "/stats", label: "Estatísticas", icon: Dumbbell },
  { to: "/exercises", label: "Exercícios", icon: Dumbbell },
  { to: "/coach", label: "Treinador", icon: User },
  { to: "/diet", label: "Diário alimentar", icon: Utensils },
  { to: "/recipes", label: "Receitas", icon: BookOpen },
  { to: "/body", label: "Corpo", icon: HeartPulse },
  { to: "/profile", label: "Perfil", icon: User },
  { to: "/settings", label: "Configurações", icon: User },
] as const;

/** Abaixo disso a busca não filtra o suficiente para valer uma requisição. */
const MIN_SEARCH_LENGTH = 2;

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const userId = useCurrentUserId();

  const debouncedTerm = useDebouncedValue(term.trim(), 250);
  const searching = debouncedTerm.length >= MIN_SEARCH_LENGTH;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Limpa o termo ao fechar, para a próxima abertura começar do zero.
  useEffect(() => {
    if (open) return;
    const timer = setTimeout(() => setTerm(""), 150);
    return () => clearTimeout(timer);
  }, [open]);

  const run = useCallback((action: () => void | Promise<void>) => {
    setOpen(false);
    void action();
  }, []);

  const startWorkout = useMutation({
    mutationFn: () => startBlankSession(userId),
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: queryKeys.workouts.all });
      void navigate({ to: "/workouts/session/$id", params: { id } });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const results = useQuery({
    queryKey: ["command-palette", debouncedTerm],
    enabled: open && searching,
    staleTime: 30_000,
    queryFn: async () => {
      const like = `%${debouncedTerm}%`;
      const [exercises, foods, recipes, sessions] = await Promise.all([
        supabase
          .from("exercises")
          .select("id, name, primary_muscle")
          .is("deleted_at", null)
          .ilike("name", like)
          .order("name")
          .limit(5)
          .then((r) => unwrapList("buscar exercícios", r)),
        supabase
          .from("foods")
          .select("id, name, brand")
          .is("deleted_at", null)
          .ilike("name", like)
          .order("name")
          .limit(5)
          .then((r) => unwrapList("buscar alimentos", r)),
        supabase
          .from("recipes")
          .select("id, name")
          .is("deleted_at", null)
          .ilike("name", like)
          .order("name")
          .limit(5)
          .then((r) => unwrapList("buscar receitas", r)),
        supabase
          .from("workout_sessions")
          .select("id, name, started_at")
          .is("deleted_at", null)
          .ilike("name", like)
          .order("started_at", { ascending: false })
          .limit(5)
          .then((r) => unwrapList("buscar treinos", r)),
      ]);
      return { exercises, foods, recipes, sessions };
    },
  });

  const data = results.data;
  const semResultados =
    searching && !results.isPending && data
      ? data.exercises.length + data.foods.length + data.recipes.length + data.sessions.length === 0
      : false;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Buscar exercícios, alimentos, receitas… ou digite uma ação"
        value={term}
        onValueChange={setTerm}
      />
      <CommandList>
        {semResultados && <CommandEmpty>Nada encontrado para “{debouncedTerm}”.</CommandEmpty>}
        {searching && results.isPending && <CommandEmpty>Buscando…</CommandEmpty>}

        <CommandGroup heading="Ações">
          <CommandItem
            value="iniciar treino rápido novo"
            onSelect={() => run(() => startWorkout.mutate())}
          >
            <Play className="mr-2 size-4" />
            Iniciar treino rápido
          </CommandItem>
          <CommandItem
            value="novo template de treino"
            onSelect={() =>
              run(() => navigate({ to: "/workouts/templates/$id", params: { id: "new" } }))
            }
          >
            <Plus className="mr-2 size-4" />
            Novo template
          </CommandItem>
          <CommandItem
            value="registrar peso corporal balança"
            onSelect={() => run(() => navigate({ to: "/body" }))}
          >
            <Scale className="mr-2 size-4" />
            Registrar peso
          </CommandItem>
          <CommandItem
            value="nova receita"
            onSelect={() => run(() => navigate({ to: "/recipes" }))}
          >
            <Plus className="mr-2 size-4" />
            Nova receita
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Ir para">
          {NAV_ITEMS.map((item) => (
            <CommandItem
              key={item.to}
              value={`ir para ${item.label}`}
              onSelect={() => run(() => navigate({ to: item.to }))}
            >
              <item.icon className="mr-2 size-4" />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>

        {data && data.exercises.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Exercícios">
              {data.exercises.map((ex) => (
                <CommandItem
                  key={ex.id}
                  value={`exercicio-${ex.id}-${ex.name}`}
                  onSelect={() =>
                    run(() => navigate({ to: "/exercises/$id", params: { id: ex.id } }))
                  }
                >
                  <Dumbbell className="mr-2 size-4" />
                  {ex.name}
                  <CommandShortcut>{label(MUSCLE_LABELS, ex.primary_muscle)}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {data && data.foods.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Alimentos">
              {data.foods.map((food) => (
                <CommandItem
                  key={food.id}
                  value={`alimento-${food.id}-${food.name}`}
                  onSelect={() => run(() => navigate({ to: "/diet" }))}
                >
                  <Utensils className="mr-2 size-4" />
                  {food.name}
                  {food.brand && <CommandShortcut>{food.brand}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {data && data.recipes.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Receitas">
              {data.recipes.map((recipe) => (
                <CommandItem
                  key={recipe.id}
                  value={`receita-${recipe.id}-${recipe.name}`}
                  onSelect={() =>
                    run(() => navigate({ to: "/recipes/$id", params: { id: recipe.id } }))
                  }
                >
                  <BookOpen className="mr-2 size-4" />
                  {recipe.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {data && data.sessions.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Treinos">
              {data.sessions.map((session) => (
                <CommandItem
                  key={session.id}
                  value={`treino-${session.id}-${session.name}`}
                  onSelect={() =>
                    run(() => navigate({ to: "/workouts/session/$id", params: { id: session.id } }))
                  }
                >
                  <Dumbbell className="mr-2 size-4" />
                  {session.name}
                  <CommandShortcut>{formatShortDate(session.started_at)}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

/** Botão que abre a paleta — para quem não conhece o atalho. */
export function CommandPaletteTrigger({ className }: { className?: string }) {
  const openPalette = () => {
    // Reaproveita o mesmo caminho do atalho, mantendo uma única fonte de verdade.
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }),
    );
  };

  return (
    <button
      type="button"
      onClick={openPalette}
      className={className}
      aria-label="Abrir busca (Ctrl+K)"
    >
      <span className="text-muted-foreground">Buscar…</span>
      <kbd className="ml-auto hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
        Ctrl K
      </kbd>
    </button>
  );
}
