import { Link } from "@tanstack/react-router";
import { Dumbbell } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Quem ainda não tem rotina: o convite para montar uma.
 *
 * O "treino de hoje" em si vive no card da semana da Início (`dashboard.tsx`).
 */
export function NoRoutineCard() {
  return (
    <Card className="border-dashed">
      <CardContent className="p-5 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground">
          <Dumbbell className="size-6" aria-hidden />
        </span>
        <p className="mt-3 font-semibold">Você ainda não tem um treino</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Responda algumas perguntas e montamos sua divisão semanal completa.
        </p>
        <Button asChild className="mt-4 h-12 w-full rounded-xl">
          <Link to="/workouts/routines/new">Montar meu treino</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
