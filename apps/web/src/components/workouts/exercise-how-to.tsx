import { AlertTriangle, Languages, Lightbulb, ListOrdered } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { INJURY_OPTIONS } from "@/lib/onboarding/options";
import { cn } from "@/lib/utils";

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

  return (
    <div className="space-y-3">
      {mostrarTextoCorrido && (
        <Bloco titulo="Execução" icone={<ListOrdered className="size-4" aria-hidden />}>
          <p className="whitespace-pre-line text-[15px] leading-relaxed">{textoPt}</p>
        </Bloco>
      )}

      {passos.length > 0 && (
        <Bloco
          titulo="Passo a passo"
          icone={<ListOrdered className="size-4" aria-hidden />}
          extra={
            emIngles ? (
              <Badge variant="warning" className="normal-case tracking-normal">
                <Languages aria-hidden />
                em inglês
              </Badge>
            ) : null
          }
        >
          {/* Linha vertical ligando os números: lê como sequência, não como lista solta. */}
          <ol className="relative space-y-4">
            <span className="absolute bottom-3 left-[13px] top-3 w-px bg-border" aria-hidden />
            {passos.map((passo, i) => (
              <li key={passo} className="relative flex gap-3.5 text-[15px] leading-relaxed">
                <span
                  className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground"
                  aria-hidden
                >
                  {i + 1}
                </span>
                <span className="pt-0.5" lang={emIngles ? "en" : undefined}>
                  {passo}
                </span>
              </li>
            ))}
          </ol>
          {emIngles && (
            <p className="mt-3 text-xs text-muted-foreground">
              Sem versão em português na base de origem. O texto original é exibido sem tradução
              automática — instrução de execução traduzida por máquina pode sair perigosa.
            </p>
          )}
        </Bloco>
      )}

      {exercise.cues && exercise.cues.length > 0 && (
        <ListaComIcone
          titulo="Dicas de execução"
          icone={<Lightbulb className="size-4" aria-hidden />}
          itens={exercise.cues}
          tom="primary"
        />
      )}

      {exercise.common_mistakes && exercise.common_mistakes.length > 0 && (
        <ListaComIcone
          titulo="Erros comuns"
          icone={<AlertTriangle className="size-4" aria-hidden />}
          itens={exercise.common_mistakes}
          tom="warning"
        />
      )}

      {exercise.contraindications && exercise.contraindications.length > 0 && (
        <ListaComIcone
          titulo="Cuidado se você tem"
          icone={<AlertTriangle className="size-4" aria-hidden />}
          itens={exercise.contraindications.map(
            (c) => INJURY_OPTIONS.find((o) => o.value === c)?.label ?? c,
          )}
          tom="destructive"
        />
      )}

      {passos.length === 0 && !mostrarTextoCorrido && (
        <p className="rounded-[1.25rem] border border-dashed border-border p-4 text-sm text-muted-foreground">
          Este exercício ainda não tem passo a passo cadastrado. A demonstração acima mostra o
          movimento completo.
        </p>
      )}
    </div>
  );
}

function Bloco({
  titulo,
  icone,
  extra,
  children,
  className,
}: {
  titulo: string;
  icone: React.ReactNode;
  extra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-[1.25rem] bg-card p-4", className)}>
      <h3 className="mb-3 flex flex-wrap items-center gap-2 font-bold">
        {icone}
        {titulo}
        {extra}
      </h3>
      {children}
    </section>
  );
}

const TONS = {
  primary: { titulo: "text-primary", borda: "border-l-primary" },
  warning: { titulo: "text-warning", borda: "border-l-warning" },
  destructive: { titulo: "text-destructive", borda: "border-l-destructive" },
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
    <section className={cn("rounded-[1.25rem] border-l-4 bg-card p-4", TONS[tom].borda)}>
      <h3 className={cn("mb-2 flex items-center gap-2 font-bold", TONS[tom].titulo)}>
        {icone}
        {titulo}
      </h3>
      <ul className="space-y-1.5">
        {itens.map((item) => (
          <li key={item} className="flex gap-2.5 text-[15px] leading-relaxed">
            <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-muted-foreground" aria-hidden />
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
