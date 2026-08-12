import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Etiqueta.
 *
 * ## Por que as variantes "soft" existem
 *
 * A biblioteca de exercícios põe três etiquetas lado a lado em cada cartão
 * (músculo, equipamento, categoria). Com `bg-primary` sólido elas gritam mais
 * alto que o nome do exercício, que é a única coisa que a pessoa está lendo. As
 * variantes de tinta têm a cor da informação sem o peso — e continuam com 4.5:1
 * de contraste, porque o par fundo/texto de cada uma é um par de tokens
 * verificado no teste da paleta.
 *
 * `default` sólido segue existindo para o caso raro em que a etiqueta *é* a
 * informação principal (um "PR" numa série, por exemplo).
 */
const badgeVariants = cva(
  [
    "inline-flex items-center gap-1 rounded-md border px-2 py-0.5",
    "text-xs font-medium leading-5 whitespace-nowrap",
    "transition-colors duration-[var(--duration-fast)] ease-out-soft",
    "[&_svg]:size-3 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        soft: "border-transparent bg-primary-soft text-primary-soft-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border text-muted-foreground",
        success: "border-transparent bg-success-soft text-success",
        warning: "border-transparent bg-warning-soft text-warning",
        destructive: "border-transparent bg-destructive-soft text-destructive",
        info: "border-transparent bg-info-soft text-info",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
