import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Columns2, MoveHorizontal } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { PHOTO_ANGLE_LABELS, label } from "@/lib/labels";
import { formatShortDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { PhotoSession } from "@/data/progress-photos";

/**
 * Comparação antes / depois.
 *
 * ## Dois modos, porque respondem a perguntas diferentes
 *
 * - **Sobreposto** (a cortina) — "o que mudou exatamente aqui?". Arrastar a
 *   divisória troca uma foto pela outra no mesmo lugar da tela, e a mudança
 *   aparece como movimento. É de longe o modo mais revelador quando as duas
 *   fotos têm enquadramento parecido, que é justamente o que o guia de captura
 *   existe para garantir.
 * - **Lado a lado** — "como eu estava e como estou?". Menos preciso, mas é o
 *   que se quer para olhar por inteiro, e o único que funciona quando os
 *   enquadramentos não batem.
 *
 * ## O mesmo ângulo dos dois lados
 *
 * A comparação escolhe, de cada sessão, a foto do ângulo selecionado. Comparar
 * a frente de agosto com a lateral de outubro produziria uma diferença enorme e
 * completamente sem sentido — e é o erro que uma galeria de seleção livre
 * convida a cometer.
 */
export function PhotoCompare({
  before,
  after,
  urls,
}: {
  before: PhotoSession;
  after: PhotoSession;
  urls: Record<string, string>;
}) {
  const [modo, setModo] = useState<"sobreposto" | "lado-a-lado">("sobreposto");

  /** Ângulos presentes nas **duas** sessões — os únicos comparáveis. */
  const angulosComuns = useMemo(() => {
    const antes = new Set(before.photos.map((p) => p.angle));
    return after.photos.map((p) => p.angle).filter((a): a is string => Boolean(a) && antes.has(a));
  }, [before, after]);

  const [angulo, setAngulo] = useState<string | null>(null);
  const anguloAtivo =
    angulo && angulosComuns.includes(angulo) ? angulo : (angulosComuns[0] ?? null);

  const fotoAntes = before.photos.find((p) => p.angle === anguloAtivo);
  const fotoDepois = after.photos.find((p) => p.angle === anguloAtivo);
  const urlAntes = fotoAntes ? urls[fotoAntes.storage_path] : undefined;
  const urlDepois = fotoDepois ? urls[fotoDepois.storage_path] : undefined;

  if (angulosComuns.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Estas duas datas não têm nenhum ângulo em comum. Para comparar, registre o mesmo ângulo nas
        duas.
      </p>
    );
  }

  const deltaPeso =
    before.weightKg !== null && after.weightKg !== null ? after.weightKg - before.weightKg : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {angulosComuns.length > 1 && (
          <div role="tablist" aria-label="Ângulo comparado" className="flex flex-wrap gap-1.5">
            {angulosComuns.map((a) => (
              <button
                key={a}
                type="button"
                role="tab"
                aria-selected={a === anguloAtivo}
                onClick={() => setAngulo(a)}
                className={cn(
                  "press-feedback rounded-full border px-3 py-1 text-xs font-medium cursor-pointer",
                  a === anguloAtivo
                    ? "border-primary bg-primary-soft text-primary-soft-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {label(PHOTO_ANGLE_LABELS, a)}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => setModo((m) => (m === "sobreposto" ? "lado-a-lado" : "sobreposto"))}
          className="press-feedback ml-auto inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"
        >
          {modo === "sobreposto" ? (
            <>
              <Columns2 className="size-3.5" aria-hidden />
              Lado a lado
            </>
          ) : (
            <>
              <MoveHorizontal className="size-3.5" aria-hidden />
              Sobrepor
            </>
          )}
        </button>
      </div>

      {modo === "sobreposto" ? (
        <SlidingCompare
          beforeUrl={urlAntes}
          afterUrl={urlDepois}
          beforeLabel={formatShortDate(before.date)}
          afterLabel={formatShortDate(after.date)}
        />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <PhotoPane
            url={urlAntes}
            caption={formatShortDate(before.date)}
            weight={before.weightKg}
          />
          <PhotoPane
            url={urlDepois}
            caption={formatShortDate(after.date)}
            weight={after.weightKg}
          />
        </div>
      )}

      {deltaPeso !== null && (
        <p className="text-center text-sm text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">
            {deltaPeso > 0 ? "+" : ""}
            {deltaPeso.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg
          </span>{" "}
          entre as duas datas
        </p>
      )}
    </div>
  );
}

function PhotoPane({
  url,
  caption,
  weight,
}: {
  url: string | undefined;
  caption: string;
  weight: number | null;
}) {
  return (
    <figure>
      {url ? (
        <img
          src={url}
          alt={`Foto de progresso de ${caption}`}
          className="aspect-[3/4] w-full rounded-lg border border-border object-cover"
          loading="lazy"
        />
      ) : (
        <Skeleton className="aspect-[3/4] w-full rounded-lg" />
      )}
      <figcaption className="mt-1.5 text-center text-xs text-muted-foreground">
        {caption}
        {weight !== null && (
          <>
            {" · "}
            <span className="tabular-nums">
              {weight.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg
            </span>
          </>
        )}
      </figcaption>
    </figure>
  );
}

/**
 * Cortina deslizante.
 *
 * ## Como funciona
 *
 * As duas imagens ficam empilhadas no mesmo lugar. A de cima é recortada por
 * `clip-path` até a posição da divisória — recorte não move nem redimensiona
 * nada, então arrastar não provoca recálculo de leiaute e a cortina acompanha o
 * dedo sem atraso.
 *
 * ## Acessibilidade
 *
 * A divisória é um `slider` de verdade, operável pelas setas do teclado, e não
 * só uma área arrastável. Sem isso a comparação seria inacessível para quem não
 * usa mouse nem toque — e a alternativa (o modo lado a lado) fica sempre a um
 * clique de distância.
 */
function SlidingCompare({
  beforeUrl,
  afterUrl,
  beforeLabel,
  afterLabel,
}: {
  beforeUrl: string | undefined;
  afterUrl: string | undefined;
  beforeLabel: string;
  afterLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [posicao, setPosicao] = useState(50);
  const [arrastando, setArrastando] = useState(false);

  const moverPara = useCallback((clientX: number) => {
    const caixa = containerRef.current?.getBoundingClientRect();
    if (!caixa || caixa.width === 0) return;
    const relativo = ((clientX - caixa.left) / caixa.width) * 100;
    setPosicao(Math.max(0, Math.min(100, relativo)));
  }, []);

  useEffect(() => {
    if (!arrastando) return;

    const aoMover = (e: PointerEvent) => moverPara(e.clientX);
    const aoSoltar = () => setArrastando(false);

    // Os ouvintes ficam na janela, não no elemento: arrastar rápido tira o
    // ponteiro de cima da divisória, e ouvintes locais perderiam o movimento
    // no instante em que ele mais importa.
    window.addEventListener("pointermove", aoMover);
    window.addEventListener("pointerup", aoSoltar);
    window.addEventListener("pointercancel", aoSoltar);
    return () => {
      window.removeEventListener("pointermove", aoMover);
      window.removeEventListener("pointerup", aoSoltar);
      window.removeEventListener("pointercancel", aoSoltar);
    };
  }, [arrastando, moverPara]);

  if (!beforeUrl || !afterUrl) {
    return <Skeleton className="aspect-[3/4] w-full rounded-lg" />;
  }

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="relative aspect-[3/4] w-full select-none overflow-hidden rounded-lg border border-border"
        // `touch-none` impede a página de rolar enquanto se arrasta a cortina
        // no celular — sem isso o gesto vertical rouba o horizontal.
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          setArrastando(true);
          moverPara(e.clientX);
        }}
      >
        <img
          src={afterUrl}
          alt={`Foto de progresso de ${afterLabel}`}
          className="absolute inset-0 size-full object-cover"
          draggable={false}
        />
        <img
          src={beforeUrl}
          alt={`Foto de progresso de ${beforeLabel}`}
          className="absolute inset-0 size-full object-cover"
          style={{ clipPath: `inset(0 ${100 - posicao}% 0 0)` }}
          draggable={false}
        />

        <span
          className="absolute inset-y-0 w-0.5 bg-background/90 shadow-[0_0_0_1px_oklch(0_0_0/0.25)]"
          style={{ left: `${posicao}%` }}
          aria-hidden
        />

        <div
          role="slider"
          tabIndex={0}
          aria-label="Posição da divisória entre as duas fotos"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(posicao)}
          aria-valuetext={`${Math.round(posicao)}% da foto de ${beforeLabel}`}
          onKeyDown={(e) => {
            const passo = e.shiftKey ? 10 : 2;
            if (e.key === "ArrowLeft") setPosicao((p) => Math.max(0, p - passo));
            if (e.key === "ArrowRight") setPosicao((p) => Math.min(100, p + passo));
            if (e.key === "Home") setPosicao(0);
            if (e.key === "End") setPosicao(100);
          }}
          className="absolute top-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize place-items-center rounded-full border border-border bg-background shadow-md"
          style={{ left: `${posicao}%` }}
        >
          <MoveHorizontal className="size-4 text-foreground" aria-hidden />
        </div>

        <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-foreground/70 px-2 py-0.5 text-[11px] font-medium text-background">
          {beforeLabel}
        </span>
        <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-foreground/70 px-2 py-0.5 text-[11px] font-medium text-background">
          {afterLabel}
        </span>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Arraste a divisória — ou use as setas do teclado — para revelar cada foto.
      </p>
    </div>
  );
}
