import { useRef, type TouchEvent } from "react";
import type { ParsedLocation } from "@tanstack/react-router";

/**
 * As telas da barra inferior, na ordem em que aparecem. Arrastar para o lado
 * leva à vizinha; tocar na barra também desliza na direção certa.
 */
export const ABAS = ["/dashboard", "/plan", "/train", "/diet"] as const;

/** Posição na barra; o treino em andamento ocupa o lugar do Treinar. */
const indice = (path: string) =>
  path.startsWith("/workouts/session/") ? 2 : ABAS.indexOf(path as (typeof ABAS)[number]);

/**
 * Tipo da transição entre duas telas (para a View Transitions API): desliza
 * para a esquerda indo "para frente" na barra, para a direita voltando. Fora
 * das abas, `false` — sem transição.
 */
export function slideTypes({
  fromLocation,
  toLocation,
}: {
  fromLocation?: ParsedLocation;
  toLocation: ParsedLocation;
}): string[] | false {
  const de = fromLocation ? indice(fromLocation.pathname) : -1;
  const para = indice(toLocation.pathname);
  if (de < 0 || para < 0 || de === para) return false;
  return [para > de ? "slide-esquerda" : "slide-direita"];
}

/** O toque começou num lugar que já usa o gesto lateral (carrossel, campo, slider)? */
function gestoOcupado(alvo: EventTarget | null, limite: Element): boolean {
  let el = alvo instanceof Element ? alvo : null;
  while (el && el !== limite) {
    if (el.closest("input, textarea, select, [role=slider], [data-no-swipe]")) return true;
    const estilo = getComputedStyle(el);
    if (
      el.scrollWidth > el.clientWidth + 2 &&
      (estilo.overflowX === "auto" || estilo.overflowX === "scroll")
    ) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

/**
 * Arrastar o dedo para o lado troca de aba. Só conta como gesto um movimento
 * claramente horizontal (70 px, mais lateral que vertical, em menos de 0,6 s),
 * para não atrapalhar a rolagem nem os carrosséis da tela.
 */
export function useSwipeNav(pathname: string, ir: (to: string) => void) {
  const inicio = useRef<{ x: number; y: number; t: number } | null>(null);

  return {
    onTouchStart: (e: TouchEvent<HTMLElement>) => {
      const toque = e.touches[0];
      // Durante o tutorial, deslizar não troca de tela: o tour guia a navegação.
      inicio.current =
        e.touches.length === 1 &&
        toque &&
        !document.body.hasAttribute("data-tutorial") &&
        !gestoOcupado(e.target, e.currentTarget)
          ? { x: toque.clientX, y: toque.clientY, t: Date.now() }
          : null;
    },
    onTouchEnd: (e: TouchEvent<HTMLElement>) => {
      const i = inicio.current;
      inicio.current = null;
      const toque = e.changedTouches[0];
      if (!i || !toque) return;
      const dx = toque.clientX - i.x;
      const dy = toque.clientY - i.y;
      if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5 || Date.now() - i.t > 600) return;
      const atual = indice(pathname);
      if (atual < 0) return;
      const vizinha = ABAS[atual + (dx < 0 ? 1 : -1)];
      if (vizinha) ir(vizinha);
    },
  };
}
