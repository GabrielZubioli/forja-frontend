import { MACRO_COLORS } from "@/components/home/macro-rings";
import { cn } from "@/lib/utils";

type Totais = { kcal: number; proteinG: number; carbsG: number; fatG: number; fiberG: number };

const SEGMENTOS = 24;

/**
 * Resumo do dia da dieta.
 *
 * As calorias viram uma régua de segmentos: o verde cheio é o que já foi
 * comido, o verde claro é o que ainda está planejado para hoje e o vazio é o
 * que sobra da meta. Dá para ler "comi, vou comer, falta" sem fazer conta. Os
 * macros ficam em quatro blocos com barra fina — número primeiro, meta ao lado.
 */
export function DaySummary({
  consumido,
  planejado,
  metas,
}: {
  consumido: Totais;
  planejado: Totais;
  metas: Totais;
}) {
  const meta = Math.max(metas.kcal, 1);
  const restante = Math.round(metas.kcal - consumido.kcal);
  const excedeu = consumido.kcal > meta * 1.05;
  const cheios = Math.min(SEGMENTOS, Math.round((consumido.kcal / meta) * SEGMENTOS));
  const previstos = Math.min(SEGMENTOS, Math.round((planejado.kcal / meta) * SEGMENTOS));
  const pct = Math.round((consumido.kcal / meta) * 100);

  return (
    <section className="mb-4 rounded-[1.5rem] border border-border bg-card p-4" aria-label="Resumo do dia">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Calorias
          </p>
          <p className="mt-1 flex items-baseline gap-1.5">
            <span className="text-4xl font-extrabold leading-none tabular-nums">
              {Math.round(consumido.kcal).toLocaleString("pt-BR")}
            </span>
            <span className="text-sm font-medium text-muted-foreground tabular-nums">
              / {Math.round(metas.kcal).toLocaleString("pt-BR")} kcal
            </span>
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-3 py-1.5 text-sm font-bold tabular-nums",
            excedeu ? "bg-destructive/15 text-destructive" : "bg-primary text-primary-foreground",
          )}
        >
          {pct}%
        </span>
      </div>

      <div
        className="mt-4 grid gap-[3px]"
        style={{ gridTemplateColumns: `repeat(${SEGMENTOS}, minmax(0, 1fr))` }}
        role="meter"
        aria-valuenow={Math.round(consumido.kcal)}
        aria-valuemax={Math.round(metas.kcal)}
        aria-label="Calorias consumidas"
      >
        {Array.from({ length: SEGMENTOS }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-7 rounded-[3px] transition-colors duration-500",
              i < cheios
                ? excedeu
                  ? "bg-destructive"
                  : "bg-primary"
                : i < previstos
                  ? "bg-primary/30"
                  : "bg-muted",
            )}
            style={{ transitionDelay: `${i * 15}ms` }}
          />
        ))}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
        <span className={cn("font-semibold", excedeu ? "text-destructive" : "text-foreground")}>
          {restante >= 0
            ? `Faltam ${restante.toLocaleString("pt-BR")} kcal`
            : `${Math.abs(restante).toLocaleString("pt-BR")} kcal acima`}
        </span>
        <span className="flex items-center gap-3 text-muted-foreground">
          <Legenda className="bg-primary" texto="comido" />
          <Legenda className="bg-primary/30" texto={`planejado ${Math.round(planejado.kcal).toLocaleString("pt-BR")}`} />
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Macro nome="Proteína" valor={consumido.proteinG} meta={metas.proteinG} cor={MACRO_COLORS.protein} />
        <Macro nome="Carboidrato" valor={consumido.carbsG} meta={metas.carbsG} cor={MACRO_COLORS.carbs} />
        <Macro nome="Gordura" valor={consumido.fatG} meta={metas.fatG} cor={MACRO_COLORS.fat} />
        <Macro nome="Fibra" valor={consumido.fiberG} meta={metas.fiberG} cor={MACRO_COLORS.fiber} />
      </div>
    </section>
  );
}

function Legenda({ className, texto }: { className: string; texto: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-2 rounded-[2px]", className)} aria-hidden />
      {texto}
    </span>
  );
}

function Macro({ nome, valor, meta, cor }: { nome: string; valor: number; meta: number; cor: string }) {
  const pct = meta > 0 ? Math.min(100, (valor / meta) * 100) : 0;
  const falta = Math.round(meta - valor);
  return (
    <div className="rounded-2xl bg-elevated p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <span className="size-2 rounded-full" style={{ background: cor }} aria-hidden />
        {nome}
      </p>
      <p className="mt-1.5 flex items-baseline gap-1">
        <span className="text-xl font-extrabold leading-none tabular-nums">{Math.round(valor)}</span>
        <span className="text-xs text-muted-foreground tabular-nums">/ {Math.round(meta)} g</span>
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{ width: `${pct}%`, background: cor }}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground tabular-nums">
        {meta <= 0 ? "sem meta" : falta > 0 ? `faltam ${falta} g` : "meta batida"}
      </p>
    </div>
  );
}
