import { useEffect } from "react";

/**
 * Teclado do celular sem cobrir os modais.
 *
 * Grava em `--teclado` quanto da tela o teclado ocupa (no iPhone o visor
 * encolhe sem a página saber; no Android o `interactive-widget` da meta
 * viewport já redimensiona a página e isto dá zero). Os diálogos usam a
 * variável para subir e encolher. E o campo focado dentro de um diálogo rola
 * para o meio do que sobrou visível.
 */
export function KeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    const raiz = document.documentElement;
    const medir = () => {
      const teclado = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
      raiz.style.setProperty("--teclado", `${Math.round(teclado)}px`);
    };
    const focou = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el?.matches("input, textarea, select") || !el.closest("[role=dialog], [role=alertdialog]")) return;
      // Espera o teclado terminar de abrir antes de centralizar o campo.
      window.setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
    };
    medir();
    vv?.addEventListener("resize", medir);
    vv?.addEventListener("scroll", medir);
    document.addEventListener("focusin", focou);
    return () => {
      vv?.removeEventListener("resize", medir);
      vv?.removeEventListener("scroll", medir);
      document.removeEventListener("focusin", focou);
    };
  }, []);
  return null;
}
