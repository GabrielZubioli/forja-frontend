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
  wide = false,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="border-b border-border/70 px-4 py-6 md:px-8">
      <div
        className={cn(
          "mx-auto flex w-full flex-col gap-3 md:flex-row md:items-end md:justify-between",
          LARGURA[wide ? "wide" : "default"],
        )}
      >
        <div className="min-w-0">
          <h1 className="text-balance text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
          {description && (
            <p className="mt-1 text-pretty text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
      </div>
    </div>
  );
}

export function PageBody({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="px-4 py-4 md:px-8 md:py-8">
      <div className={cn("mx-auto w-full", LARGURA[wide ? "wide" : "default"])}>{children}</div>
    </div>
  );
}
