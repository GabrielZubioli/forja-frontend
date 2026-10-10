import { cn } from "@/lib/utils";

/**
 * A marca Habitual Fit. Os arquivos vêm de `brand/` (vetorizados da arte
 * original) e ficam em `public/brand/`.
 */

/** O símbolo — o "H" com a pessoa —, sem o nome. */
export function BrandSymbol({ className }: { className?: string }) {
  return (
    <img
      src="/brand/habitual-fit-simbolo.svg"
      alt=""
      aria-hidden
      width={424}
      height={368}
      className={cn("h-auto shrink-0", className)}
    />
  );
}

/** Símbolo + nome. O nome é escuro no tema claro e branco no escuro. */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <span role="img" aria-label="Habitual Fit" className={cn("inline-flex shrink-0", className)}>
      <img
        src="/brand/habitual-fit-logo-horizontal-clara-ui.svg"
        alt=""
        className="h-full w-auto dark:hidden"
      />
      <img
        src="/brand/habitual-fit-logo-horizontal-escura-ui.svg"
        alt=""
        className="hidden h-full w-auto dark:block"
      />
    </span>
  );
}
