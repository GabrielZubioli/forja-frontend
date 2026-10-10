import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  Activity,
  CalendarHeart,
  Cake,
  ChevronRight,
  Dumbbell,
  Flag,
  Pencil,
  Ruler,
  Scale,
  Target,
  User,
} from "lucide-react";
import { yearsBetween } from "@forja/domain";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/data/query-keys";
import { errorMessage, num, unwrapMaybe } from "@/data/supabase-helpers";
import { fetchWeightEnds, fetchWorkoutCounts } from "@/data/body";
import { useCurrentUser } from "@/hooks/use-current-user";
import { AvatarPicker } from "@/components/profile/avatar-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/query-boundary";
import { ACTIVITY_LABELS, GOAL_LABELS, SEX_LABELS, label } from "@/lib/labels";
import { weightJourney } from "@/lib/weight-journey";
import { formatDate } from "@/lib/date";

/**
 * Perfil: quem a pessoa é, à primeira vista.
 *
 * Uma faixa no topo com a foto (toque para trocar), o nome e o objetivo; os
 * dados pessoais embaixo, em blocos de leitura rápida. Editar fica em
 * Configurações → Dados pessoais — aqui é para ver, não para preencher.
 */
export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [{ title: "Perfil — Habitual Fit" }, { name: "robots", content: "noindex" }],
  }),
  component: ProfilePage,
});

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

function ProfilePage() {
  const user = useCurrentUser();
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
      {/* A faixa: cor da marca, título e o atalho para editar. */}
      <header
        className="relative h-44 overflow-hidden md:mx-8 md:mt-8 md:rounded-[2rem]"
        style={{ background: "var(--gradient-primary)" }}
      >
        <div className="absolute -right-10 -top-16 size-56 rounded-full bg-white/10" aria-hidden />
        <div className="absolute -bottom-20 left-8 size-40 rounded-full bg-black/10" aria-hidden />
        <div className="relative flex items-center justify-between px-5 pt-6 text-primary-foreground">
          <h1 className="text-[2rem] font-extrabold leading-none tracking-tight">Perfil</h1>
          <Link
            to="/settings"
            search={{ secao: "dados" }}
            className="flex items-center gap-1.5 rounded-full bg-black/15 px-4 py-2 text-sm font-semibold backdrop-blur transition-colors hover:bg-black/25"
          >
            <Pencil className="size-4" aria-hidden />
            Editar
          </Link>
        </div>
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
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight">
              {p?.display_name?.trim() || "Seu perfil"}
            </h2>
          )}
          <p className="mt-1 text-muted-foreground">{user.email}</p>
          {p && (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {p.goal && (
                <span className="rounded-full bg-primary/15 px-3 py-1 text-sm font-semibold text-primary">
                  {label(GOAL_LABELS, p.goal)}
                </span>
              )}
              {p.activity_level && (
                <span className="rounded-full bg-card px-3 py-1 text-sm text-muted-foreground">
                  {label(ACTIVITY_LABELS, p.activity_level)}
                </span>
              )}
            </div>
          )}
        </section>

        {/* Os números do corpo. */}
        <h3 className="mb-3 mt-8 px-1 text-lg text-muted-foreground">Dados pessoais</h3>
        {profile.isPending ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-24 rounded-[1.25rem]" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Dado icon={<Cake />} rotulo="Idade" valor={idade} unidade="anos" />
            <Dado icon={<Ruler />} rotulo="Altura" valor={altura} unidade="cm" />
            <Dado icon={<Scale />} rotulo="Peso atual" valor={peso && fmt(peso)} unidade="kg" />
            <Dado icon={<Target />} rotulo="Meta de peso" valor={meta && fmt(meta)} unidade="kg" />
            <Dado
              icon={<Activity />}
              rotulo="IMC"
              valor={imc && fmt(imc)}
              nota={imc ? faixaImc(imc) : undefined}
            />
            <Dado icon={<User />} rotulo="Sexo" valor={p?.sex ? label(SEX_LABELS, p.sex) : null} />
          </div>
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
          <Dado icon={<Dumbbell />} rotulo="Treinos" valor={treinos.data?.total ?? null} />
          <Dado icon={<CalendarHeart />} rotulo="Este mês" valor={treinos.data?.month ?? null} />
          <Dado
            icon={<Flag />}
            rotulo="Desde"
            valor={p?.created_at ? formatDate(p.created_at, "MMM/yy") : null}
          />
        </div>

        <Link
          to="/settings"
          search={{ secao: "dados" }}
          className="mt-8 flex items-center gap-4 rounded-[1.25rem] bg-card p-4 transition-colors hover:bg-elevated"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-elevated">
            <Pencil className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Editar dados pessoais</span>
            <span className="block text-sm text-muted-foreground">
              Nome, nascimento, altura, objetivo
            </span>
          </span>
          <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

/** Um bloco de dado: ícone, rótulo e o valor grande. */
function Dado({
  icon,
  rotulo,
  valor,
  unidade,
  nota,
}: {
  icon: ReactNode;
  rotulo: string;
  valor: string | number | null | undefined;
  unidade?: string;
  nota?: string;
}) {
  const vazio = valor === null || valor === undefined || valor === "";
  return (
    <div className="rounded-[1.25rem] bg-card p-4">
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground [&>svg]:size-4 [&>svg]:text-primary">
        {icon}
        {rotulo}
      </span>
      <p className="mt-2 truncate text-2xl font-extrabold tabular-nums first-letter:uppercase">
        {vazio ? (
          <span className="text-base font-normal text-muted-foreground">—</span>
        ) : (
          <>
            {valor}
            {unidade && (
              <span className="ml-1 text-base font-semibold text-muted-foreground">{unidade}</span>
            )}
          </>
        )}
      </p>
      {nota && !vazio && <p className="text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
}

/** Faixa do IMC pela tabela da OMS. */
function faixaImc(imc: number): string {
  if (imc < 18.5) return "Abaixo do peso";
  if (imc < 25) return "Peso normal";
  if (imc < 30) return "Sobrepeso";
  return "Obesidade";
}
