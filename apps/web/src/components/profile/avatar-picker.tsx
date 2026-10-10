import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/data/query-keys";
import { assertOk, errorMessage } from "@/data/supabase-helpers";
import { ACCEPTED_AVATAR_TYPES, initialsFrom, resolveAvatarUrl, uploadAvatar } from "@/data/avatar";
import { useCurrentUser } from "@/hooks/use-current-user";
import { cn } from "@/lib/utils";

/**
 * Avatar com troca de foto.
 *
 * O `<input type=file>` fica escondido atrás do próprio avatar: o alvo de toque
 * é a imagem, que é onde a pessoa tenta tocar de qualquer forma. Um botão
 * "Escolher arquivo" ao lado seria mais explícito e menos usado.
 */
export function AvatarPicker({
  path,
  name,
  className,
}: {
  path: string | null;
  name: string | null;
  /** Tamanho e moldura do círculo. */
  className?: string;
}) {
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
          "cursor-pointer text-xl sm:size-20 sm:text-2xl",
          className,
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
          <span className="font-semibold">{iniciais}</span>
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
