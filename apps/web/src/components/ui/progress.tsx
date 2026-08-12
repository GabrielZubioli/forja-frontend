"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/lib/utils";

/**
 * Barra de progresso.
 *
 * ## O trilho
 *
 * Era `bg-primary/20` — o mesmo verde do preenchimento, mais claro. Com o valor
 * baixo, trilho e preenchimento ficavam indistinguíveis e a barra parecia
 * cheia. O trilho agora é neutro (`bg-muted`): a leitura do quanto falta é
 * imediata em qualquer valor.
 *
 * ## O movimento
 *
 * A transição é de `transform`, não de largura — largura força o navegador a
 * recalcular o leiaute a cada quadro, `transform` roda na composição. Em telas
 * onde várias barras atualizam juntas (macros do dia, volume por músculo) essa
 * é a diferença entre 60 fps e um arrasto visível.
 *
 * `tone` existe para os casos semânticos: a barra de calorias fica âmbar quando
 * passa da meta e vermelha quando estoura. Verde para tudo faria "acima do
 * limite" parecer conquista.
 */
const TONE_CLASSES = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
} as const;

export type ProgressTone = keyof typeof TONE_CLASSES;

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & { tone?: ProgressTone }
>(({ className, value, tone = "primary", ...props }, ref) => {
  // Valor fora de 0–100 quebraria o `translateX`: 130% de meta bateria já
  // aparece como barra deslocada para fora do trilho em vez de cheia.
  const pct = Math.max(0, Math.min(100, value ?? 0));

  return (
    <ProgressPrimitive.Root
      ref={ref}
      value={value}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          "h-full w-full flex-1 rounded-full transition-transform duration-[var(--duration-slow)] ease-out-soft",
          TONE_CLASSES[tone],
        )}
        style={{ transform: `translateX(-${100 - pct}%)` }}
      />
    </ProgressPrimitive.Root>
  );
});
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
