import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Cartão.
 *
 * ## Elevação como variante, não como classe solta
 *
 * As telas vinham improvisando o nível de cada cartão (`shadow-md` aqui,
 * `hover:shadow-md` ali, nada acolá), e o resultado era um app em que dois
 * cartões vizinhos pareciam estar a alturas diferentes sem nenhum motivo. As
 * três variantes cobrem os casos reais:
 *
 * - `default` — a superfície comum, encostada no plano.
 * - `elevated` — destaque legítimo (resumo do dia, meta ativa). Um por tela.
 * - `interactive` — o cartão inteiro é um alvo. Sobe ao passar o cursor e
 *   afunda ao ser pressionado, que é o que informa "isto é clicável" antes de
 *   qualquer texto dizer.
 *
 * ## Respiro
 *
 * `p-4` no celular e `p-6` a partir de `sm`. O valor fixo de 24 px consumia
 * 15% da largura de uma tela de 320 px em cada lado — as telas de treino, que
 * empilham cartões, ficavam com uma coluna de conteúdo estreitíssima.
 */
const cardVariants = cva(
  "rounded-xl border border-border bg-card text-card-foreground dark:border-transparent",
  {
    variants: {
      variant: {
        default: "shadow-sm",
        elevated: "bg-elevated shadow-md",
        interactive: [
          "press-feedback cursor-pointer shadow-sm text-left",
          "hover:border-primary/30 hover:shadow-md",
        ],
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, ...props }, ref) => (
    <div ref={ref} className={cn(cardVariants({ variant }), className)} {...props} />
  ),
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-4 sm:p-6", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-4 pt-0 sm:p-6 sm:pt-0", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center p-4 pt-0 sm:p-6 sm:pt-0", className)}
      {...props}
    />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent, cardVariants };
