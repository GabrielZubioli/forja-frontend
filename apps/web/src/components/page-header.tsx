import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Cabeçalho e corpo de página.
 *
 * ## A coluna de leitura
 *
 * O conteúdo é limitado e centralizado. Sem isso, num monitor de 2560 px a
 * lista de exercícios virava uma linha de 2,4 metros de largura: o olho perde a
 * referência do começo da linha seguinte, e os cartões viram faixas. A tela
 * inicial já se limitava a `max-w-2xl` por conta própria — o resto do app não,
 * e a diferença entre as abas era visível a cada troca.
 *
 * `wide` existe para as telas que são de fato uma grade (biblioteca de
 * exercícios, receitas), onde mais colunas é melhor uso do espaço, não pior.
 */

const LARGURA = {
  default: "max-w-3xl",
  wide: "max-w-6xl",
} as const;

export function PageHeader({
  title,
  description,
  action,
  topo,
  wide = false,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  /** Ação secundária numa linha acima do título (ex.: "Agora não"), para o
   *  título ocupar a largura toda. */
  topo?: ReactNode;
  wide?: boolean;
}) {
  return (
    // Fixo no topo, em vidro fosco: o conteúdo passa por trás, desfocado, e o
    // título e as ações continuam à mão durante a rolagem.
    <div className="sticky top-0 z-20 px-4 pb-3 pt-[max(1.5rem,env(safe-area-inset-top))] md:px-8 md:pt-8">
      {/* O vidro passa um pouco da borda de baixo e some em degradê: o
          conteúdo entra embaixo do cabeçalho sem uma linha de corte. */}
      <div
        className="pointer-events-none absolute inset-x-0 -bottom-8 top-0 -z-10 bg-background/55 backdrop-blur-xl backdrop-saturate-150 [mask-image:linear-gradient(to_bottom,#000_calc(100%-3rem),transparent)]"
        aria-hidden
      />
      {topo && (
        <div className={cn("mx-auto mb-2 flex w-full justify-end", LARGURA[wide ? "wide" : "default"])}>
          {topo}
        </div>
      )}
      <div
        className={cn(
          "mx-auto flex w-full items-start justify-between gap-3",
          LARGURA[wide ? "wide" : "default"],
        )}
      >
        <div className="min-w-0">
          <h1 className="text-balance text-[2.5rem] font-extrabold leading-[1.05] tracking-tight">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-pretty text-base text-muted-foreground">{description}</p>
          )}
        </div>
        {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
      </div>
    </div>
  );
}

/** Botão redondo do canto do cabeçalho (ajustes, histórico…): aplicar num Link ou button. */
export const headerIconClass =
  "grid size-12 place-items-center rounded-full bg-card text-foreground transition-colors hover:bg-elevated [&_svg]:size-5";

export function PageBody({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="px-4 py-4 md:px-8 md:py-8">
      <div className={cn("mx-auto w-full", LARGURA[wide ? "wide" : "default"])}>{children}</div>
    </div>
  );
}
