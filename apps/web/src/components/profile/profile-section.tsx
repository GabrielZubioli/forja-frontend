import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Seção do perfil.
 *
 * ## Por que recolhível
 *
 * O perfil tem trinta e poucos campos. Mostrar todos de uma vez transforma a
 * tela num formulário de cadastro — e ninguém abre o perfil para preencher um
 * cadastro: abre para mudar *uma* coisa. Cada seção fechada mostra um resumo do
 * que guarda, o que permite achar a seção certa sem abrir nenhuma.
 *
 * ## Por que não `Accordion`
 *
 * O `Accordion` do Radix fecha uma seção ao abrir outra (ou exige configurar o
 * contrário) e prende as seções a um mesmo pai. Aqui cada seção é
 * independente: dá para abrir "Treino" e "Alimentação" juntas para comparar,
 * que é um uso real. `<details>` nativo daria isso de graça, mas não anima a
 * altura nem permite o resumo à direita.
 */
export function ProfileSection({
  title,
  description,
  summary,
  icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  description?: string;
  /** Resumo curto do conteúdo, visível com a seção fechada. */
  summary?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <h3>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={contentId}
          className={cn(
            "flex w-full items-center gap-3 p-4 text-left cursor-pointer sm:p-5",
            "transition-colors duration-[var(--duration-fast)] ease-out-soft hover:bg-accent/40",
          )}
        >
          {icon && (
            <span
              className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary-soft-foreground [&_svg]:size-4"
              aria-hidden
            >
              {icon}
            </span>
          )}

          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{title}</span>
            {/* O resumo some quando a seção abre: com o conteúdo à vista ele
                vira repetição, e repetição no topo empurra o que interessa. */}
            {!open && summary && (
              <span className="mt-0.5 block truncate text-sm text-muted-foreground">{summary}</span>
            )}
            {open && description && (
              <span className="mt-0.5 block text-sm text-muted-foreground">{description}</span>
            )}
          </span>

          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground",
              "transition-transform duration-[var(--duration-base)] ease-out-soft",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      </h3>

      {/* `hidden` em vez de desmontar: o estado dos campos sobrevive a fechar e
          reabrir a seção, e um formulário que esquece o que foi digitado é o
          tipo de detalhe que faz o app parecer descuidado. */}
      <div id={contentId} hidden={!open} className="border-t border-divider p-4 sm:p-5">
        {children}
      </div>
    </section>
  );
}
