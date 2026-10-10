import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { todaysWorkout } from "@forja/domain";
import { fetchActiveRoutine, fetchCompletedWorkouts, scheduleInputOf } from "@/data/routines";
import { fetchOpenSessionId, openWorkoutForTemplate } from "@/data/workout-session";
import { errorMessage } from "@/data/supabase-helpers";
import { useCurrentUserId } from "@/hooks/use-current-user";
import { todayISO } from "@/lib/date";

/**
 * O botão central "Treinar" — decide para onde ir, sem perguntar:
 *
 * 1. treino aberto → volta para ele;
 * 2. hoje tem treino planejado e ainda não feito → abre;
 * 3. descanso, treino já feito ou sem plano → Plano, para escolher.
 */
export const Route = createFileRoute("/_authenticated/train")({
  head: () => ({ meta: [{ title: "Treinar — Forja" }, { name: "robots", content: "noindex" }] }),
  component: TrainRedirect,
});

function TrainRedirect() {
  const navigate = useNavigate();
  const userId = useCurrentUserId();
  const iniciado = useRef(false);

  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;

    void (async () => {
      try {
        const aberto = await fetchOpenSessionId();
        if (aberto) {
          return void navigate({
            to: "/workouts/session/$id",
            params: { id: aberto },
            replace: true,
          });
        }
        const rotina = await fetchActiveRoutine();
        if (!rotina || rotina.templates.length === 0) {
          return void navigate({ to: "/plan", replace: true });
        }
        const hoje = todayISO();
        const feitos = await fetchCompletedWorkouts(hoje, hoje);
        const { splitIndex, isPlannedDay, alreadyDone } = todaysWorkout(
          hoje,
          scheduleInputOf(rotina),
          feitos,
        );
        const template = rotina.templates[splitIndex];
        if (!isPlannedDay || alreadyDone || !template) {
          return void navigate({ to: "/plan", replace: true });
        }
        const id = await openWorkoutForTemplate(userId, template.id);
        void navigate({ to: "/workouts/session/$id", params: { id }, replace: true });
      } catch (e) {
        toast.error(errorMessage(e));
        void navigate({ to: "/plan", replace: true });
      }
    })();
  }, [navigate, userId]);

  return (
    <div className="grid min-h-[60vh] place-items-center" role="status">
      <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      <span className="sr-only">Abrindo o treino…</span>
    </div>
  );
}
