import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Botão.
 *
 * ## Foco
 *
 * Não há anel de foco aqui. O `styles.css` define um `:focus-visible` global,
 * e o botão declarava o seu próprio (`focus-visible:ring-1`) por cima: os dois
 * apareciam juntos, com raios e deslocamentos diferentes. Um sistema de foco
 * só, no lugar mais alto, é o que mantém todos os elementos focáveis do app
 * com a mesma aparência.
 *
 * ## Resposta ao toque
 *
 * `press-feedback` (definido em `styles.css`) afunda o botão 3% enquanto
 * pressionado. Em tela sensível ao toque não existe `:hover`, então sem isso
 * um toque fica sem resposta alguma até a interface mudar — e meio segundo de
 * silêncio é o suficiente para a pessoa tocar de novo achando que falhou.
 *
 * ## Carregando
 *
 * `loading` põe um indicador **no lugar do ícone**, mantendo o rótulo. O
 * padrão antigo (`{isPending ? "Salvando…" : "Salvar"}`, repetido em cada
 * tela) trocava o texto e portanto a largura do botão: o elemento pulava sob o
 * dedo no instante do clique, e o texto de espera variava de tela para tela.
 * Aqui a largura não muda e o botão fica inerte sem ficar apagado — `disabled`
 * puro removeria o rótulo do fluxo de leitura de quem usa leitor de tela.
 */
const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap",
    "rounded-md text-sm font-medium cursor-pointer select-none press-feedback",
    "disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
    "aria-disabled:pointer-events-none aria-disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover active:bg-primary-active",
        /* Ação principal com peso extra — a sombra colorida separa o botão do
           fundo sem precisar de mais saturação. Reservado para o CTA da tela. */
        primary:
          "bg-primary text-primary-foreground shadow-[var(--shadow-primary)] hover:bg-primary-hover active:bg-primary-active",
        /* Tinta da marca: presença de ação primária sem competir com ela.
           Substitui os `bg-primary/10` improvisados espalhados pelas telas. */
        soft: "bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft/70",
        destructive: "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90",
        success: "bg-success text-success-foreground shadow-xs hover:bg-success/90",
        outline:
          "border border-border bg-card text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground hover:border-primary/30",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        /* Alturas em múltiplos de 4 e alinhadas às dos campos de formulário —
           um botão ao lado de um `Input` precisa ter exatamente a mesma
           altura, e antes tinha 36 contra 40. */
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 rounded-lg px-6 text-[0.9375rem]",
        icon: "size-10",
        "icon-sm": "size-8 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Mostra o indicador de progresso e impede novo acionamento. */
  loading?: boolean;
  /** Rótulo anunciado por leitor de tela enquanto carrega. */
  loadingLabel?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      loadingLabel = "Carregando",
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";

    // Com `asChild` o filho é um elemento arbitrário (quase sempre um `Link`),
    // e envolvê-lo quebraria a exigência de filho único do Slot. Links também
    // não têm estado de carregamento — navegação não é mutação.
    if (asChild) {
      return (
        <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
          {children}
        </Comp>
      );
    }

    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            <span className="sr-only">{loadingLabel}</span>
          </>
        )}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
