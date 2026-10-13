import { Apple, Dumbbell, Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Avisos de orientação profissional — o que o app é e o que não é.
 *
 * - `treino`: o plano sugerido é referência geral, não prescrição individual.
 * - `dieta`: o app não prescreve dieta; o planejamento é com nutricionista.
 * - `app`: o Habitual Fit organiza e acompanha; não é consulta profissional.
 */
const AVISOS = {
  treino: {
    icon: Dumbbell,
    titulo: "O plano sugerido é uma referência geral",
    texto:
      "Ele é montado a partir das suas respostas e não substitui a orientação individualizada de um profissional de educação física.",
  },
  dieta: {
    icon: Apple,
    titulo: "O app não prescreve dietas",
    texto:
      "Monte e registre suas refeições aqui. O planejamento alimentar — o que, quanto e quando comer — deve ser orientado por um nutricionista.",
  },
  app: {
    icon: Info,
    titulo: "Para que serve o Habitual Fit",
    texto:
      "É uma ferramenta para organizar, acompanhar e gerenciar seus treinos e hábitos. Não é um serviço de consulta profissional.",
  },
} as const;

export type AvisoTipo = keyof typeof AVISOS;

export function AvisoProfissional({
  tipos,
  className,
}: {
  tipos: readonly AvisoTipo[];
  className?: string;
}) {
  return (
    <section
      aria-label="Avisos sobre orientação profissional"
      className={cn("space-y-3 rounded-[1.25rem] border border-border bg-card p-4", className)}
    >
      {tipos.map((t) => {
        const { icon: Icon, titulo, texto } = AVISOS[t];
        return (
          <div key={t} className="flex gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
              <Icon className="size-4" aria-hidden />
            </span>
            <p className="min-w-0 text-sm leading-relaxed text-muted-foreground">
              <span className="block font-semibold text-foreground">{titulo}</span>
              {texto}
            </p>
          </div>
        );
      })}
    </section>
  );
}
