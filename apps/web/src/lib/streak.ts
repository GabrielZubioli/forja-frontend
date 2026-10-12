import { addDays, format } from "date-fns";

/**
 * Dias seguidos de treino.
 *
 * Conta os dias treinados voltando de hoje para trás. Dia de descanso do
 * plano não quebra a sequência (nem soma); dia de treino previsto que passou
 * sem treino quebra. Hoje ainda em aberto não quebra — o dia não acabou.
 */
export function diasSeguidos(
  treinou: ReadonlySet<string>,
  diaDeTreino: (weekday: number) => boolean,
  hoje: string,
  limite = 370,
): number {
  let dias = 0;
  let d = new Date(`${hoje}T12:00:00`);
  for (let i = 0; i < limite; i++, d = addDays(d, -1)) {
    const iso = format(d, "yyyy-MM-dd");
    if (treinou.has(iso)) dias++;
    else if (iso !== hoje && diaDeTreino(d.getDay())) break;
  }
  return dias;
}
