import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Demonstração do exercício.
 *
 * ## Duas fotos alternadas em vez de um GIF
 *
 * O catálogo traz duas imagens por exercício: início e fim do movimento.
 * Alternar entre elas comunica a mecânica tão bem quanto um GIF, e melhor em
 * três aspectos práticos: cada quadro é uma imagem estática cacheável (um GIF
 * de 2 s pesa mais que as duas somadas), a alternância respeita
 * `prefers-reduced-motion`, e a pessoa pode parar no quadro que quer examinar.
 *
 * ## Falha silenciosa
 *
 * As imagens vêm de CDN externa. Quando não carregam — rede da academia, CDN
 * fora do ar —, o componente mostra um espaço neutro em vez do ícone de imagem
 * quebrada do navegador. O exercício continua utilizável sem a foto; o que não
 * pode é a tela parecer defeituosa.
 */
export function ExerciseDemo({
  images,
  name,
  className,
  autoPlay = true,
}: {
  images: readonly string[];
  name: string;
  className?: string;
  autoPlay?: boolean;
}) {
  const [frame, setFrame] = useState(0);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(autoPlay);

  const temMultiplas = images.length > 1;

  useEffect(() => {
    if (!playing || !temMultiplas || failed) return;

    // Respeita quem pediu menos movimento no sistema: a alternância automática
    // é exatamente o tipo de animação que incomoda quem ativou essa preferência.
    const reduzido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduzido) return;

    const timer = window.setInterval(() => setFrame((f) => (f + 1) % images.length), 900);
    return () => window.clearInterval(timer);
  }, [playing, temMultiplas, images.length, failed]);

  if (images.length === 0 || failed) {
    return (
      <div
        className={cn(
          "grid aspect-[4/3] place-items-center rounded-xl bg-muted text-muted-foreground",
          className,
        )}
      >
        <ImageOff className="size-6" aria-hidden />
        <span className="sr-only">Sem demonstração disponível para {name}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => (temMultiplas ? setPlaying((p) => !p) : undefined)}
      aria-label={
        temMultiplas
          ? `${playing ? "Pausar" : "Reproduzir"} demonstração de ${name}`
          : `Demonstração de ${name}`
      }
      className={cn(
        "relative block aspect-[4/3] w-full overflow-hidden rounded-xl bg-muted",
        temMultiplas && "cursor-pointer",
        className,
      )}
    >
      {images.map((src, i) => (
        <img
          key={src}
          src={src}
          alt={i === 0 ? `${name} — posição inicial` : `${name} — posição final`}
          loading="lazy"
          decoding="async"
          // As imagens ficam empilhadas e a opacidade alterna: trocar o `src`
          // causaria um piscar branco a cada quadro enquanto a próxima carrega.
          onError={() => setFailed(true)}
          className={cn(
            "absolute inset-0 size-full object-cover transition-opacity duration-300 motion-reduce:transition-none",
            i === frame ? "opacity-100" : "opacity-0",
          )}
        />
      ))}

      {temMultiplas && (
        <span className="absolute bottom-1.5 right-1.5 flex gap-1" aria-hidden>
          {images.map((src, i) => (
            <span
              key={src}
              className={cn(
                "size-1.5 rounded-full transition-colors",
                i === frame ? "bg-white" : "bg-white/40",
              )}
            />
          ))}
        </span>
      )}
    </button>
  );
}
