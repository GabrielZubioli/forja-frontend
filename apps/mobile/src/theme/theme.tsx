import { colorScheme } from "nativewind";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import * as SecureStore from "expo-secure-store";

/**
 * Tema do app: segue o sistema por padrão, com override manual persistido.
 * Aplica a preferência via NativeWind (`colorScheme.set`), que alterna a
 * classe `dark` usada pelos tokens em global.css.
 */
export type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "forja.theme-mode";

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: "system",
  setMode: () => undefined,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    void SecureStore.getItemAsync(STORAGE_KEY).then((saved) => {
      if (saved === "light" || saved === "dark" || saved === "system") {
        setModeState(saved);
        colorScheme.set(saved);
      }
    });
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    colorScheme.set(next);
    void SecureStore.setItemAsync(STORAGE_KEY, next);
  }, []);

  return <ThemeContext.Provider value={{ mode, setMode }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
