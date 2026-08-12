/**
 * Tema claro / escuro / sistema.
 *
 * O `styles.css` já definia a paleta `.dark` inteira — mas **nada no app
 * adicionava a classe `dark`**, então o trabalho estava pronto e inalcançável.
 * Este provider aplica a classe na raiz do documento e persiste a escolha.
 *
 * A opção "sistema" acompanha `prefers-color-scheme` em tempo real, sem exigir
 * recarregamento.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "forja:theme";

/**
 * Duração da transição entre temas.
 *
 * Precisa acompanhar `--duration-slow` do `styles.css`: é o tempo que a classe
 * `.theme-transition` fica no documento, e removê-la antes do fim cortaria a
 * animação no meio.
 */
const THEME_FADE_MS = 280;

type ThemeContextValue = {
  theme: Theme;
  /** Tema efetivamente aplicado (resolve "system"). */
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Começa em "system" no servidor para o HTML do SSR bater com a primeira
  // renderização do cliente; o valor real é lido logo depois da hidratação.
  // Escuro por padrão: a tela é olhada na academia, muitas vezes no escuro.
  const [theme, setThemeState] = useState<Theme>("dark");
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    setThemeState(readStoredTheme());
    setSystemDark(systemPrefersDark());

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const resolvedTheme: "light" | "dark" =
    theme === "system" ? (systemDark ? "dark" : "light") : theme;

  /**
   * Aplica o tema — com transição, e só quando ela faz sentido.
   *
   * A classe `.theme-transition` (definida em `styles.css`) faz cor de fundo,
   * texto, borda e sombra atravessarem a mudança em vez de saltarem. Ela é
   * adicionada imediatamente antes da troca e removida ao fim, porque mantê-la
   * sempre ligada faria **toda** navegação arrastar as cores: um `Link` que
   * muda de fundo passaria a levar 280 ms para reagir.
   *
   * Duas guardas importam:
   *
   * - **A primeira aplicação não anima.** Na montagem, o tema lido do storage
   *   é o mesmo que o script inline já pintou; animar aqui produziria um
   *   clarão do escuro para o escuro sem nenhum motivo.
   * - **`prefers-reduced-motion` desliga tudo.** O CSS global já zera a
   *   duração, mas nem adicionar a classe faz sentido nesse caso.
   */
  const primeiraAplicacao = useRef(true);

  useEffect(() => {
    const root = document.documentElement;
    const aplicar = () => {
      root.classList.toggle("dark", resolvedTheme === "dark");
      root.style.colorScheme = resolvedTheme;
    };

    const semMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (primeiraAplicacao.current || semMovimento) {
      primeiraAplicacao.current = false;
      aplicar();
      return;
    }

    root.classList.add("theme-transition");
    aplicar();

    // `setTimeout` e não `transitionend`: o evento dispara uma vez por
    // propriedade e por elemento — centenas de disparos, e nenhum deles
    // garantidamente o último.
    const fim = window.setTimeout(() => root.classList.remove("theme-transition"), THEME_FADE_MS);
    return () => {
      window.clearTimeout(fim);
      root.classList.remove("theme-transition");
    };
  }, [resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Modo privado / storage bloqueado: o tema vale só para esta sessão.
    }
  }, []);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme precisa estar dentro de <ThemeProvider>.");
  return context;
}

/**
 * Script inline aplicado antes da primeira pintura.
 *
 * Sem ele, um usuário com tema escuro veria um flash branco em cada
 * carregamento, porque a classe só seria adicionada após a hidratação.
 */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
    var dark = stored !== 'light' &&
      (stored === 'dark' || !stored || window.matchMedia('(prefers-color-scheme: dark)').matches || stored === 'system');
    if (dark) document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {}
})();
`.trim();
