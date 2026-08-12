import { Monitor, Moon, Sun } from "lucide-react";

import { useTheme, type Theme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

const OPTIONS: { value: Theme; label: string; hint: string; icon: typeof Sun }[] = [
  { value: "light", label: "Claro", hint: "Para ambientes iluminados", icon: Sun },
  { value: "dark", label: "Escuro", hint: "Para a academia à noite", icon: Moon },
  { value: "system", label: "Sistema", hint: "Acompanha o aparelho", icon: Monitor },
];

/**
 * Escolha de tema.
 *
 * ## Por que aqui e não só no botão do topo
 *
 * O ícone na barra continua existindo — é o atalho de quem já sabe o que quer.
 * Mas ele não mostra **qual** tema está ativo nem que "sistema" é uma opção:
 * quem nunca abriu o menu não sabe que a escolha existe. Aqui as três opções
 * ficam visíveis ao mesmo tempo, com a atual marcada.
 *
 * ## A pré-visualização
 *
 * Cada opção carrega uma miniatura da interface naquele tema, pintada com as
 * cores literais dos tokens. Ver a diferença antes de aplicar evita o
 * vai-e-volta de trocar só para descobrir como ficou — e o cartão "sistema"
 * mostra os dois lados, que é exatamente o que "sistema" significa.
 */
export function AppearanceSection() {
  const { theme, setTheme } = useTheme();

  return (
    <div role="radiogroup" aria-label="Tema" className="grid gap-3 sm:grid-cols-3">
      {OPTIONS.map((option) => {
        const active = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(option.value)}
            className={cn(
              "press-feedback rounded-lg border p-3 text-left cursor-pointer",
              active
                ? "border-primary bg-primary-soft/40"
                : "border-border bg-card hover:border-primary/40",
            )}
          >
            <ThemePreview theme={option.value} />

            <div className="mt-3 flex items-center gap-2">
              <option.icon
                className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")}
                aria-hidden
              />
              <span className="text-sm font-medium">{option.label}</span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{option.hint}</p>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Miniatura de uma tela.
 *
 * As cores são literais e não tokens de propósito: o cartão do tema claro
 * precisa ficar claro **enquanto o app está no escuro**, o que é justamente o
 * que uma variável de tema não permite. Os valores espelham `--background`,
 * `--card`, `--primary` e `--muted-foreground` de cada bloco em `styles.css`.
 */
function ThemePreview({ theme }: { theme: Theme }) {
  if (theme === "system") {
    return (
      <div className="flex h-16 overflow-hidden rounded-md border border-border">
        <div className="w-1/2 border-r border-border">
          <MiniScreen background="#f6faf8" card="#ffffff" primary="#0c8259" muted="#d8dfdc" />
        </div>
        <div className="w-1/2">
          <MiniScreen background="#070d0b" card="#131c19" primary="#3ad598" muted="#293430" />
        </div>
      </div>
    );
  }

  const cores =
    theme === "light"
      ? { background: "#f6faf8", card: "#ffffff", primary: "#0c8259", muted: "#d8dfdc" }
      : { background: "#070d0b", card: "#131c19", primary: "#3ad598", muted: "#293430" };

  return (
    <div className="h-16 overflow-hidden rounded-md border border-border">
      <MiniScreen {...cores} />
    </div>
  );
}

function MiniScreen({
  background,
  card,
  primary,
  muted,
}: {
  background: string;
  card: string;
  primary: string;
  muted: string;
}) {
  return (
    <div className="size-full p-1.5" style={{ background }} aria-hidden>
      <div className="h-full rounded-sm p-1.5" style={{ background: card }}>
        <div className="h-1.5 w-2/3 rounded-full" style={{ background: primary }} />
        <div className="mt-1.5 h-1 w-full rounded-full" style={{ background: muted }} />
        <div className="mt-1 h-1 w-4/5 rounded-full" style={{ background: muted }} />
      </div>
    </div>
  );
}
