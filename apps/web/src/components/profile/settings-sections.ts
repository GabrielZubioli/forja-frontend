import { Dumbbell, HeartPulse, Palette, ShieldCheck, Target, Utensils } from "lucide-react";

/**
 * As seções de Configurações — cada uma é uma opção do Menu e abre sozinha
 * em `/settings?secao=…`.
 */
export const SETTINGS_SECTIONS = [
  { key: "metas", title: "Metas nutricionais", icon: Target },
  { key: "treino", title: "Treino", icon: Dumbbell },
  { key: "alimentacao", title: "Alimentação", icon: Utensils },
  { key: "saude", title: "Saúde", icon: HeartPulse },
  { key: "aparencia", title: "Aparência", icon: Palette },
  { key: "conta", title: "Dados e conta", icon: ShieldCheck },
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]["key"];

export function isSettingsSection(v: unknown): v is SettingsSection {
  return SETTINGS_SECTIONS.some((s) => s.key === v);
}
