import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Palavras de uma busca, cada uma exigida no nome em qualquer ordem: "carne
 * bovina" acha "Carne, bovina, …". Tira o que quebraria o filtro do PostgREST.
 */
export function searchWords(term: string): string[] {
  return term
    .toLowerCase()
    .split(/[\s,]+/)
    .map((w) => w.replace(/[%_().*\\"]/g, ""))
    .filter(Boolean)
    .slice(0, 6);
}
