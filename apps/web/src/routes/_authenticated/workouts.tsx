import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * A antiga tela de Treino foi dividida entre Plano (agenda e rotinas) e
 * Estatísticas (números, recuperação, recordes, histórico). O endereço continua
 * existindo para links e favoritos antigos.
 */
export const Route = createFileRoute("/_authenticated/workouts")({
  beforeLoad: () => {
    throw redirect({ to: "/plan", replace: true });
  },
});
