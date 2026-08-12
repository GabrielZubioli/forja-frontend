/**
 * Estados de carregamento, erro e vazio — padronizados.
 *
 * Antes, toda tela fazia `(data ?? []).length === 0 ? <EmptyState/> : <Lista/>`,
 * o que renderiza "Você ainda não criou templates" **durante o carregamento**.
 * O usuário via, a cada navegação, uma afirmação falsa de que não tem dados.
 *
 * `QueryBoundary` distingue os três estados a partir do resultado do
 * `useQuery`, e exibe um skeleton com o formato do conteúdo real.
 */
import type { ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/data/supabase-helpers";

type QueryLike<T> = {
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
};

export function QueryBoundary<T>({
  query,
  skeleton,
  empty,
  isEmpty,
  children,
}: {
  query: QueryLike<T>;
  /** Skeleton com o formato do conteúdo real (evita salto de layout). */
  skeleton?: ReactNode;
  /** Conteúdo exibido quando a consulta retorna vazio. */
  empty?: ReactNode;
  /** Como decidir se o resultado está vazio. Padrão: array de tamanho 0. */
  isEmpty?: (data: T) => boolean;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) return <>{skeleton ?? <ListSkeleton />}</>;

  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={query.refetch} />;
  }

  const data = query.data as T;
  const vazio = isEmpty ? isEmpty(data) : Array.isArray(data) && data.length === 0;
  if (vazio && empty) return <>{empty}</>;

  return <>{children(data)}</>;
}

export function ErrorState({
  message,
  onRetry,
  compact,
}: {
  message: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <Card className="border-destructive/30">
      <CardContent
        className={cn("flex flex-col items-center gap-3 text-center", compact ? "py-6" : "py-10")}
      >
        <span className="grid size-10 place-items-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="size-5" />
        </span>
        <div>
          <p className="font-medium">Não foi possível carregar</p>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        </div>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="mr-1.5 size-4" />
            Tentar novamente
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        {icon && (
          <span className="grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground">
            {icon}
          </span>
        )}
        <div className="max-w-sm">
          <p className="font-semibold">{title}</p>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </CardContent>
    </Card>
  );
}

// --- Skeletons com o formato de cada layout recorrente do app ---

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Card>
      <CardContent className="divide-y divide-border p-0">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4 px-4 py-3.5">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
            <Skeleton className="size-8 shrink-0 rounded-md" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function CardGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardContent className="space-y-3 p-4">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-9 w-full rounded-md" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <Skeleton className="size-8 rounded-lg" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-3 w-16" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ChartSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("h-full w-full rounded-lg", className)} />;
}
