import { AlertTriangle, Languages, Lightbulb, ListOrdered } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ExerciseMediaView } from "@/components/workouts/exercise-media-view";
import { exerciseMedia } from "@/data/exercise-media";
import {
  EQUIPMENT_LABELS,
  EXERCISE_LEVEL_LABELS,
  MECHANIC_LABELS,
  MUSCLE_LABELS,
  label,
} from "@/lib/labels";

/**
 * Como executar o exercício.
 *
 * ## O que faltava
 *
 * A ficha do exercício mostrava progressão de carga, volume e recordes — tudo
 * sobre o **passado** de quem já sabe fazer o movimento. Quem abria a ficha
 * para descobrir *como* se faz uma remada cavalinho não encontrava nada. Era a
 * lacuna mais estranha do app: o dado mais básico era o único ausente.
 *
 * ## Sobre o idioma das instruções
 *
 * A fonte dos 1.324 exercícios traz o passo a passo em dez idiomas, e nenhum
 * deles é português. As instruções em inglês ficam numa coluna separada
 * (`execution_en`) e são exibidas **rotuladas como inglês**.
 *
 * A alternativa seria traduzir automaticamente. Não foi feito de propósito:
 * texto de execução com carga é onde errar tem consequência física, e uma
 * tradução automática de "keep your back neutral and hinge at the hips" tem
 * chance real de sair como instrução perigosa. Rótulo honesto é melhor que
 * tradução plausível e errada.
 */
export type ExerciseHowToData = {
  name: string;
  primary_muscle: string | null;
  secondary_muscles: string[] | null;
  equipment: string | null;
  level: string | null;
  mechanic: string | null;
  execution: string[] | null;
  /** Texto corrido em português, do catálogo curado. */
  instructions: string | null;
  execution_en: string[] | null;
  cues: string[] | null;
  common_mistakes: string[] | null;
  contraindications: string[] | null;
  image_urls: string[] | null;
  external_id: string | null;
  media_id: string | null;
  media_ref: string | null;
  media_source: string | null;
  video_url: string | null;
};

export function ExerciseHowTo({ exercise }: { exercise: ExerciseHowToData }) {
  const media = exerciseMedia({
    name: exercise.name,
    imageUrls: exercise.image_urls,
    externalId: exercise.external_id,
    mediaId: exercise.media_id,
    mediaRef: exercise.media_ref,
    mediaSource: exercise.media_source,
    videoUrl: exercise.video_url,
  });

  /*
   * Ordem de preferência das instruções:
   *
   * 1. `execution` — passo a passo estruturado em português (61 exercícios do
   *    núcleo curado). É o melhor formato: numerado e escaneável.
   * 2. `instructions` — texto corrido em português (868 exercícios). Menos
   *    estruturado, mas é português escrito por gente.
   * 3. `execution_en` — passo a passo em inglês, da fonte importada.
   *
   * O português vem antes do inglês mesmo quando o formato é pior: um texto
   * corrido que a pessoa entende vale mais que uma lista numerada que ela não
   * lê.
   */
  const passosPt = exercise.execution ?? [];
  const textoPt = exercise.instructions?.trim() ?? "";
  const passosEn = exercise.execution_en ?? [];

  const passos = passosPt.length > 0 ? passosPt : textoPt ? [] : passosEn;
  const emIngles = passos === passosEn && passosEn.length > 0;
  const mostrarTextoCorrido = passosPt.length === 0 && textoPt.length > 0;

  const secundarios = exercise.secondary_muscles ?? [];

  return (
    <Card>
      <CardContent className="grid gap-5 p-4 sm:p-6 md:grid-cols-[minmax(0,18rem)_1fr]">
        <div>
          {/* `autoPlay` aqui e não na lista: esta é a tela de um exercício só,
              e a animação é o conteúdo principal, não decoração. */}
          <ExerciseMediaView media={media} name={exercise.name} autoPlay />
        </div>

        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="soft">{label(MUSCLE_LABELS, exercise.primary_muscle)}</Badge>
            <Badge variant="outline">{label(EQUIPMENT_LABELS, exercise.equipment)}</Badge>
            {exercise.mechanic && (
              <Badge variant="outline">{label(MECHANIC_LABELS, exercise.mechanic)}</Badge>
            )}
            {exercise.level && (
              <Badge variant="outline">{label(EXERCISE_LEVEL_LABELS, exercise.level)}</Badge>
            )}
          </div>

          {secundarios.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Músculos secundários
              </h3>
              <p className="mt-1 text-sm">
                {secundarios.map((m) => label(MUSCLE_LABELS, m)).join(" · ")}
              </p>
            </div>
          )}

          {mostrarTextoCorrido && (
            <section>
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <ListOrdered className="size-3.5" aria-hidden />
                Execução
              </h3>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{textoPt}</p>
            </section>
          )}

          {passos.length > 0 && (
            <section>
              <h3 className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <ListOrdered className="size-3.5" aria-hidden />
                Passo a passo
                {emIngles && (
                  <Badge variant="warning" className="normal-case tracking-normal">
                    <Languages aria-hidden />
                    em inglês
                  </Badge>
                )}
              </h3>

              <ol className="mt-2 space-y-2">
                {passos.map((passo, i) => (
                  <li key={passo} className="flex gap-2.5 text-sm leading-relaxed">
                    <span
                      className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary-soft text-[11px] font-semibold text-primary-soft-foreground"
                      aria-hidden
                    >
                      {i + 1}
                    </span>
                    <span lang={emIngles ? "en" : undefined}>{passo}</span>
                  </li>
                ))}
              </ol>

              {emIngles && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Este exercício veio de uma base sem versão em português. O texto original é
                  exibido sem tradução automática — instrução de execução traduzida por máquina pode
                  sair perigosa.
                </p>
              )}
            </section>
          )}

          {exercise.cues && exercise.cues.length > 0 && (
            <ListaComIcone
              titulo="Dicas de execução"
              icone={<Lightbulb className="size-3.5" aria-hidden />}
              itens={exercise.cues}
              tom="primary"
            />
          )}

          {exercise.common_mistakes && exercise.common_mistakes.length > 0 && (
            <ListaComIcone
              titulo="Erros comuns"
              icone={<AlertTriangle className="size-3.5" aria-hidden />}
              itens={exercise.common_mistakes}
              tom="warning"
            />
          )}

          {exercise.contraindications && exercise.contraindications.length > 0 && (
            <ListaComIcone
              titulo="Cuidado se você tem"
              icone={<AlertTriangle className="size-3.5" aria-hidden />}
              itens={exercise.contraindications}
              tom="destructive"
            />
          )}

          {passos.length === 0 && !mostrarTextoCorrido && (
            <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
              Este exercício ainda não tem passo a passo cadastrado. A demonstração ao lado mostra o
              movimento completo.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const TONS = {
  primary: "bg-primary-soft text-primary-soft-foreground",
  warning: "bg-warning-soft text-warning",
  destructive: "bg-destructive-soft text-destructive",
} as const;

function ListaComIcone({
  titulo,
  icone,
  itens,
  tom,
}: {
  titulo: string;
  icone: React.ReactNode;
  itens: readonly string[];
  tom: keyof typeof TONS;
}) {
  return (
    <section>
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span className={`grid size-5 place-items-center rounded-full ${TONS[tom]}`} aria-hidden>
          {icone}
        </span>
        {titulo}
      </h3>
      <ul className="mt-2 space-y-1.5">
        {itens.map((item) => (
          <li key={item} className="flex gap-2 text-sm leading-relaxed">
            <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" aria-hidden />
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
