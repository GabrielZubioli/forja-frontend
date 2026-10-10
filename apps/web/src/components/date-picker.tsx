import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate, fromISODate, toISODate, todayISO } from "@/lib/date";
import { cn } from "@/lib/utils";

/**
 * O seletor de data do app — um só, no estilo do resto da interface.
 *
 * Substitui o `<input type="date">`, que abria o calendário nativo de cada
 * navegador (branco no Chrome, rolete no iOS) e quebrava o tema escuro.
 */
export function DatePicker({
  value,
  onChange,
  min,
  max,
  id,
  disabled,
  className,
  years = false,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
}: {
  /** `YYYY-MM-DD`, ou vazio. */
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  max?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  /** Mês e ano em listas — para datas distantes, como a de nascimento. */
  years?: boolean;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const selecionada = value ? fromISODate(value) : undefined;
  const hoje = todayISO();
  const hojePermitido = (!min || hoje >= min) && (!max || hoje <= max);

  const escolher = (iso: string) => {
    onChange(iso);
    setAberto(false);
  };

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          className={cn(
            "flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-base transition-colors hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 aria-invalid:border-destructive md:text-sm",
            className,
          )}
        >
          <CalendarDays className="size-4 shrink-0 text-primary" aria-hidden />
          <span
            className={cn(
              "flex-1 truncate first-letter:uppercase",
              !value && "text-muted-foreground",
            )}
          >
            {value ? rotulo(value) : "Escolher data"}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto rounded-[1.25rem] border-border bg-card p-2 shadow-xl"
      >
        <Calendar
          mode="single"
          locale={ptBR}
          selected={selecionada}
          defaultMonth={selecionada}
          onSelect={(d) => d && escolher(toISODate(d))}
          disabled={[
            ...(min ? [{ before: fromISODate(min) }] : []),
            ...(max ? [{ after: fromISODate(max) }] : []),
          ]}
          labels={{
            labelPrevious: () => "Mês anterior",
            labelNext: () => "Próximo mês",
            labelMonthDropdown: () => "Mês",
            labelYearDropdown: () => "Ano",
            labelDayButton: (d, m) =>
              `${m.today ? "Hoje, " : ""}${formatDate(toISODate(d), "EEEE, d 'de' MMMM 'de' yyyy")}${m.selected ? ", escolhido" : ""}`,
          }}
          captionLayout={years ? "dropdown" : "label"}
          startMonth={years ? new Date(1930, 0) : undefined}
          endMonth={max ? fromISODate(max) : undefined}
          className="bg-transparent p-1 [--cell-size:2.5rem]"
          classNames={{
            // Sem os cantos retos do componente base no 1º/último dia da linha:
            // aqui o dia escolhido é sempre um círculo.
            day: "relative aspect-square h-full w-full select-none p-0 text-center",
            caption_label: years
              ? "flex h-9 select-none items-center gap-1 rounded-lg px-2.5 text-sm font-semibold first-letter:uppercase [&>svg]:size-3.5 [&>svg]:text-muted-foreground"
              : "select-none text-base font-semibold first-letter:uppercase",
            dropdown_root: "relative rounded-lg border border-border bg-elevated",
            weekday: "flex-1 select-none text-xs font-medium uppercase text-muted-foreground",
            today:
              "rounded-full text-primary font-bold data-[selected=true]:text-primary-foreground",
          }}
          components={{
            DayButton: ({ day, modifiers, className: c, ...props }) => (
              <button
                {...props}
                className={cn(
                  c,
                  "grid aspect-square w-full min-w-(--cell-size) place-items-center rounded-full text-sm tabular-nums transition-colors hover:bg-elevated disabled:pointer-events-none",
                  modifiers.selected &&
                    "bg-primary font-bold text-primary-foreground hover:bg-primary",
                )}
              />
            ),
          }}
        />
        {!years && hojePermitido && value !== hoje && (
          <button
            type="button"
            onClick={() => escolher(hoje)}
            className="mt-1 w-full rounded-xl py-2.5 text-sm font-semibold text-primary hover:bg-elevated"
          >
            Hoje
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** "sáb., 10 de out." — com o ano só quando não é o corrente. */
function rotulo(iso: string): string {
  const mesmoAno = iso.slice(0, 4) === todayISO().slice(0, 4);
  return formatDate(iso, mesmoAno ? "EEE, d 'de' MMM" : "d 'de' MMM 'de' yyyy");
}
