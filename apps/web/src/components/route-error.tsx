import { useEffect } from "react";
import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { ErrorScreen } from "@/components/status-screen";
import { reportLovableError } from "@/lib/lovable-error-reporting";

/** Erro numa tela: a tela de erro ocupa só o conteúdo, a navegação continua. */
export function RouteErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  useEffect(() => {
    console.error(error);
    reportLovableError(error, { boundary: "tanstack_route_error_component" });
  }, [error]);

  return (
    <ErrorScreen
      telaCheia={false}
      error={error}
      onRetry={() => {
        void router.invalidate();
        reset();
      }}
    />
  );
}
