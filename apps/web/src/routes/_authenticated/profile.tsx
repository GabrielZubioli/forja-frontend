import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Activity,
  CalendarHeart,
  Cake,
  ChevronRight,
  Dumbbell,
  Flag,
  Flame,
  Loader2,
  Pencil,
  Ruler,
  Scale,
  Target,
  User,
} from "lucide-react";
import { yearsBetween } from "@forja/domain";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";
import { queryKeys } from "@/data/query-keys";
import { assertOk, errorMessage, num, unwrapMaybe } from "@/data/supabase-helpers";
import { fetchWeightEnds, fetchWorkoutCounts } from "@/data/body";
import { useCurrentUser } from "@/hooks/use-current-user";
import { AvatarPicker } from "@/components/profile/avatar-picker";
import { DatePicker } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorState } from "@/components/query-boundary";
import { ACTIVITY_HINTS, ACTIVITY_LABELS, GOAL_LABELS, SEX_LABELS, label } from "@/lib/labels";
import { weightJourney } from "@/lib/weight-journey";
import { formatDate, todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";

/**
 * Perfil: quem a pessoa é — e onde ela muda isso.
 *
 * Uma faixa no topo com a foto (toque para trocar), o nome e o objetivo; os
 * dados pessoais embaixo, em blocos. Cada bloco é editável ali mesmo: toque,
 * ajuste, salve. As metas nutricionais não são calculadas a partir daqui: são
 * manuais e opcionais, em Configurações.
 */
export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [{ title: "Perfil — Habitual Fit" }, { name: "robots", content: "noindex" }],
  }),
  component: ProfilePage,
});

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

type Campo =
  | "display_name"
  | "sex"
  | "birth_date"
  | "height_cm"
  | "goal_weight_kg"
  | "goal"
  | "activity_level";

function ProfilePage() {
  const user = useCurrentUser();
  const [editando, setEditando] = useState<Campo | null>(null);

  const profile = useQuery({
    queryKey: queryKeys.profile(),
    queryFn: async () =>
      unwrapMaybe("carregar perfil", await supabase.from("profiles").select("*").maybeSingle()),
  });
  const pesos = useQuery({
    queryKey: [...queryKeys.body.all, "weight-ends"],
    queryFn: fetchWeightEnds,
  });
  const treinos = useQuery({
    queryKey: [...queryKeys.workouts.all, "counts"],
    queryFn: fetchWorkoutCounts,
  });

  if (profile.isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-8">
        <ErrorState message={errorMessage(profile.error)} onRetry={profile.refetch} />
      </div>
    );
  }

  const p = profile.data;
  const idade = p?.birth_date ? yearsBetween(p.birth_date) : null;
  const altura = p?.height_cm ? num(p.height_cm) : null;
  const peso = pesos.data?.latest ?? null;
  const meta = p?.goal_weight_kg != null ? num(p.goal_weight_kg) : null;
  const imc = peso && altura ? peso / (altura / 100) ** 2 : null;
  const jornada = weightJourney({
    startKg: pesos.data?.first ?? null,
    currentKg: peso,
    goalKg: meta,
  });

  return (
    <div className="mx-auto w-full max-w-3xl pb-10">
      {/* A faixa: cor da marca e o título. */}
      <header
        className="relative h-44 overflow-hidden md:mx-8 md:mt-8 md:rounded-[2rem]"
        style={{ background: "var(--gradient-primary)" }}
      >
        <div className="absolute -right-10 -top-16 size-56 rounded-full bg-white/10" aria-hidden />
        <div className="absolute -bottom-20 left-8 size-40 rounded-full bg-black/10" aria-hidden />
        <h1 className="relative px-5 pt-6 text-[2rem] font-extrabold leading-none tracking-tight text-primary-foreground">
          Perfil
        </h1>
      </header>

      <div className="px-4 md:px-8">
        {/* Foto sobre a faixa, nome e objetivo. */}
        <section className="-mt-16 flex flex-col items-center text-center">
          {profile.isPending ? (
            <Skeleton className="size-32 rounded-full ring-4 ring-background" />
          ) : (
            <AvatarPicker
              path={p?.avatar_url ?? null}
              name={p?.display_name ?? null}
              className="size-32 text-4xl ring-4 ring-background sm:size-32 sm:text-4xl"
            />
          )}
          {profile.isPending ? (
            <Skeleton className="mt-4 h-8 w-48" />
          ) : (
            <button
              type="button"
              onClick={() => setEditando("display_name")}
              className="group mt-4 flex items-center gap-2 rounded-xl px-2 py-1 transition-colors hover:bg-card"
              aria-label="Editar nome"
            >
              <h2 className="text-3xl font-extrabold tracking-tight">
                {p?.display_name?.trim() || "Seu nome"}
              </h2>
              <Pencil className="size-4 text-muted-foreground group-hover:text-foreground" />
            </button>
          )}
          <p className="mt-1 text-muted-foreground">{user.email}</p>
        </section>

        {/* Os dados — cada bloco abre a edição. */}
        <h3 className="mb-3 mt-8 px-1 text-lg text-muted-foreground">Dados pessoais</h3>
        {profile.isPending ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-24 rounded-[1.25rem]" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Dado
              icon={<Flame />}
              rotulo="Objetivo"
              valor={p?.goal ? label(GOAL_LABELS, p.goal) : null}
              onEdit={() => setEditando("goal")}
              pequeno
            />
            <Dado
              icon={<Activity />}
              rotulo="Atividade"
              valor={p?.activity_level ? label(ACTIVITY_LABELS, p.activity_level) : null}
              onEdit={() => setEditando("activity_level")}
              pequeno
            />
            <Dado
              icon={<Cake />}
              rotulo="Idade"
              valor={idade}
              unidade="anos"
              onEdit={() => setEditando("birth_date")}
            />
            <Dado
              icon={<Ruler />}
              rotulo="Altura"
              valor={altura}
              unidade="cm"
              onEdit={() => setEditando("height_cm")}
            />
            <Link
              to="/body"
              className="rounded-[1.25rem] bg-card p-4 transition-colors hover:bg-elevated"
            >
              <ConteudoDado
                icon={<Scale />}
                rotulo="Peso atual"
                valor={peso && fmt(peso)}
                unidade="kg"
                nota="Registrar no Corpo"
                acao={<ChevronRight className="size-4" />}
              />
            </Link>
            <Dado
              icon={<Target />}
              rotulo="Meta de peso"
              valor={meta && fmt(meta)}
              unidade="kg"
              onEdit={() => setEditando("goal_weight_kg")}
            />
            <Dado
              icon={<User />}
              rotulo="Sexo"
              valor={p?.sex ? label(SEX_LABELS, p.sex) : null}
              onEdit={() => setEditando("sex")}
              pequeno
            />
            <div className="rounded-[1.25rem] bg-card p-4">
              <ConteudoDado
                icon={<Activity />}
                rotulo="IMC"
                valor={imc && fmt(imc)}
                nota={imc ? faixaImc(imc) : "Precisa de peso e altura"}
              />
            </div>
          </div>
        )}

        {/* Metas definidas pela pessoa (manuais), quando houver. */}
        {p?.daily_kcal_target != null && (
          <Link
            to="/settings"
            search={{ secao: "metas" }}
            className="mt-3 flex items-center gap-4 rounded-[1.25rem] bg-card p-4 transition-colors hover:bg-elevated"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
              <Flame className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold tabular-nums">
                {Math.round(num(p.daily_kcal_target)).toLocaleString("pt-BR")} kcal por dia
              </span>
              <span className="block text-sm text-muted-foreground tabular-nums">
                P {Math.round(num(p.protein_g_target))} g · C {Math.round(num(p.carbs_g_target))} g
                · G {Math.round(num(p.fat_g_target))} g
              </span>
            </span>
            <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
          </Link>
        )}

        {/* A jornada até a meta. */}
        {jornada && (
          <section className="mt-3 rounded-[1.25rem] bg-card p-5" aria-label="Jornada de peso">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Início {fmt(jornada.startKg)} kg</span>
              <span className="flex items-center gap-1">
                <Flag className="size-4 text-primary" aria-hidden />
                Meta {fmt(jornada.goalKg)} kg
              </span>
            </div>
            <div
              className="mt-3 h-3 overflow-hidden rounded-full bg-elevated"
              role="img"
              aria-label={`${jornada.percent}% do caminho até a meta`}
            >
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max(4, jornada.percent)}%` }}
              />
            </div>
            <p className="mt-3 text-lg font-semibold">
              {jornada.reached
                ? "Você chegou à meta 🎉"
                : `${jornada.percent}% do caminho · faltam ${fmt(jornada.remainingKg)} kg`}
            </p>
          </section>
        )}

        {/* Atividade no app. */}
        <h3 className="mb-3 mt-8 px-1 text-lg text-muted-foreground">No Habitual Fit</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-[1.25rem] bg-card p-4">
            <ConteudoDado
              pequeno
              icon={<Dumbbell />}
              rotulo="Treinos"
              valor={treinos.data?.total ?? null}
            />
          </div>
          <div className="rounded-[1.25rem] bg-card p-4">
            <ConteudoDado
              pequeno
              icon={<CalendarHeart />}
              rotulo="Este mês"
              valor={treinos.data?.month ?? null}
            />
          </div>
          <div className="rounded-[1.25rem] bg-card p-4">
            <ConteudoDado
              pequeno
              icon={<Flag />}
              rotulo="Desde"
              valor={p?.created_at ? formatDate(p.created_at, "MMM/yy") : null}
            />
          </div>
        </div>
      </div>

      {p && editando && (
        <EditarCampo key={editando} campo={editando} perfil={p} onClose={() => setEditando(null)} />
      )}
    </div>
  );
}

// ─── Edição ──────────────────────────────────────────────────────────────────

type Perfil = Tables<"profiles">;

const TITULOS: Record<Campo, { titulo: string; dica?: string }> = {
  display_name: { titulo: "Seu nome" },
  sex: { titulo: "Sexo", dica: "Entra no cálculo do gasto calórico." },
  birth_date: { titulo: "Data de nascimento", dica: "A idade entra no cálculo do gasto calórico." },
  height_cm: { titulo: "Altura", dica: "Em centímetros." },
  goal_weight_kg: { titulo: "Meta de peso", dica: "Deixe em branco se não tiver uma meta." },
  goal: { titulo: "Objetivo", dica: "Ajusta as calorias: déficit, manutenção ou superávit." },
  activity_level: { titulo: "Nível de atividade", dica: "Quanto você se movimenta na semana." },
};

function EditarCampo({
  campo,
  perfil,
  onClose,
}: {
  campo: Campo;
  perfil: Perfil;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const inicial = perfil[campo];
  const [valor, setValor] = useState<string>(inicial == null ? "" : String(inicial));

  const erro = validar(campo, valor);

  const salvar = useMutation({
    mutationFn: async () => {
      if (erro) throw new Error(erro);
      const novo = converter(campo, valor);
      const patch: TablesUpdate<"profiles"> = { [campo]: novo };

      assertOk("salvar perfil", await supabase.from("profiles").update(patch).eq("id", perfil.id));
    },
    onSuccess: () => {
      toast.success("Salvo");
      void qc.invalidateQueries({ queryKey: queryKeys.profile() });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const { titulo, dica } = TITULOS[campo];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-[1.5rem]">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {dica && <DialogDescription>{dica}</DialogDescription>}
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            salvar.mutate();
          }}
          className="space-y-4"
        >
          {campo === "display_name" && (
            <Input
              autoFocus
              value={valor}
              maxLength={80}
              onChange={(e) => setValor(e.target.value)}
              placeholder="Como podemos te chamar?"
              className="h-12 text-lg"
              aria-label={titulo}
            />
          )}
          {(campo === "height_cm" || campo === "goal_weight_kg") && (
            <div className="relative">
              <Input
                autoFocus
                type="number"
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className="h-14 pr-14 text-2xl font-bold tabular-nums"
                aria-label={titulo}
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                {campo === "height_cm" ? "cm" : "kg"}
              </span>
            </div>
          )}
          {campo === "birth_date" && (
            <DatePicker
              years
              max={todayISO()}
              value={valor}
              onChange={setValor}
              className="h-12"
              aria-label={titulo}
            />
          )}
          {campo === "sex" && <Opcoes valor={valor} onChange={setValor} opcoes={SEX_LABELS} />}
          {campo === "goal" && <Opcoes valor={valor} onChange={setValor} opcoes={GOAL_LABELS} />}
          {campo === "activity_level" && (
            <Opcoes
              valor={valor}
              onChange={setValor}
              opcoes={ACTIVITY_LABELS}
              dicas={ACTIVITY_HINTS}
            />
          )}

          {erro && valor !== "" && <p className="text-sm text-destructive">{erro}</p>}

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="h-12 flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              className="h-12 flex-1"
              disabled={Boolean(erro) || salvar.isPending}
            >
              {salvar.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Salvar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Opcoes({
  valor,
  onChange,
  opcoes,
  dicas,
}: {
  valor: string;
  onChange: (v: string) => void;
  opcoes: Record<string, string>;
  dicas?: Record<string, string>;
}) {
  return (
    <div role="radiogroup" className="space-y-2">
      {Object.entries(opcoes).map(([k, rotulo]) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={valor === k}
          onClick={() => onChange(k)}
          className={cn(
            "flex w-full flex-col rounded-2xl border px-4 py-3 text-left transition-colors",
            valor === k
              ? "border-primary bg-primary/10"
              : "border-border bg-card hover:bg-elevated",
          )}
        >
          <span className="font-semibold">{rotulo}</span>
          {dicas?.[k] && <span className="text-sm text-muted-foreground">{dicas[k]}</span>}
        </button>
      ))}
    </div>
  );
}

function validar(campo: Campo, v: string): string | null {
  switch (campo) {
    case "display_name":
      return v.trim().length > 80 ? "Nome muito longo." : null;
    case "height_cm": {
      const n = Number(v);
      return !v || n < 100 || n > 250 ? "Altura esperada entre 100 e 250 cm." : null;
    }
    case "goal_weight_kg": {
      if (!v) return null;
      const n = Number(v);
      return n < 30 || n > 300 ? "Peso-alvo esperado entre 30 e 300 kg." : null;
    }
    case "birth_date": {
      if (!v) return "Escolha a data.";
      const idade = yearsBetween(v);
      return idade < 10 || idade > 120 ? "Informe uma data entre 10 e 120 anos atrás." : null;
    }
    default:
      return v ? null : "Escolha uma opção.";
  }
}

function converter(campo: Campo, v: string): string | number | null {
  if (campo === "height_cm") return Number(v);
  if (campo === "goal_weight_kg") return v ? Number(v) : null;
  if (campo === "display_name") return v.trim() || null;
  return v;
}

// ─── Blocos ──────────────────────────────────────────────────────────────────

/** Um bloco de dado editável. */
function Dado({
  onEdit,
  ...props
}: {
  icon: ReactNode;
  rotulo: string;
  valor: string | number | null | undefined;
  unidade?: string;
  nota?: string;
  pequeno?: boolean;
  onEdit: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label={`Editar ${props.rotulo.toLowerCase()}`}
      className="group rounded-[1.25rem] bg-card p-4 text-left transition-colors hover:bg-elevated"
    >
      <ConteudoDado
        {...props}
        acao={<Pencil className="size-3.5 opacity-60 group-hover:opacity-100" />}
      />
    </button>
  );
}

function ConteudoDado({
  icon,
  rotulo,
  valor,
  unidade,
  nota,
  pequeno = false,
  acao,
}: {
  icon: ReactNode;
  rotulo: string;
  valor: string | number | null | undefined;
  unidade?: string;
  nota?: string;
  pequeno?: boolean;
  acao?: ReactNode;
}) {
  const vazio = valor === null || valor === undefined || valor === "";
  return (
    <>
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground [&>svg:first-child]:size-4 [&>svg:first-child]:text-primary">
        {icon}
        <span className="flex-1">{rotulo}</span>
        {acao}
      </span>
      <p
        className={cn(
          "mt-2 truncate font-extrabold tabular-nums first-letter:uppercase",
          pequeno ? "text-lg" : "text-2xl",
        )}
      >
        {vazio ? (
          <span className="text-base font-normal text-muted-foreground">Adicionar</span>
        ) : (
          <>
            {valor}
            {unidade && (
              <span className="ml-1 text-base font-semibold text-muted-foreground">{unidade}</span>
            )}
          </>
        )}
      </p>
      {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
    </>
  );
}

/** Faixa do IMC pela tabela da OMS. */
function faixaImc(imc: number): string {
  if (imc < 18.5) return "Abaixo do peso";
  if (imc < 25) return "Peso normal";
  if (imc < 30) return "Sobrepeso";
  return "Obesidade";
}
