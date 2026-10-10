import { bmrMifflin, goalCalories, macroTargets, tdee, yearsBetween } from "@forja/domain";

export type ProfileBody = {
  sex: "male" | "female" | "other";
  birthDate: string | null;
  heightCm: number | null;
  activityLevel: "sedentary" | "light" | "moderate" | "active" | "very_active";
  goal: "lose" | "maintain" | "gain";
};

/**
 * Metas diárias a partir dos dados do corpo e do último peso (Mifflin-St Jeor,
 * ajustada pela atividade e pelo objetivo). Sem altura, nascimento ou peso
 * não há conta honesta a fazer: devolve `null`.
 *
 * É a mesma conta para o Perfil (edição dos dados) e para Configurações →
 * Metas nutricionais (prévia) — assim as duas nunca divergem.
 */
export function targetsFor(p: ProfileBody, weightKg: number | null) {
  if (!weightKg || !p.heightCm || !p.birthDate) return null;
  const ageYears = yearsBetween(p.birthDate);
  const bmr = bmrMifflin({ sex: p.sex, weightKg, heightCm: p.heightCm, ageYears });
  const total = tdee(bmr, p.activityLevel);
  const kcal = goalCalories(total, p.goal);
  return { bmr: Math.round(bmr), tdee: Math.round(total), kcal, ...macroTargets(kcal, weightKg) };
}
