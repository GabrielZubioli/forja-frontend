import { cn } from "@/lib/utils";

/**
 * Espaço reservado enquanto o dado não chegou.
 *
 * Era `bg-primary/10` — uma mancha verde. Quando meia dúzia deles aparecia
 * junta, a tela de carregamento ficava mais colorida que a tela pronta, e o
 * verde perdia o significado de "isto é da marca" justamente na hora em que não
 * havia nada da marca ali. Agora é neutro: o carregamento não compete com o
 * conteúdo, ele o antecipa.
 *
 * O `animate-pulse` foi trocado por uma varredura (`shimmer`). Pulso é a
 * interface inteira piscando junto; varredura tem direção, e direção lê como
 * progresso.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("shimmer rounded-md bg-muted", className)} aria-hidden {...props} />;
}

export { Skeleton };
