import { Link } from "@tanstack/react-router";
import { CheckCircle2, ChevronRight, Dumbbell, Moon, Play } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { MUSCLE_LABELS, label } from "@/lib/labels";
import type { ActiveRoutine } from "@/data/routines";
import type { CompletedWorkout } from "@forja/domain";
import { todaysWorkout } from "@forja/domain";

/**
 * "O que eu treino hoje?" — a pergunta dominante do app.
 *
 * É o primeiro bloco da tela inicial e o único que ocupa espaço de destaque,
 * porque responde à razão pela qual a pessoa abriu o aplicativo. Tudo o mais
 * (macros, água, peso) é acompanhamento; isto é ação.
 *
 * Três estados, cada um com um objetivo diferente:
 *
 * - **Treino pendente** → botão grande, sem competição visual. Um toque para
 *   começar.
 * - **Já treinou hoje** → celebra e sai do caminho. Insistir depois de feito
 *   ensina o usuário a ignorar o card.
 * - **Dia de descanso** → diz que descansar é parte do plano, e oferece treinar
 *   assim mesmo. Quem quer treinar fora da agenda deve poder.
 */

export interface TodayWorkoutData {
  routine: ActiveRoutine;
  completedThisWeek: readonly CompletedWorkout[];
  /** Músculos do treino de hoje, para a prévia. */
  muscles: string[];
  exerciseNames: string[];
}

export function TodayWorkoutCard({
  data,
  today,
  onStart,
  isStarting,
}: {
  data: TodayWorkoutData;
  today: string;
  onStart: (templateId: string) => void;
  isStarting: boolean;
}) {
  const { routine, completedThisWeek, muscles, exerciseNames } = data;

  const { splitIndex, isPlannedDay, alreadyDone } = todaysWorkout(today, {
    weekdays: routine.trainingWeekdays,
    splitCount: Math.max(1, routine.templates.length),
    currentIndex: routine.currentIndex,
  });

  const split = routine.templates[splitIndex] ?? routine.templates[0];

  if (alreadyDone) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex items-center gap-3 p-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
            <CheckCircle2 className="size-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-tight">Treino de hoje concluído</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Descanse bem — a recuperação é onde o músculo cresce.
            </p>
          </div>
          <Button asChild variant="ghost" size="icon" className="shrink-0" aria-label="Ver treinos">
            <Link to="/workouts">
              <ChevronRight className="size-5" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!split) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="font-semibold">Sua rotina está sem divisões</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Algo deu errado ao montar o plano. Você pode gerá-lo de novo.
          </p>
          <Button asChild className="mt-3 w-full">
            <Link to="/workouts/routines/new">Montar treino</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const nomeCurto = split.name.replace(/^[A-Z]\s*—\s*/, "");

  return (
    <Card
      className={cn(
        "overflow-hidden border-0",
        // Gradiente só no estado que pede ação: destacar tudo é não destacar nada.
        isPlannedDay && "text-primary-foreground",
      )}
      style={isPlannedDay ? { background: "var(--gradient-primary)" } : undefined}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              className={cn(
                "text-xs font-semibold uppercase tracking-wider",
                isPlannedDay ? "text-primary-foreground/75" : "text-muted-foreground",
              )}
            >
              {isPlannedDay ? "Treino de hoje" : "Hoje é descanso"}
            </p>
            <h2 className="mt-1 text-balance text-xl font-bold leading-tight tracking-tight">
              {split.letter ? `${split.letter} · ${nomeCurto}` : nomeCurto}
            </h2>
          </div>

          <span
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-xl",
              isPlannedDay ? "bg-white/20" : "bg-muted text-muted-foreground",
            )}
            aria-hidden
          >
            {isPlannedDay ? <Dumbbell className="size-6" /> : <Moon className="size-5" />}
          </span>
        </div>

        {muscles.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {muscles.slice(0, 4).map((m) => (
              <Badge
                key={m}
                variant={isPlannedDay ? "secondary" : "outline"}
                className={cn(
                  "font-normal",
                  isPlannedDay && "border-0 bg-white/20 text-primary-foreground",
                )}
              >
                {label(MUSCLE_LABELS, m)}
              </Badge>
            ))}
          </div>
        )}

        {exerciseNames.length > 0 && (
          <p
            className={cn(
              "mt-3 line-clamp-2 text-sm leading-relaxed",
              isPlannedDay ? "text-primary-foreground/85" : "text-muted-foreground",
            )}
          >
            {split.exerciseCount} exercícios · {exerciseNames.slice(0, 3).join(", ")}
            {exerciseNames.length > 3 && "…"}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <Button
            size="lg"
            variant={isPlannedDay ? "secondary" : "default"}
            className={cn(
              "h-12 flex-1 rounded-xl text-base font-semibold",
              isPlannedDay && "bg-white text-primary hover:bg-white/90",
            )}
            onClick={() => onStart(split.id)}
            disabled={isStarting}
          >
            <Play className="mr-1.5 size-5" aria-hidden />
            {isPlannedDay ? "Abrir treino" : "Treinar mesmo assim"}
          </Button>

          <Button
            asChild
            size="lg"
            variant={isPlannedDay ? "secondary" : "outline"}
            className={cn(
              "h-12 rounded-xl px-4",
              isPlannedDay && "bg-white/20 text-primary-foreground hover:bg-white/30",
            )}
          >
            <Link to="/workouts">Ver semana</Link>
          </Button>
        </div>

        {!isPlannedDay && (
          <p className="mt-3 text-xs text-muted-foreground">
            Descansar está no plano. A sequência avança por treino concluído, então nada se perde.
          </p>
        )}

        {/* `completedThisWeek` é usado para o cálculo acima; a contagem dá contexto. */}
        {isPlannedDay && completedThisWeek.length > 0 && (
          <p className="mt-3 text-xs text-primary-foreground/75">
            {completedThisWeek.length} de {routine.daysPerWeek} treinos desta semana concluídos.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function TodayWorkoutSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-6 w-2/3" />
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-12 w-full rounded-xl" />
      </CardContent>
    </Card>
  );
}

/** Sem rotina: o convite para montar uma, em vez de um espaço vazio. */
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
