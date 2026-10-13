import { assessEnergy, yearsBetween } from "@forja/domain";

export type ProfileBody = {
  sex: "male" | "female" | "other";
  birthDate: string | null;
  heightCm: number | null;
  activityLevel: "sedentary" | "light" | "moderate" | "active" | "very_active";
  goal: "lose" | "maintain" | "gain";
};

/**
 * Metas diárias a partir dos dados do corpo e do último peso — a mesma
 * `assessEnergy` da geração do cardápio, com os mesmos limites de segurança.
 * Sem altura, nascimento ou peso, ou com o perfil fora do escopo automático,
 * não há conta honesta a fazer: devolve `null`.
 *
 * É a mesma conta para o Perfil (edição dos dados) e para Configurações →
 * Metas nutricionais (prévia) — assim as duas nunca divergem.
 */
export function targetsFor(p: ProfileBody, weightKg: number | null) {
  if (!weightKg || !p.heightCm || !p.birthDate) return null;
  const r = assessEnergy({
    sex: p.sex,
    weightKg,
    heightCm: p.heightCm,
    ageYears: yearsBetween(p.birthDate),
    activity: p.activityLevel,
    goal: p.goal,
  });
  if (!r.ok) return null;
  return { bmr: r.bmr, tdee: r.estimatedTdee, kcal: r.kcal, ...r.macros };
}
