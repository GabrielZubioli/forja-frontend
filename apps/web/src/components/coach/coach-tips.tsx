import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronRight, Info, Lightbulb } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/data/query-keys";
import { fetchCoachInsights, type CoachInsight } from "@/data/coach";

/**
 * As recomendações do treinador na tela inicial.
 *
 * ## Silêncio é um estado válido
 *
 * Quando não há nada relevante a dizer, o componente **não renderiza nada** —
 * nem um card "tudo certo!", nem um espaço reservado. Um painel que fala todo
 * dia ensina o usuário a ignorá-lo; um que fala só quando tem o que dizer
 * ganha atenção quando fala.
 *
 * Pela mesma razão, uma falha na consulta não mostra erro: recomendação é
 * auxílio, não conteúdo essencial. Poluir a Home com "não foi possível
 * carregar as dicas" seria dar a um extra o peso de uma falha real.
 */
export function CoachTips({ limit }: { limit?: number } = {}) {
  const insights = useQuery({
    queryKey: queryKeys.coach.recommendations(),
    queryFn: fetchCoachInsights,
    // As análises varrem 28 dias de séries; não vale refazer a cada navegação.
    staleTime: 15 * 60 * 1000,
    retry: false,
  });

  if (insights.isPending || insights.isError) return null;
  const lista = (insights.data ?? []).slice(0, limit);
  if (lista.length === 0) return null;

  return (
    <section aria-label="Recomendações do treinador" className="space-y-2.5">
      <h2 className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Lightbulb className="size-3.5" aria-hidden />
        Seu treinador
      </h2>

      {lista.map((insight, i) => (
        <InsightCard key={insight.id} insight={insight} index={i} />
      ))}
    </section>
  );
}

function InsightCard({ insight, index }: { insight: CoachInsight; index: number }) {
  const urgente = insight.severity === 2;

  return (
    <Card
      className={cn(
        "animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-400",
        urgente && "border-chart-4/40 bg-chart-4/5",
      )}
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <CardContent className="p-4">
        <div className="flex gap-3">
          <span
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-lg",
              urgente ? "bg-chart-4/20 text-chart-4" : "bg-muted text-muted-foreground",
            )}
            aria-hidden
          >
            {urgente ? <AlertTriangle className="size-4" /> : <Info className="size-4" />}
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-balance font-semibold leading-snug">{insight.title}</p>
            <p className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">
              {insight.body}
            </p>

            {insight.action && (
              <Button asChild variant="link" className="mt-1 h-auto px-0 text-sm font-medium">
                <Link to={insight.action.to}>
                  {insight.action.label}
                  <ChevronRight className="ml-0.5 size-4" aria-hidden />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
