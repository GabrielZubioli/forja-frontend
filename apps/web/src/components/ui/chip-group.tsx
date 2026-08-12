import { cn } from "@/lib/utils";

/**
 * Seleção por chips.
 *
 * ## Por que não um `Select` múltiplo
 *
 * As listas deste app são curtas e o valor está sempre em ver tudo de uma vez:
 * "quais equipamentos eu tenho", "quais músculos filtrar", "o que eu não como".
 * Um `<select multiple>` esconde as opções atrás de um clique e esconde a
 * seleção atrás de uma rolagem — em celular, então, é um controle hostil.
 * Com chips, escolher e conferir o que foi escolhido é o mesmo gesto.
 *
 * ## Acessibilidade
 *
 * Cada chip é um `<button>` com `aria-pressed`, dentro de um `group` rotulado.
 * Isso é o que faz um leitor de tela anunciar "Halteres, botão de alternância,
 * pressionado" em vez de só "Halteres" — a diferença entre saber e não saber o
 * que já está marcado. O grupo precisa de rótulo próprio (`label`), senão os
 * chips chegam sem contexto nenhum.
 */
export type ChipOption<T extends string = string> = {
  value: T;
  label: string;
  /** Ícone ou emoji à esquerda do rótulo. */
  icon?: React.ReactNode;
};

export function ChipGroup<T extends string>({
  label,
  options,
  selected,
  onChange,
  className,
  disabled = false,
}: {
  /** Rótulo do conjunto, anunciado antes dos chips. */
  label: string;
  options: readonly ChipOption<T>[];
  selected: readonly T[];
  onChange: (next: T[]) => void;
  className?: string;
  disabled?: boolean;
}) {
  const toggle = (value: T) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {options.map((option) => {
        const active = selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => toggle(option.value)}
            className={cn(
              "press-feedback inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5",
              "text-sm font-medium cursor-pointer",
              "disabled:pointer-events-none disabled:opacity-50",
              "[&_svg]:size-3.5 [&_svg]:shrink-0",
              active
                ? "border-primary bg-primary-soft text-primary-soft-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Escolha única, mesma linguagem visual dos chips.
 *
 * Existe para as perguntas de uma resposta só (foco do treino, local, duração)
 * não precisarem de um `Select` no meio de uma tela de chips — dois controles
 * diferentes para a mesma natureza de escolha é o tipo de inconsistência que
 * faz a tela parecer montada por pessoas diferentes.
 */
export function ChipRadio<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: readonly ChipOption<T>[];
  /**
   * Aceita `string` e não só `T` porque o valor vem do banco, onde a coluna é
   * texto livre. Restringir aqui obrigaria cada chamador a um `as` — que é
   * exatamente a asserção que esconderia um valor legado fora da lista, em vez
   * de simplesmente não marcar nenhum chip.
   */
  value: string | null | undefined;
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "press-feedback inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5",
              "text-sm font-medium cursor-pointer",
              "[&_svg]:size-3.5 [&_svg]:shrink-0",
              active
                ? "border-primary bg-primary-soft text-primary-soft-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
