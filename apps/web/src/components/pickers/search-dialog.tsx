/**
 * Casca comum dos diálogos de busca (exercícios, alimentos, receitas, trocas).
 *
 * Altura fixa — a lista não faz o diálogo pular enquanto se digita —, topo
 * parado com título, busca e filtros, e só a lista rola, na vertical. Nomes
 * longos quebram linha em vez de alargar o diálogo.
 */
import type { ReactNode } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function SearchDialogContent({
  title,
  description,
  srDescription,
  top,
  children,
}: {
  title: ReactNode;
  /** Linha de apoio visível sob o título. */
  description?: ReactNode;
  /** Descrição só para leitores de tela, quando não há `description`. */
  srDescription?: string;
  /** Busca e filtros: ficam fixos acima da lista. */
  top?: ReactNode;
  children: ReactNode;
}) {
  return (
    <DialogContent className="flex h-[min(calc(88dvh-var(--teclado,0px)),44rem)] max-w-lg flex-col gap-0 overflow-hidden rounded-[1.75rem] p-0 sm:p-0">
      <DialogHeader className="space-y-1.5 px-5 pb-4 pt-5 text-left">
        <DialogTitle className="break-words pr-8 text-xl font-bold leading-tight tracking-tight">
          {title}
        </DialogTitle>
        {description ? (
          <DialogDescription className="text-pretty text-sm leading-snug">
            {description}
          </DialogDescription>
        ) : (
          <DialogDescription className="sr-only">{srDescription}</DialogDescription>
        )}
      </DialogHeader>
      {top && <div className="space-y-3 border-b border-border/60 px-5 pb-4">{top}</div>}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-5 pb-6 pt-4">
        {children}
      </div>
    </DialogContent>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  loading,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  loading?: boolean;
}) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 rounded-2xl border-transparent bg-card pl-11 pr-10 text-base"
        autoFocus
        aria-label={placeholder.replace(/…$/, "")}
      />
      {loading && (
        <Loader2 className="absolute right-4 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}

/** Linha de resultado: miniatura opcional, nome em até duas linhas, detalhe e um canto à direita. */
export function ResultRow({
  thumb,
  title,
  detail,
  aside,
  onClick,
  disabled,
  highlight,
  children,
}: {
  thumb?: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  aside?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** Borda de destaque (ex.: a troca mais próxima). */
  highlight?: boolean;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left transition-colors",
        "hover:bg-elevated focus-visible:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
        highlight ? "border-primary/40" : "border-transparent",
      )}
    >
      {thumb}
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 break-words font-semibold leading-snug">{title}</span>
        {detail && (
          <span className="mt-0.5 block break-words text-xs leading-snug text-muted-foreground tabular-nums">
            {detail}
          </span>
        )}
        {children}
      </span>
      {aside && <span className="shrink-0 text-right">{aside}</span>}
    </button>
  );
}

export function ResultList({ children }: { children: ReactNode }) {
  return <ul className="space-y-2">{children}</ul>;
}

export function ResultsLoading() {
  return (
    <div className="space-y-2" role="status" aria-label="Carregando">
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-[4.5rem] w-full rounded-2xl" />
      ))}
    </div>
  );
}

export function ResultsEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="grid place-items-center px-4 py-12 text-center">
      <Search className="size-8 text-muted-foreground/50" aria-hidden />
      <p className="mt-3 text-pretty text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
