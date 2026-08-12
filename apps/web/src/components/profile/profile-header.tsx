import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/data/query-keys";
import { assertOk, errorMessage } from "@/data/supabase-helpers";
import { ACCEPTED_AVATAR_TYPES, initialsFrom, resolveAvatarUrl, uploadAvatar } from "@/data/avatar";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { GOAL_LABELS, label } from "@/lib/labels";
import { weightJourney } from "@/lib/weight-journey";
import { cn } from "@/lib/utils";

/**
 * Cabeçalho do perfil.
 *
 * ## O que ele responde
 *
 * Quem eu sou, para onde estou indo e a que distância estou. Antes a tela
 * abria direto num formulário de seis campos: os dados estavam todos lá, mas
 * nenhum deles era a resposta. "Hipertrofia · 65 → 75 kg" é.
 *
 * ## A barra da jornada
 *
 * Só aparece quando existem os três números (inicial, atual, meta). Uma barra
 * de progresso com dados faltando ou inventados é pior que barra nenhuma —
 * inventa uma precisão que o app não tem.
 *
 * O progresso é medido do **peso inicial** até a meta, e não de zero: quem sai
 * de 65 rumo a 75 kg e está em 67 já andou 20% do caminho, não 89%.
 */
export function ProfileHeader({
  displayName,
  avatarPath,
  goal,
  currentWeightKg,
  startWeightKg,
  goalWeightKg,
  heightCm,
  ageYears,
  loading = false,
}: {
  displayName: string | null;
  avatarPath: string | null;
  goal: string | null;
  currentWeightKg: number | null;
  startWeightKg: number | null;
  goalWeightKg: number | null;
  heightCm: number | null;
  ageYears: number | null;
  loading?: boolean;
}) {
  if (loading) return <ProfileHeaderSkeleton />;

  const jornada = weightJourney({
    startKg: startWeightKg,
    currentKg: currentWeightKg,
    goalKg: goalWeightKg,
  });

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
      <div className="flex items-center gap-4">
        <AvatarPicker path={avatarPath} name={displayName} />

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-bold tracking-tight sm:text-2xl">
            {displayName?.trim() || "Seu perfil"}
          </h2>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {goal && <Badge variant="soft">{label(GOAL_LABELS, goal)}</Badge>}
            {ageYears !== null && <Badge variant="outline">{ageYears} anos</Badge>}
            {heightCm !== null && <Badge variant="outline">{heightCm} cm</Badge>}
          </div>
        </div>
      </div>

      {jornada && (
        <div className="mt-5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tabular-nums tracking-tight">
                {formatKg(jornada.currentKg)}
              </span>
              <span className="text-sm text-muted-foreground">kg agora</span>
            </p>
            <p className="text-sm text-muted-foreground tabular-nums">
              meta {formatKg(jornada.goalKg)} kg
            </p>
          </div>

          {/*
            Barra própria em vez do `Progress`: aqui o trilho precisa mostrar
            também o ponto de partida, e o componente genérico só desenha o
            preenchimento.
          */}
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={`${jornada.percent}% do caminho entre ${formatKg(jornada.startKg)} e ${formatKg(jornada.goalKg)} quilos.`}
          >
            <div
              className="h-full rounded-full bg-primary transition-transform duration-[var(--duration-slow)] ease-out-soft"
              style={{ transform: `translateX(-${100 - jornada.percent}%)` }}
            />
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            {jornada.reached
              ? "Você chegou à meta."
              : `Faltam ${formatKg(jornada.remainingKg)} kg · ${jornada.percent}% do caminho`}
          </p>
        </div>
      )}
    </section>
  );
}

/** Uma casa decimal, vírgula como separador — é assim que se lê peso em pt-BR. */
function formatKg(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

/**
 * Avatar com troca de foto.
 *
 * O `<input type=file>` fica escondido atrás do próprio avatar: o alvo de toque
 * é a imagem, que é onde a pessoa tenta tocar de qualquer forma. Um botão
 * "Escolher arquivo" ao lado seria mais explícito e menos usado.
 */
function AvatarPicker({ path, name }: { path: string | null; name: string | null }) {
  const qc = useQueryClient();
  const user = useCurrentUser();
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    // A assinatura é assíncrona; se o caminho mudar antes de ela voltar, a
    // resposta antiga não pode sobrescrever a nova.
    void resolveAvatarUrl(path).then((resolvida) => {
      if (ativo) setUrl(resolvida);
    });
    return () => {
      ativo = false;
    };
  }, [path]);

  const enviar = useMutation({
    mutationFn: async (file: File) => {
      const novoCaminho = await uploadAvatar(user.id, file);
      assertOk(
        "salvar foto de perfil",
        await supabase.from("profiles").update({ avatar_url: novoCaminho }).eq("id", user.id),
      );
      return novoCaminho;
    },
    onSuccess: () => {
      toast.success("Foto atualizada");
      void qc.invalidateQueries({ queryKey: queryKeys.profile() });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const iniciais = initialsFrom(name, user.email);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={enviar.isPending}
        aria-label={url ? "Trocar foto de perfil" : "Adicionar foto de perfil"}
        className={cn(
          "press-feedback group relative grid size-16 place-items-center overflow-hidden rounded-full",
          "border border-border bg-primary-soft text-primary-soft-foreground",
          "cursor-pointer sm:size-20",
        )}
      >
        {url ? (
          <img
            src={url}
            alt=""
            width={160}
            height={160}
            className="size-full object-cover"
            // A URL assinada expira; sem isto o avatar viraria um ícone
            // quebrado numa aba deixada aberta por horas.
            onError={() => setUrl(null)}
          />
        ) : (
          <span className="text-xl font-semibold sm:text-2xl">{iniciais}</span>
        )}

        <span
          className={cn(
            "absolute inset-0 grid place-items-center bg-foreground/55 text-background",
            "opacity-0 transition-opacity duration-[var(--duration-fast)] ease-out-soft",
            "group-hover:opacity-100 group-focus-visible:opacity-100",
            enviar.isPending && "opacity-100",
          )}
          aria-hidden
        >
          {enviar.isPending ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <Camera className="size-5" />
          )}
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_AVATAR_TYPES.join(",")}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) enviar.mutate(file);
          // Zera o valor para que escolher o **mesmo** arquivo de novo (depois
          // de um erro, por exemplo) volte a disparar `change`.
          e.target.value = "";
        }}
      />
    </div>
  );
}

function ProfileHeaderSkeleton() {
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
      <div className="flex items-center gap-4">
        <Skeleton className="size-16 shrink-0 rounded-full sm:size-20" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-5 w-56" />
        </div>
      </div>
      <Skeleton className="mt-5 h-2 w-full rounded-full" />
    </section>
  );
}
