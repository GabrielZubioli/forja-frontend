import { useEffect, useRef, useState } from "react";
import { ImageOff, Play } from "lucide-react";

import { ExerciseDemo } from "@/components/workouts/exercise-demo-images";
import type { ExerciseMedia } from "@/data/exercise-media";
import { cn } from "@/lib/utils";

/**
 * Mídia de um exercício, seja ela qual for.
 *
 * Este é o único componente do app que sabe que existe diferença entre uma
 * fonte com GIF animado e uma com duas fotos alternadas. Todo o resto passa um
 * `ExerciseMedia` e recebe a melhor demonstração disponível.
 *
 * ## O GIF não é baixado até ser pedido
 *
 * Um GIF de exercício pesa entre 200 kB e 1 MB. A biblioteca mostra dezenas de
 * cartões por tela; baixar todos os GIFs de uma listagem consumiria dezenas de
 * megabytes — no 4G da academia, com a pessoa esperando para saber como se faz
 * uma remada.
 *
 * A regra: o cartão mostra a **miniatura estática** (alguns kB) e o `src` do
 * GIF só é definido quando a animação é realmente pedida. Antes disso o
 * navegador não faz requisição nenhuma, porque não há `src` para requisitar —
 * é diferente de `loading="lazy"`, que ainda baixa assim que o elemento se
 * aproxima da viewport.
 *
 * `autoPlay` existe para a tela de detalhe, onde há um exercício só e a
 * animação é o conteúdo principal.
 *
 * ## Atribuição
 *
 * Quando a fonte exige crédito, ele aparece **sobre a imagem**, não numa página
 * de créditos escondida. É requisito de licença da mídia da Gym visual, e o
 * componente é o lugar certo para garanti-lo: não há como exibir a imagem sem
 * exibir o crédito junto.
 */
export function ExerciseMediaView({
  media,
  name,
  className,
  autoPlay = false,
  showAttribution = true,
}: {
  media: ExerciseMedia;
  name: string;
  className?: string;
  /** Anima assim que entrar na tela. Use na ficha do exercício, não na lista. */
  autoPlay?: boolean;
  showAttribution?: boolean;
}) {
  // Sem GIF, cai no componente de dois quadros — que continua sendo a melhor
  // demonstração possível para a free-exercise-db.
  if (!media.gif) {
    return (
      <div className={cn("relative", className)}>
        <ExerciseDemo images={media.images} name={name} autoPlay={autoPlay} />
        {showAttribution && <Attribution media={media} />}
      </div>
    );
  }

  return (
    <AnimatedMedia
      media={media}
      name={name}
      className={className}
      autoPlay={autoPlay}
      showAttribution={showAttribution}
    />
  );
}

function AnimatedMedia({
  media,
  name,
  className,
  autoPlay,
  showAttribution,
}: {
  media: ExerciseMedia;
  name: string;
  className?: string;
  autoPlay: boolean;
  showAttribution: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [animando, setAnimando] = useState(false);
  /**
   * Uma vez pedido, o GIF fica montado para sempre.
   *
   * Desmontá-lo ao tirar o cursor descartaria o download e recomeçaria a
   * animação do zero na próxima passada — o oposto do que a pessoa espera de
   * algo que ela já viu carregar.
   */
  const [gifPedido, setGifPedido] = useState(false);
  const [falhou, setFalhou] = useState(false);

  const pedir = () => {
    setGifPedido(true);
    setAnimando(true);
  };

  useEffect(() => {
    if (!autoPlay) return;

    const reduzido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduzido) return;

    const alvo = containerRef.current;
    // Sem `IntersectionObserver` (ou sem elemento), anima direto: melhor
    // baixar um GIF a mais do que deixar a ficha do exercício sem demonstração.
    if (!alvo || typeof IntersectionObserver === "undefined") {
      pedir();
      return;
    }

    // Só começa quando a mídia está de fato visível. Numa ficha longa, o GIF
    // no topo não precisa ser baixado se a pessoa abriu já rolando.
    const observer = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          pedir();
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(alvo);
    return () => observer.disconnect();
  }, [autoPlay]);

  const estatica = media.images[0];
  const mostrarGif = gifPedido && !falhou;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => (animando ? setAnimando(false) : pedir())}
        onPointerEnter={pedir}
        onFocus={pedir}
        aria-label={
          animando ? `Pausar demonstração de ${name}` : `Ver demonstração animada de ${name}`
        }
        className="relative block aspect-square w-full cursor-pointer overflow-hidden rounded-xl bg-muted"
      >
        {estatica && (
          <img
            src={estatica}
            alt={`${name} — demonstração`}
            loading="lazy"
            decoding="async"
            onError={() => setFalhou(true)}
            className="absolute inset-0 size-full object-contain"
          />
        )}

        {mostrarGif && (
          <img
            src={media.gif ?? undefined}
            alt=""
            aria-hidden
            decoding="async"
            onError={() => setFalhou(true)}
            className={cn(
              "absolute inset-0 size-full object-contain transition-opacity duration-[var(--duration-base)] ease-out-soft",
              animando ? "opacity-100" : "opacity-0",
            )}
          />
        )}

        {!estatica && !mostrarGif && (
          <span className="grid size-full place-items-center text-muted-foreground">
            <ImageOff className="size-6" aria-hidden />
          </span>
        )}

        {/* Indica que há animação disponível — sem isto, a miniatura estática
            não anuncia que existe mais para ver. */}
        {!animando && !falhou && (
          <span
            className="absolute bottom-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-foreground/60 text-background"
            aria-hidden
          >
            <Play className="size-3 fill-current" />
          </span>
        )}
      </button>

      {showAttribution && <Attribution media={media} />}
    </div>
  );
}

/**
 * Crédito da fonte da mídia.
 *
 * Não renderiza nada quando a licença não exige atribuição — e o `null` vem do
 * provedor, não de uma decisão tomada aqui. Poluir o cartão com "© " de uma
 * imagem de domínio público seria ruído; omitir o de uma que exige seria
 * descumprir a licença.
 */
function Attribution({ media }: { media: ExerciseMedia }) {
  if (!media.attribution.label) return null;

  return (
    <p className="pointer-events-none absolute bottom-1 left-1 max-w-[calc(100%-2.5rem)] truncate rounded bg-foreground/55 px-1.5 py-0.5 text-[10px] leading-none text-background">
      {media.attribution.href ? (
        <a
          href={media.attribution.href}
          target="_blank"
          rel="noreferrer noopener"
          className="pointer-events-auto"
        >
          {media.attribution.label}
        </a>
      ) : (
        media.attribution.label
      )}
    </p>
  );
}
