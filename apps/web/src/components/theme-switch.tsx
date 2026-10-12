import { Moon, Sun } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

/**
 * Modo escuro como um interruptor: ligado = escuro, desligado = claro.
 *
 * Substitui a tela de Aparência (claro / escuro / sistema): na prática a
 * pessoa só quer alternar, e um interruptor responde no mesmo toque.
 */
export function ThemeSwitch({ className, compacto = false }: { className?: string; compacto?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const escuro = resolvedTheme === "dark";
  const id = compacto ? "tema-compacto" : "tema";

  return (
    <label
      htmlFor={id}
      className={cn("flex cursor-pointer items-center gap-3", className)}
    >
      {!compacto && (
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl transition-colors",
            escuro ? "bg-primary/15 text-primary" : "bg-warning/15 text-warning",
          )}
          aria-hidden
        >
          {escuro ? <Moon className="size-5" /> : <Sun className="size-5" />}
        </span>
      )}
      {!compacto && <span className="flex-1 font-medium">Modo escuro</span>}
      {compacto && (escuro ? <Moon className="size-4" aria-hidden /> : <Sun className="size-4" aria-hidden />)}
      <Switch
        id={id}
        checked={escuro}
        onCheckedChange={(v) => setTheme(v ? "dark" : "light")}
        aria-label="Modo escuro"
      />
    </label>
  );
}
