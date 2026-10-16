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
 * O passo a passo em português fica em `execution` — no catálogo, escrito a
 * partir do texto original revisando cada passo, sem tradução automática
 * (instrução de execução com carga é onde errar tem consequência física). O
 * original em inglês continua em `instructions`/`execution_en` e só aparece,
 * **rotulado como inglês**, se faltar a versão em português.
 */
export type ExerciseHowToData = {
  name: string;
  primary_muscle: string | null;
  secondary_muscles: string[] | null;
  equipment: string | null;
  level: string | null;
  mechanic: string | null;
  execution: string[] | null;
  /** Texto original da fonte importada, em inglês. */
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
   * Ordem de preferência: `execution` (passo a passo em português) e, só na
   * falta dele, o original em inglês — em passos (`execution_en`) ou corrido
   * (`instructions`), sempre com o rótulo "em inglês".
   */
  const passosPt = exercise.execution ?? [];
  const passosEn = exercise.execution_en ?? [];
  const textoEn = exercise.instructions?.trim() ?? "";

  const passos = passosPt.length > 0 ? passosPt : passosEn;
  const emIngles = passosPt.length === 0 && (passosEn.length > 0 || textoEn.length > 0);
  const mostrarTextoCorrido = passosPt.length === 0 && passosEn.length === 0 && textoEn.length > 0;

  return (
    <div className="space-y-3">
      {mostrarTextoCorrido && (
        <Bloco
          titulo="Execução"
          icone={<ListOrdered className="size-4" aria-hidden />}
          extra={
            <Badge variant="warning" className="normal-case tracking-normal">
              <Languages aria-hidden />
              em inglês
            </Badge>
          }
        >
          <p className="whitespace-pre-line text-[15px] leading-relaxed" lang="en">
            {textoEn}
          </p>
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
            <span
              className="mt-2.5 size-1.5 shrink-0 rounded-full bg-muted-foreground"
              aria-hidden
            />
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
