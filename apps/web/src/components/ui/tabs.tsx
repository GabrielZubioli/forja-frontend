import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      // `max-w-full` + rolagem horizontal: quatro abas com ícone e rótulo
      // ("Resumo", "Peso", "Medidas", "Fotos") não cabem em 320 px, e o
      // `inline-flex` sem limite empurrava a página inteira para o lado. Agora a
      // faixa rola sozinha e o resto da tela fica no lugar.
      // `scrollbar-none` evita a barra cinza aparecendo sobre as abas no desktop.
      "inline-flex h-11 max-w-full items-center justify-start overflow-x-auto rounded-lg border border-border bg-surface p-1 text-muted-foreground",
      "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

/**
 * A aba ativa sobe de superfície em vez de mudar de cor.
 *
 * A faixa é `bg-surface` (recuada) e a aba ativa é `bg-card` (o nível do
 * conteúdo logo abaixo) — a seleção lê como "esta aba está conectada ao que
 * está sendo mostrado", que é a informação que a pessoa precisa. Antes o
 * indicador era só peso de fonte, e em telas pequenas era fácil perder de
 * vista em qual aba se estava.
 */
const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex h-9 items-center justify-center whitespace-nowrap rounded-md px-3 text-sm font-medium",
      "cursor-pointer press-feedback",
      "hover:text-foreground",
      "disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
      "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm",
      "[&_svg]:size-4 [&_svg]:shrink-0",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    // A entrada só acontece na aba que passa a estar ativa — `data-[state=active]`
    // impede que o painel escondido também anime, o que ligaria a animação duas
    // vezes a cada troca.
    className={cn("mt-3 data-[state=active]:animate-rise", className)}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
