import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { WEEKDAY_INITIALS, WEEKDAY_LABELS, WEEKDAYS } from "@forja/domain";

/**
 * Controles do questionário.
 *
 * Duas decisões atravessam todos eles:
 *
 * 1. **Alvo de toque grande.** O questionário é a primeira coisa que o usuário
 *    vê e quase sempre no celular, de pé. Nenhum alvo abaixo de 48 px.
 *
 * 2. **Feedback imediato e discreto.** Cada seleção responde na hora (escala,
 *    cor, marca), mas sem animação longa — a pessoa está respondendo 20
 *    perguntas em sequência, e 300 ms de espera por resposta somam um minuto de
 *    atrito.
 */

export function Question({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <h1 className="text-balance text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
          {title}
        </h1>
        {subtitle && <p className="mt-2 text-pretty text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex flex-1 flex-col animate-in fade-in duration-300">{children}</div>
    </div>
  );
}

interface ChoiceOption {
  value: string;
  label: string;
  hint?: string;
  emoji?: string;
}

/** Escolha única. A seleção avança sozinha — uma pergunta objetiva não precisa de "Próximo". */
export function ChoiceList({
  options,
  selected,
  onSelect,
  columns = 1,
}: {
  options: readonly ChoiceOption[];
  selected: string | null | undefined;
  onSelect: (value: string) => void;
  columns?: 1 | 2;
}) {
  return (
    <div className={cn("grid gap-2.5", columns === 2 && "grid-cols-2")}>
      {options.map((o, i) => {
        const active = selected === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onSelect(o.value)}
            aria-pressed={active}
            style={{ animationDelay: `${i * 35}ms` }}
            className={cn(
              "group flex min-h-[3.5rem] items-center gap-3 rounded-2xl border-2 p-4 text-left",
              "animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards duration-300",
              "transition-all active:scale-[0.985] motion-reduce:transition-none motion-reduce:active:scale-100",
              active
                ? "border-primary bg-primary/8 shadow-[0_0_0_3px_var(--primary-ring)]"
                : "border-border hover:border-primary/40 hover:bg-accent/50",
            )}
          >
            {o.emoji && (
              <span className="text-2xl leading-none" aria-hidden>
                {o.emoji}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block font-semibold leading-snug">{o.label}</span>
              {o.hint && (
                <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">
                  {o.hint}
                </span>
              )}
            </span>
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors",
                active ? "border-primary bg-primary" : "border-border",
              )}
              aria-hidden
            >
              {active && <Check className="size-3.5 text-primary-foreground" strokeWidth={3} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Escolha múltipla em pastilhas. Para listas onde nenhuma resposta também é resposta. */
export function ChipGroup({
  options,
  selected,
  onToggle,
}: {
  options: readonly ChoiceOption[];
  selected: readonly string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o, i) => {
        const active = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onToggle(o.value)}
            aria-pressed={active}
            style={{ animationDelay: `${i * 20}ms` }}
            className={cn(
              "min-h-[2.75rem] rounded-full border-2 px-4 py-2 text-sm font-medium",
              "animate-in fade-in zoom-in-95 fill-mode-backwards duration-200",
              "transition-all active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:border-primary/40 hover:bg-accent",
            )}
          >
            {active && <Check className="mr-1.5 inline size-3.5" strokeWidth={3} aria-hidden />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Número grande com controle deslizante.
 *
 * `input[type=range]` nativo: já é acessível por teclado e leitor de tela, e o
 * arraste funciona bem no toque. Recriar isso com divs custaria caro e
 * entregaria menos.
 */
export function NumberField({
  value,
  min,
  max,
  step = 1,
  unit,
  decimals = 0,
  label,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  decimals?: number;
  label: string;
  onChange: (value: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div>
      <p className="py-6 text-center tabular-nums">
        <span className="text-6xl font-bold tracking-tight">{value.toFixed(decimals)}</span>
        <span className="ml-2 text-xl font-medium text-muted-foreground">{unit}</span>
      </p>

      <div className="px-1">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value))}
          // O gradiente marca a porção preenchida sem exigir um segundo elemento.
          style={{
            background: `linear-gradient(to right, var(--primary) ${pct}%, var(--muted) ${pct}%)`,
          }}
          className="h-2.5 w-full cursor-pointer appearance-none rounded-full accent-primary [&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:bg-background [&::-webkit-slider-thumb]:shadow-md"
        />
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>
            {min}
            {unit}
          </span>
          <span>
            {max}
            {unit}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Contador para faixas curtas, onde o deslizante é impreciso demais. */
export function Stepper({
  value,
  min,
  max,
  unit,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-6 py-6">
      <Button
        size="icon"
        variant="outline"
        className="size-14 rounded-full text-2xl"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label="Diminuir"
      >
        −
      </Button>
      <div className="min-w-24 text-center">
        <p className="text-6xl font-bold tabular-nums">{value}</p>
        <p className="mt-1 text-sm text-muted-foreground">{unit}</p>
      </div>
      <Button
        size="icon"
        variant="outline"
        className="size-14 rounded-full text-2xl"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="Aumentar"
      >
        +
      </Button>
    </div>
  );
}

export function WeekdayPicker({
  selected,
  onToggle,
}: {
  selected: readonly number[];
  onToggle: (day: number) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {WEEKDAYS.map((dia) => {
        const active = selected.includes(dia);
        return (
          <button
            key={dia}
            type="button"
            aria-pressed={active}
            aria-label={WEEKDAY_LABELS[dia]}
            onClick={() => onToggle(dia)}
            className={cn(
              "flex min-h-[3.5rem] flex-col items-center justify-center rounded-xl border-2 text-base font-bold",
              "transition-all active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:border-primary/40 hover:bg-accent",
            )}
          >
            {WEEKDAY_INITIALS[dia]}
          </button>
        );
      })}
    </div>
  );
}

export function TimeField({
  value,
  onChange,
  label,
}: {
  value: string | undefined;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-2xl border-2 border-border p-4">
      <span className="font-medium">{label}</span>
      <input
        type="time"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-input bg-background px-3 py-2 text-lg font-semibold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}

/** Caixa de retorno: transforma a resposta em informação, não só em registro. */
export function Feedback({
  title,
  children,
}: {
  title?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="mt-6 rounded-2xl border border-border bg-muted/40 p-4 animate-in fade-in slide-in-from-bottom-1 duration-300"
      aria-live="polite"
    >
      {title && <p className="mb-1 text-sm font-semibold text-primary">{title}</p>}
      <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

/**
 * Botão de avanço fixo ao rodapé.
 *
 * Fica sempre visível: numa tela longa, um botão que exige rolar até o fim é o
 * lugar onde o usuário trava sem perceber que travou.
 */
export function NextButton({
  onClick,
  disabled,
  label = "Continuar",
  hint,
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
  hint?: string;
}) {
  return (
    <div className="sticky bottom-0 -mx-5 mt-6 bg-gradient-to-t from-background via-background to-transparent px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
      {hint && <p className="mb-2 text-center text-xs text-muted-foreground">{hint}</p>}
      <Button
        size="lg"
        className="h-14 w-full rounded-2xl text-base font-semibold"
        onClick={onClick}
        disabled={disabled}
      >
        {label}
      </Button>
    </div>
  );
}

/** Barra de progresso do questionário. */
export function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = (current / total) * 100;
  return (
    <div
      className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-label="Progresso do questionário"
      aria-valuenow={current}
      aria-valuemin={0}
      aria-valuemax={total}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%`, background: "var(--gradient-primary)" }}
      />
    </div>
  );
}

/**
 * Campo de texto livre que vira pastilha ao confirmar.
 *
 * Usado em alergias e alimentos: a lista pronta cobre os casos comuns, mas
 * alergia é assunto em que "não estava na lista" não pode significar "então
 * ignore".
 */
export function TagInput({
  values,
  onChange,
  placeholder,
}: {
  values: readonly string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (!values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v]);
    setDraft("");
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="min-h-[2.75rem] flex-1 rounded-xl border-2 border-border bg-background px-4 text-base focus-visible:border-primary focus-visible:outline-none"
        />
        <Button type="button" variant="outline" onClick={add} disabled={!draft.trim()}>
          Adicionar
        </Button>
      </div>

      {values.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {values.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              aria-label={`Remover ${v}`}
              className="min-h-[2.25rem] rounded-full border-2 border-primary bg-primary/10 px-3 py-1 text-sm font-medium transition-colors hover:bg-primary/20"
            >
              {v} <span aria-hidden>×</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Foco no topo a cada troca de pergunta — sem isso o leitor de tela não anuncia a nova. */
export function useAnnounceStep(step: string) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [step]);
  return ref;
}
