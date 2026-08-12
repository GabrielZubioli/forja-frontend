/**
 * Demonstração do exercício.
 *
 * O catálogo tem nomes técnicos ("remada cavalinho", "face pull") que dizem
 * pouco a quem está começando — exatamente o público que mais precisa da
 * referência visual.
 *
 * Quando o exercício tem `video_url` curado, mostramos o vídeo. Quando não tem
 * — o caso de todos os 66 do seed atual —, oferecemos uma busca por vídeo com o
 * nome do exercício. Preferimos isso a embutir conteúdo de terceiros sem
 * licença ou a fingir que existe material curado.
 */
import { ExternalLink, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { videoSearchUrl } from "@/data/exercise-media";

/** Só http(s) vira `href` — o banco valida o mesmo, mas nunca confie num lado só. */
function isSafeUrl(url: string | null | undefined): url is string {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

// A busca por vídeo mora em `exercise-media.ts`, junto do resto da mídia de
// exercício. Havia duas implementações da mesma URL, com termos de busca
// diferentes — o mesmo exercício levava a resultados diferentes conforme a tela
// de onde se clicava.

export function ExerciseDemoButton({
  exerciseName,
  videoUrl,
  className,
  size = "sm",
}: {
  exerciseName: string;
  videoUrl?: string | null;
  className?: string;
  size?: React.ComponentProps<typeof Button>["size"];
}) {
  const curado = isSafeUrl(videoUrl);
  const href = curado ? videoUrl : videoSearchUrl(exerciseName);

  return (
    <Button variant="outline" size={size} asChild className={className}>
      <a
        href={href}
        target="_blank"
        // `noopener` evita que a página aberta acesse `window.opener`.
        rel="noopener noreferrer"
        aria-label={
          curado
            ? `Ver demonstração de ${exerciseName}`
            : `Buscar vídeos de execução de ${exerciseName} (abre em nova aba)`
        }
      >
        {curado ? (
          <PlayCircle className="mr-1.5 size-4" aria-hidden />
        ) : (
          <ExternalLink className="mr-1.5 size-4" aria-hidden />
        )}
        {curado ? "Ver demonstração" : "Buscar execução"}
      </a>
    </Button>
  );
}

/** Player embutido, usado apenas quando há vídeo curado. */
export function ExerciseDemoEmbed({
  exerciseName,
  videoUrl,
  className,
}: {
  exerciseName: string;
  videoUrl?: string | null;
  className?: string;
}) {
  if (!isSafeUrl(videoUrl)) return null;

  const embed = toEmbedUrl(videoUrl);
  if (!embed) {
    // URL válida mas de origem não reconhecida: link em vez de iframe, para não
    // embutir conteúdo arbitrário na página.
    return (
      <ExerciseDemoButton exerciseName={exerciseName} videoUrl={videoUrl} className={className} />
    );
  }

  return (
    <div
      className={cn(
        "aspect-video w-full overflow-hidden rounded-lg border border-border",
        className,
      )}
    >
      <iframe
        src={embed}
        title={`Demonstração: ${exerciseName}`}
        className="size-full"
        loading="lazy"
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}

/**
 * Converte URLs conhecidas em endereço de embed.
 *
 * Lista restrita de propósito: só embutimos origens em que confiamos.
 */
function toEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");

    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = parsed.searchParams.get("v");
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (host === "youtu.be") {
      const id = parsed.pathname.slice(1);
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (host === "vimeo.com") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
    return null;
  } catch {
    return null;
  }
}
