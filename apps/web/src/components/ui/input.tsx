import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Campo de texto.
 *
 * Três coisas mudaram em relação ao componente que veio do shadcn:
 *
 * - **Altura 40 px**, igual à do `Button` padrão. Eram 36 contra 40, e todo
 *   formulário com um botão ao lado de um campo saía desalinhado por 4 px.
 * - **Foco pelo `:focus-visible` global.** O anel próprio (`ring-1`) somava-se
 *   ao contorno definido em `styles.css`, desenhando duas marcas concêntricas.
 * - **Estado inválido visível.** `aria-invalid` já era passado por várias
 *   telas, mas só afetava leitores de tela: a borda continuava idêntica à de
 *   um campo correto. Agora a validação é vista por quem enxerga também.
 *
 * `text-base` no celular é proposital: com fonte menor que 16 px o Safari do
 * iOS aplica zoom ao focar o campo, e a tela toda salta de escala.
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-base shadow-xs",
          "transition-[border-color,box-shadow,background-color] duration-[var(--duration-fast)] ease-out-soft",
          "placeholder:text-muted-foreground",
          "hover:border-primary/40",
          "file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-sm file:font-medium file:text-secondary-foreground",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-input",
          "aria-[invalid=true]:border-destructive aria-[invalid=true]:hover:border-destructive",
          "md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
