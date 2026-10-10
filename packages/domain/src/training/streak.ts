import { addUtcDays } from "../shared/dates";
import { weekdayOf } from "./schedule";

/**
 * Sequência de semanas batendo a meta de treinos.
 *
 * Contada em **semanas**, não em dias: num plano de 3x/semana o descanso faz
 * parte do plano, e uma ofensiva diária quebraria toda terça. A semana atual só
 * entra na conta quando a meta já foi batida — até domingo ela ainda está em
 * aberto, então não zera a sequência.
 *
 * `workoutDays` são chaves `YYYY-MM-DD` no fuso do usuário, uma por treino
 * concluído (dois treinos no mesmo dia contam dois). Semana começa na segunda.
 */
export function weeklyStreak(
  workoutDays: readonly string[],
  weeklyGoal: number,
  today: string,
): number {
  if (weeklyGoal < 1) return 0;

  const porSemana = new Map<string, number>();
  for (const day of workoutDays) {
    const semana = weekStart(day);
    porSemana.set(semana, (porSemana.get(semana) ?? 0) + 1);
  }
  const bateu = (semana: string) => (porSemana.get(semana) ?? 0) >= weeklyGoal;

  const atual = weekStart(today);
  let streak = bateu(atual) ? 1 : 0;
  for (let semana = addUtcDays(atual, -7); bateu(semana); semana = addUtcDays(semana, -7)) {
    streak++;
  }
  return streak;
}

/** Segunda-feira da semana de `day`. */
export function weekStart(day: string): string {
  return addUtcDays(day, -((weekdayOf(day) + 6) % 7));
}
