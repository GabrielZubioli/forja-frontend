import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ListChecks, PlayCircle, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { unwrapMaybe } from "@/data/supabase-helpers";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ExerciseMediaView } from "./exercise-media-view";
import { exerciseMedia, videoSearchUrl } from "@/data/exercise-media";
import { BodyMap, aggregateMuscleIntensities } from "@/components/body-map/body-map";
import {
  EQUIPMENT_LABELS,
  EXERCISE_LEVEL_LABELS,
  MECHANIC_LABELS,
  MOVEMENT_PATTERN_LABELS,
  MUSCLE_LABELS,
  label,
} from "@/lib/labels";

/**
 * Ficha completa do exercício.
 *
 * Abre em painel lateral (ou de baixo, no celular) em vez de rota própria: a
 * consulta acontece **durante** o treino, e navegar para outra tela custaria
 * perder o contexto da sessão e um toque para voltar.
 *
 * A execução em português existe para os exercícios do núcleo — os que o
 * gerador prescreve. Para os demais, a descrição original em inglês aparece
 * **rotulada como tal**. Traduzir 3.000 frases por dicionário produziria
 * português quebrado se passando por conteúdo próprio, o que é pior que assumir
 * a limitação.
 */
export function ExerciseDetailSheet({
  exerciseId,
  open,
  onOpenChange,
}: {
  exerciseId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const exercise = useQuery({
    queryKey: ["exercise-detail", exerciseId],
    enabled: open && !!exerciseId,
    queryFn: async () =>
      unwrapMaybe(
        "carregar exercício",
        await supabase
          .from("exercises")
          .select(
            "id, name, name_en, instructions, execution, execution_en, cues, common_mistakes, default_cadence, image_urls, external_id, media_id, media_ref, media_source, video_url, equipment, category, level, mechanic, movement_pattern, primary_muscle, secondary_muscles, contraindications, exercise_muscles(muscle, contribution)",
          )
          .eq("id", exerciseId!)
          .maybeSingle(),
      ),
  });

  const ex = exercise.data;

  // Passo a passo: português primeiro, inglês da base importada como reserva.
  const passosPt = ex?.execution ?? [];
  const passosEn = ex?.execution_en ?? [];
  const passos = passosPt.length > 0 ? passosPt : passosEn;
  const passosEmIngles = passosPt.length === 0 && passosEn.length > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] overflow-y-auto rounded-t-2xl sm:max-w-lg"
      >
        {exercise.isPending ? (
          <DetailSkeleton />
        ) : !ex ? (
          <div className="py-12 text-center text-muted-foreground">Exercício não encontrado.</div>
        ) : (
          <>
            <SheetHeader className="text-left">
              <SheetTitle className="text-balance text-xl leading-tight">{ex.name}</SheetTitle>
              {ex.name_en && ex.name_en !== ex.name && (
                <SheetDescription className="text-xs">{ex.name_en}</SheetDescription>
              )}
            </SheetHeader>

            <div className="space-y-6 pb-8">
              {/* A ficha abre durante o treino, para conferir o movimento —
                  a animação é o ponto, então `autoPlay`. */}
              <ExerciseMediaView
                media={exerciseMedia({
                  name: ex.name,
                  imageUrls: ex.image_urls,
                  externalId: ex.external_id,
                  mediaId: ex.media_id,
                  mediaRef: ex.media_ref,
                  mediaSource: ex.media_source,
                  videoUrl: ex.video_url,
                })}
                name={ex.name}
                autoPlay
              />

              {/* Vídeo: o do catálogo quando existe, uma busca pelo nome quando
                  não. Nenhum exercício fica sem caminho para ver a execução em
                  movimento. */}
              <Button asChild variant="outline" className="w-full">
                <a
                  href={ex.video_url ?? videoSearchUrl(ex.name)}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <PlayCircle className="mr-1.5 size-4" aria-hidden />
                  Ver vídeo da execução
                </a>
              </Button>

              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary">{label(EQUIPMENT_LABELS, ex.equipment)}</Badge>
                {ex.level && (
                  <Badge variant="outline">{label(EXERCISE_LEVEL_LABELS, ex.level)}</Badge>
                )}
                {ex.mechanic && (
                  <Badge variant="outline">{label(MECHANIC_LABELS, ex.mechanic)}</Badge>
                )}
                {ex.movement_pattern && (
                  <Badge variant="outline">
                    {label(MOVEMENT_PATTERN_LABELS, ex.movement_pattern)}
                  </Badge>
                )}
                {ex.default_cadence && (
                  <Badge variant="outline" className="tabular-nums">
                    Cadência {ex.default_cadence}
                  </Badge>
                )}
              </div>

              {/* Músculos, com o mapa ao lado da lista: a figura responde
                  "onde", a lista responde "quanto". */}
              <section>
                <SectionTitle icon={<Target className="size-4" />}>
                  Músculos trabalhados
                </SectionTitle>
                <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row">
                  <BodyMap
                    muscles={aggregateMuscleIntensities(
                      (ex.exercise_muscles ?? []).map((m) => ({
                        muscle: m.muscle,
                        contribution: Number(m.contribution),
                      })),
                    )}
                    showLegend={false}
                    className="shrink-0"
                  />

                  <dl className="w-full space-y-2 text-sm">
                    <div>
                      <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                        Principal
                      </dt>
                      <dd className="font-medium">{label(MUSCLE_LABELS, ex.primary_muscle)}</dd>
                    </div>
                    {(ex.secondary_muscles ?? []).length > 0 && (
                      <div>
                        <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                          Secundários
                        </dt>
                        <dd className="font-medium">
                          {(ex.secondary_muscles ?? [])
                            .map((m) => label(MUSCLE_LABELS, m))
                            .join(", ")}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              </section>

              {/*
                Português quando existe, inglês rotulado quando não.
                A base importada traz dez idiomas e nenhum é português; exibir
                o inglês sem avisar faria parecer erro de tradução, e traduzir
                por máquina instrução de movimento com carga é onde errar tem
                consequência física.
              */}
              {passos.length > 0 && (
                <section>
                  <SectionTitle icon={<ListChecks className="size-4" />}>
                    Execução correta
                  </SectionTitle>
                  {passosEmIngles && (
                    <Badge variant="warning" className="mt-2">
                      Texto original em inglês
                    </Badge>
                  )}
                  <ol className="mt-3 space-y-2.5">
                    {passos.map((passo, i) => (
                      <li key={passo} className="flex gap-3 text-sm leading-relaxed">
                        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary-soft text-[11px] font-bold text-primary-soft-foreground">
                          {i + 1}
                        </span>
                        <span className="text-pretty" lang={passosEmIngles ? "en" : undefined}>
                          {passo}
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {(ex.cues ?? []).length > 0 && (
                <section>
                  <SectionTitle>Pontos de atenção</SectionTitle>
                  <ul className="mt-3 space-y-1.5">
                    {(ex.cues ?? []).map((c) => (
                      <li key={c} className="flex gap-2 text-sm leading-relaxed">
                        <span
                          className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                          aria-hidden
                        />
                        <span className="text-pretty">{c}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {(ex.common_mistakes ?? []).length > 0 && (
                <section>
                  <SectionTitle icon={<AlertTriangle className="size-4 text-destructive" />}>
                    Erros comuns
                  </SectionTitle>
                  <ul className="mt-3 space-y-1.5">
                    {(ex.common_mistakes ?? []).map((m) => (
                      <li key={m} className="flex gap-2 text-sm leading-relaxed">
                        <span
                          className="mt-1.5 size-1.5 shrink-0 rounded-full bg-destructive"
                          aria-hidden
                        />
                        <span className="text-pretty">{m}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Só aparece quando não há execução curada em português. Rotular
                  a língua é o mínimo de honestidade — melhor que uma tradução
                  automática ruim se passando por conteúdo próprio. */}
              {(ex.execution ?? []).length === 0 && ex.instructions && (
                <section>
                  <SectionTitle>Descrição original</SectionTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ainda sem versão em português para este exercício. O texto abaixo é o da base de
                    origem, em inglês.
                  </p>
                  <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
                    {ex.instructions}
                  </p>
                </section>
              )}

              {(ex.contraindications ?? []).length > 0 && (
                <p className="rounded-xl bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
                  Exige atenção em caso de lesão em{" "}
                  {(ex.contraindications ?? [])
                    .map((c) => label(MUSCLE_LABELS, c).toLowerCase())
                    .join(", ")}
                  . Na dúvida, procure orientação profissional.
                </p>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SectionTitle({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {icon}
      {children}
    </h3>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-5 py-4">
      <Skeleton className="h-7 w-2/3" />
      <Skeleton className="aspect-[4/3] w-full rounded-xl" />
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-6 w-20 rounded-full" />
        ))}
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}
