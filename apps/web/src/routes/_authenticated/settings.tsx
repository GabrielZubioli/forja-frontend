import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/data/query-keys";
import { assertOk, errorMessage, num, unwrapMaybe } from "@/data/supabase-helpers";
import { PageBody, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/date-picker";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ChipGroup, ChipRadio } from "@/components/ui/chip-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorState } from "@/components/query-boundary";
import { AdaptiveGoalsCard } from "@/components/adaptive-goals-card";
import { ExportDataCard } from "@/components/export-data-card";
import { DeleteAccountCard } from "@/components/delete-account-card";
import { ImportDataCard } from "@/components/import-data-card";
import {
  SETTINGS_SECTIONS,
  isSettingsSection,
  type SettingsSection,
} from "@/components/profile/settings-sections";
import { ProfileSection } from "@/components/profile/profile-section";
import { AppearanceSection } from "@/components/profile/appearance-section";
import { Dumbbell, HeartPulse, Info, LogOut, Palette, Target, User, Utensils } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { bmrMifflin, tdee, goalCalories, macroTargets, yearsBetween } from "@forja/domain";
import {
  DURATION_OPTIONS,
  EQUIPMENT_OPTIONS,
  EXPERIENCE_OPTIONS,
  FOCUS_OPTIONS,
  INJURY_OPTIONS,
  MEALS_PER_DAY_OPTIONS,
  PLACE_OPTIONS,
} from "@/lib/onboarding/options";
import { ACTIVITY_HINTS, ACTIVITY_LABELS, GOAL_LABELS, SEX_LABELS, label } from "@/lib/labels";
import { todayISO } from "@/lib/date";

/**
 * Configurações: dados, metas e preferências.
 *
 * Cada seção é uma opção do Menu e abre sozinha (`?secao=treino`). Sem
 * `secao`, a tela mostra todas — é o que o link da barra lateral abre.
 */
export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Configurações — Habitual Fit" },
      { name: "description", content: "Ajuste dados corporais, objetivos e metas de calorias." },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { secao?: SettingsSection } => ({
    secao: isSettingsSection(search.secao) ? search.secao : undefined,
  }),
  component: SettingsPage,
});

/**
 * Validação do formulário de perfil.
 *
 * Antes, qualquer valor era gravado direto: uma altura de `9999` cm ou uma data
 * de nascimento no futuro produziam metas calóricas absurdas sem qualquer aviso.
 */
const profileSchema = z.object({
  display_name: z.string().trim().max(80, "Nome muito longo (máx. 80 caracteres).").optional(),
  sex: z.enum(["male", "female", "other"]),
  birth_date: z
    .string()
    .refine((v) => v === "" || !Number.isNaN(Date.parse(v)), "Data inválida.")
    .refine((v) => v === "" || v <= todayISO(), "A data de nascimento não pode estar no futuro.")
    .refine((v) => {
      if (v === "") return true;
      const age = yearsBetween(v);
      return age >= 10 && age <= 120;
    }, "Informe uma data compatível com idade entre 10 e 120 anos."),
  height_cm: z
    .string()
    .refine(
      (v) => v === "" || (Number(v) >= 100 && Number(v) <= 250),
      "Altura esperada entre 100 e 250 cm.",
    ),
  goal_weight_kg: z
    .string()
    .refine(
      (v) => v === "" || (Number(v) >= 30 && Number(v) <= 300),
      "Peso-alvo esperado entre 30 e 300 kg.",
    ),
  activity_level: z.enum(["sedentary", "light", "moderate", "active", "very_active"]),
  goal: z.enum(["lose", "maintain", "gain"]),
});

type ProfileForm = z.infer<typeof profileSchema>;

const EMPTY_FORM: ProfileForm = {
  display_name: "",
  sex: "male",
  birth_date: "",
  height_cm: "",
  goal_weight_kg: "",
  activity_level: "moderate",
  goal: "maintain",
};

/**
 * Preferências que não entram no cálculo de metas.
 *
 * Ficam num estado separado do formulário de dados corporais porque salvam
 * separado: mudar "treino 4× por semana" não deveria exigir que a altura esteja
 * preenchida e válida, que é o que aconteceria num formulário único.
 */
type PreferencesForm = {
  experience_level: string | null;
  days_per_week: number | null;
  session_duration: string | null;
  training_place: string | null;
  focus_area: string | null;
  equipment_available: string[];
  meals_per_day: number | null;
  water_ml_target: number | null;
  injuries: string[];
};

const EMPTY_PREFERENCES: PreferencesForm = {
  experience_level: null,
  days_per_week: null,
  session_duration: null,
  training_place: null,
  focus_area: null,
  equipment_available: [],
  meals_per_day: null,
  water_ml_target: null,
  injuries: [],
};

const DAYS_PER_WEEK_OPTIONS = [2, 3, 4, 5, 6] as const;

function SettingsPage() {
  const { secao } = Route.useSearch();
  const mostra = (k: SettingsSection) => !secao || secao === k;
  const titulo = SETTINGS_SECTIONS.find((s) => s.key === secao)?.title ?? "Configurações";
  const qc = useQueryClient();
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
  const [prefs, setPrefs] = useState<PreferencesForm>(EMPTY_PREFERENCES);
  const [touched, setTouched] = useState(false);
  const [prefsTouched, setPrefsTouched] = useState(false);

  const profile = useQuery({
    queryKey: queryKeys.profile(),
    queryFn: async () =>
      unwrapMaybe("carregar perfil", await supabase.from("profiles").select("*").maybeSingle()),
  });

  const latestWeight = useQuery({
    queryKey: queryKeys.body.latestWeight(),
    queryFn: async () => {
      const row = unwrapMaybe(
        "buscar último peso",
        await supabase
          .from("body_weights")
          .select("weight_kg")
          .order("log_date", { ascending: false })
          .limit(1)
          .maybeSingle(),
      );
      return row ? num(row.weight_kg) : null;
    },
  });

  const profileId = profile.data?.id;
  useEffect(() => {
    if (!profile.data) return;
    const p = profile.data;
    setForm({
      display_name: p.display_name ?? "",
      sex: (p.sex ?? "male") as ProfileForm["sex"],
      birth_date: p.birth_date ?? "",
      height_cm: p.height_cm?.toString() ?? "",
      goal_weight_kg: p.goal_weight_kg?.toString() ?? "",
      activity_level: (p.activity_level ?? "moderate") as ProfileForm["activity_level"],
      goal: (p.goal ?? "maintain") as ProfileForm["goal"],
    });
    setPrefs({
      experience_level: p.experience_level ?? null,
      days_per_week: p.days_per_week ?? null,
      session_duration: p.session_duration ?? null,
      training_place: p.training_place ?? null,
      focus_area: p.focus_area ?? null,
      equipment_available: p.equipment_available ?? [],
      meals_per_day: p.meals_per_day ?? null,
      water_ml_target: p.water_ml_target ?? null,
      injuries: p.injuries ?? [],
    });
    setTouched(false);
    setPrefsTouched(false);
    // Só reidrata quando muda o registro carregado, não a cada refetch — senão
    // uma revalidação em background descartaria o que o usuário está digitando.
  }, [profileId]); // eslint-disable-line react-hooks/exhaustive-deps

  const validation = profileSchema.safeParse(form);
  const fieldErrors = validation.success ? {} : validation.error.flatten().fieldErrors;

  const weightKg = latestWeight.data ?? 0;

  const preview = useMemo(() => {
    const heightCm = Number(form.height_cm || 0);
    if (!weightKg || !heightCm || !form.birth_date || !validation.success) return null;
    const ageYears = yearsBetween(form.birth_date);
    const bmr = bmrMifflin({ sex: form.sex, weightKg, heightCm, ageYears });
    const total = tdee(bmr, form.activity_level);
    const kcal = goalCalories(total, form.goal);
    return { bmr: Math.round(bmr), tdee: Math.round(total), kcal, ...macroTargets(kcal, weightKg) };
  }, [form, weightKg, validation.success]);

  const save = useMutation({
    mutationFn: async () => {
      if (!validation.success) throw new Error("Corrija os campos destacados antes de salvar.");
      if (!profileId) throw new Error("Perfil ainda não carregado.");

      assertOk(
        "salvar perfil",
        await supabase
          .from("profiles")
          .update({
            display_name: form.display_name?.trim() || null,
            sex: form.sex,
            birth_date: form.birth_date || null,
            height_cm: form.height_cm ? Number(form.height_cm) : null,
            goal_weight_kg: form.goal_weight_kg ? Number(form.goal_weight_kg) : null,
            activity_level: form.activity_level,
            goal: form.goal,
            onboarding_completed: true,
            daily_kcal_target: preview?.kcal ?? null,
            protein_g_target: preview?.protein_g ?? null,
            carbs_g_target: preview?.carbs_g ?? null,
            fat_g_target: preview?.fat_g ?? null,
            fiber_g_target: preview?.fiber_g ?? null,
          })
          .eq("id", profileId),
      );
    },
    onSuccess: () => {
      toast.success(preview ? "Perfil e metas salvos" : "Perfil salvo");
      setTouched(false);
      void qc.invalidateQueries({ queryKey: queryKeys.profile() });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const savePreferences = useMutation({
    mutationFn: async () => {
      if (!profileId) throw new Error("Perfil ainda não carregado.");
      assertOk(
        "salvar preferências",
        await supabase
          .from("profiles")
          .update({
            experience_level: prefs.experience_level,
            days_per_week: prefs.days_per_week,
            session_duration: prefs.session_duration,
            training_place: prefs.training_place,
            focus_area: prefs.focus_area,
            equipment_available: prefs.equipment_available,
            meals_per_day: prefs.meals_per_day,
            water_ml_target: prefs.water_ml_target,
            injuries: prefs.injuries,
          })
          .eq("id", profileId),
      );
    },
    onSuccess: () => {
      toast.success("Preferências salvas", {
        description: "Valem para os próximos planos gerados.",
      });
      setPrefsTouched(false);
      void qc.invalidateQueries({ queryKey: queryKeys.profile() });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  /**
   * Aplica a meta calórica estimada pelo filtro de Kalman.
   *
   * Grava só as metas — os dados corporais do formulário ficam intocados, para
   * não sobrescrever uma edição em andamento com o valor carregado do servidor.
   */
  const applyAdaptive = useMutation({
    mutationFn: async (kcal: number) => {
      if (!profileId) throw new Error("Perfil ainda não carregado.");
      const macros = macroTargets(kcal, weightKg);
      assertOk(
        "aplicar meta adaptativa",
        await supabase
          .from("profiles")
          .update({
            daily_kcal_target: kcal,
            protein_g_target: macros.protein_g,
            carbs_g_target: macros.carbs_g,
            fat_g_target: macros.fat_g,
            fiber_g_target: macros.fiber_g,
          })
          .eq("id", profileId),
      );
    },
    onSuccess: () => {
      toast.success("Meta atualizada", {
        description: "O diário e o dashboard já refletem a nova meta.",
      });
      void qc.invalidateQueries({ queryKey: queryKeys.profile() });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const update = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setTouched(true);
  };

  const updatePref = <K extends keyof PreferencesForm>(key: K, value: PreferencesForm[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    setPrefsTouched(true);
  };

  if (profile.isError) {
    return (
      <>
        <PageHeader title={titulo} />
        <PageBody>
          <ErrorState message={errorMessage(profile.error)} onRetry={profile.refetch} />
        </PageBody>
      </>
    );
  }

  const carregando = profile.isPending;

  return (
    <>
      <PageHeader title={titulo} />
      <PageBody>
        {/* `key`: trocar de seção pelo Menu remonta a tela, para a seção abrir já aberta. */}
        <div key={secao ?? "todas"} className="space-y-3">
          {carregando ? (
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[4.5rem] w-full rounded-xl" />
              ))}
            </div>
          ) : (
            <>
              {mostra("dados") && (
                <ProfileSection
                  defaultOpen={!secao || secao === "dados"}
                  icon={<User />}
                  title="Dados pessoais"
                  description="Entram no cálculo de TMB, gasto diário e macros."
                  summary={[
                    form.display_name || null,
                    form.height_cm ? `${form.height_cm} cm` : null,
                    label(SEX_LABELS, form.sex),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                >
                  <div className="space-y-3">
                    <Field label="Nome" htmlFor="p-name" error={fieldErrors.display_name?.[0]}>
                      <Input
                        id="p-name"
                        value={form.display_name ?? ""}
                        onChange={(e) => update("display_name", e.target.value)}
                        autoComplete="name"
                      />
                    </Field>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Sexo" htmlFor="p-sex">
                        <Select
                          value={form.sex}
                          onValueChange={(v) => update("sex", v as ProfileForm["sex"])}
                        >
                          <SelectTrigger id="p-sex">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(SEX_LABELS).map(([value, text]) => (
                              <SelectItem key={value} value={value}>
                                {text}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>

                      <Field
                        label="Data de nascimento"
                        htmlFor="p-birth"
                        error={fieldErrors.birth_date?.[0]}
                      >
                        <DatePicker
                          id="p-birth"
                          years
                          max={todayISO()}
                          value={form.birth_date}
                          onChange={(v) => update("birth_date", v)}
                          aria-invalid={Boolean(fieldErrors.birth_date)}
                        />
                      </Field>

                      <Field
                        label="Altura (cm)"
                        htmlFor="p-height"
                        error={fieldErrors.height_cm?.[0]}
                      >
                        <Input
                          id="p-height"
                          type="number"
                          inputMode="numeric"
                          min={100}
                          max={250}
                          value={form.height_cm}
                          onChange={(e) => update("height_cm", e.target.value)}
                          aria-invalid={Boolean(fieldErrors.height_cm)}
                        />
                      </Field>

                      <Field
                        label="Peso-alvo (kg)"
                        htmlFor="p-goal-weight"
                        hint="Aparece como meta no topo do perfil."
                        error={fieldErrors.goal_weight_kg?.[0]}
                      >
                        <Input
                          id="p-goal-weight"
                          type="number"
                          step="0.1"
                          inputMode="decimal"
                          min={30}
                          max={300}
                          value={form.goal_weight_kg}
                          onChange={(e) => update("goal_weight_kg", e.target.value)}
                          aria-invalid={Boolean(fieldErrors.goal_weight_kg)}
                        />
                      </Field>
                    </div>

                    <Field
                      label="Nível de atividade"
                      htmlFor="p-activity"
                      hint={ACTIVITY_HINTS[form.activity_level]}
                    >
                      <Select
                        value={form.activity_level}
                        onValueChange={(v) =>
                          update("activity_level", v as ProfileForm["activity_level"])
                        }
                      >
                        <SelectTrigger id="p-activity">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(ACTIVITY_LABELS).map(([value, text]) => (
                            <SelectItem key={value} value={value}>
                              {text}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field label="Objetivo" htmlFor="p-goal">
                      <Select
                        value={form.goal}
                        onValueChange={(v) => update("goal", v as ProfileForm["goal"])}
                      >
                        <SelectTrigger id="p-goal">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(GOAL_LABELS).map(([value, text]) => (
                            <SelectItem key={value} value={value}>
                              {text}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>

                    <Button
                      className="w-full"
                      onClick={() => save.mutate()}
                      loading={save.isPending}
                      loadingLabel="Salvando perfil"
                      disabled={!touched || !validation.success}
                    >
                      Salvar dados
                    </Button>
                  </div>
                </ProfileSection>
              )}

              {mostra("metas") && (
                <ProfileSection
                  defaultOpen={secao === "metas"}
                  icon={<Target />}
                  title="Metas nutricionais"
                  description="Calculadas a partir dos seus dados e do objetivo."
                  summary={
                    profile.data?.daily_kcal_target
                      ? `${Math.round(num(profile.data.daily_kcal_target))} kcal por dia`
                      : "Ainda não calculadas"
                  }
                >
                  <div className="space-y-4">
                    {latestWeight.isPending ? (
                      <div className="grid grid-cols-2 gap-3">
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                          <Skeleton key={i} className="h-16 w-full rounded-lg" />
                        ))}
                      </div>
                    ) : !preview ? (
                      <MissingDataNotice
                        hasWeight={Boolean(weightKg)}
                        hasHeight={Boolean(form.height_cm)}
                        hasBirthDate={Boolean(form.birth_date)}
                      />
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                          <Stat label="TMB (Mifflin)" value={`${preview.bmr} kcal`} />
                          <Stat label="Gasto diário" value={`${preview.tdee} kcal`} />
                          <Stat label="Meta calórica" value={`${preview.kcal} kcal`} highlight />
                          <Stat label="Proteína" value={`${preview.protein_g} g`} />
                          <Stat label="Carboidrato" value={`${preview.carbs_g} g`} />
                          <Stat label="Gordura" value={`${preview.fat_g} g`} />
                          <Stat label="Fibra" value={`${preview.fiber_g} g`} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Calculado com seu último peso registrado ({weightKg} kg) pela equação de
                          Mifflin-St Jeor, ajustada pelo nível de atividade e pelo objetivo.
                        </p>
                      </>
                    )}

                    <p className="flex gap-2 rounded-lg border border-info/25 bg-info-soft/50 p-3 text-xs text-muted-foreground">
                      <Info className="mt-px size-4 shrink-0 text-info" aria-hidden />
                      <span>
                        Esta é a estimativa por <b>fórmula</b>, que depende do nível de atividade
                        que você declarou. Abaixo, a estimativa a partir dos seus dados reais —
                        registre o peso em{" "}
                        <Link
                          to="/body"
                          className="text-primary underline-offset-2 hover:underline"
                        >
                          Progresso
                        </Link>{" "}
                        e o que come em{" "}
                        <Link
                          to="/diet"
                          className="text-primary underline-offset-2 hover:underline"
                        >
                          Dieta
                        </Link>{" "}
                        para destravá-la.
                      </span>
                    </p>

                    <AdaptiveGoalsCard
                      goal={form.goal}
                      fallbackTdee={preview?.tdee ?? 0}
                      currentKcalTarget={num(profile.data?.daily_kcal_target)}
                      onApply={(kcal) => applyAdaptive.mutate(kcal)}
                      isApplying={applyAdaptive.isPending}
                    />
                  </div>
                </ProfileSection>
              )}

              {mostra("treino") && (
                <ProfileSection
                  defaultOpen={secao === "treino"}
                  icon={<Dumbbell />}
                  title="Treino"
                  description="Define como os próximos planos são montados."
                  summary={
                    [
                      prefs.days_per_week ? `${prefs.days_per_week}× por semana` : null,
                      DURATION_OPTIONS.find((o) => o.value === prefs.session_duration)?.minutes ??
                        null,
                      PLACE_OPTIONS.find((o) => o.value === prefs.training_place)?.label ?? null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Não informado"
                  }
                >
                  <div className="space-y-5">
                    <Group label="Experiência">
                      <ChipRadio
                        label="Experiência"
                        options={EXPERIENCE_OPTIONS.map((o) => ({
                          value: o.value,
                          label: o.label,
                        }))}
                        value={prefs.experience_level}
                        onChange={(v) => updatePref("experience_level", v)}
                      />
                    </Group>

                    <Group label="Dias por semana">
                      <ChipRadio
                        label="Dias por semana"
                        options={DAYS_PER_WEEK_OPTIONS.map((d) => ({
                          value: String(d),
                          label: `${d}×`,
                        }))}
                        value={prefs.days_per_week ? String(prefs.days_per_week) : null}
                        onChange={(v) => updatePref("days_per_week", Number(v))}
                      />
                    </Group>

                    <Group label="Tempo por sessão">
                      <ChipRadio
                        label="Tempo por sessão"
                        options={DURATION_OPTIONS.map((o) => ({
                          value: o.value,
                          label: `${o.label} · ${o.minutes}`,
                        }))}
                        value={prefs.session_duration}
                        onChange={(v) => updatePref("session_duration", v)}
                      />
                    </Group>

                    <Group label="Onde você treina">
                      <ChipRadio
                        label="Onde você treina"
                        options={PLACE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                        value={prefs.training_place}
                        onChange={(v) => updatePref("training_place", v)}
                      />
                    </Group>

                    <Group label="Equipamentos disponíveis">
                      <ChipGroup
                        label="Equipamentos disponíveis"
                        options={EQUIPMENT_OPTIONS}
                        selected={prefs.equipment_available}
                        onChange={(v) => updatePref("equipment_available", v)}
                      />
                    </Group>

                    <Group label="Foco">
                      <ChipRadio
                        label="Foco"
                        options={FOCUS_OPTIONS}
                        value={prefs.focus_area}
                        onChange={(v) => updatePref("focus_area", v)}
                      />
                    </Group>

                    <SavePreferences
                      disabled={!prefsTouched}
                      loading={savePreferences.isPending}
                      onSave={() => savePreferences.mutate()}
                    />
                  </div>
                </ProfileSection>
              )}

              {mostra("alimentacao") && (
                <ProfileSection
                  defaultOpen={secao === "alimentacao"}
                  icon={<Utensils />}
                  title="Alimentação"
                  description="Quantas refeições o cardápio deve montar e a meta de água."
                  summary={
                    [
                      prefs.meals_per_day ? `${prefs.meals_per_day} refeições` : null,
                      prefs.water_ml_target
                        ? `${(prefs.water_ml_target / 1000).toFixed(1)} L`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Não informado"
                  }
                >
                  <div className="space-y-5">
                    <Group label="Refeições por dia">
                      <ChipRadio
                        label="Refeições por dia"
                        options={MEALS_PER_DAY_OPTIONS.map((n) => ({
                          value: String(n),
                          label: String(n),
                        }))}
                        value={prefs.meals_per_day ? String(prefs.meals_per_day) : null}
                        onChange={(v) => updatePref("meals_per_day", Number(v))}
                      />
                    </Group>

                    <Field
                      label="Meta de água (ml)"
                      htmlFor="p-water"
                      hint="Deixe em branco para o app estimar pelo seu peso."
                    >
                      <Input
                        id="p-water"
                        type="number"
                        inputMode="numeric"
                        min={500}
                        max={8000}
                        step={100}
                        value={prefs.water_ml_target ?? ""}
                        onChange={(e) =>
                          updatePref(
                            "water_ml_target",
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                      />
                    </Field>

                    <SavePreferences
                      disabled={!prefsTouched}
                      loading={savePreferences.isPending}
                      onSave={() => savePreferences.mutate()}
                    />
                  </div>
                </ProfileSection>
              )}

              {mostra("saude") && (
                <ProfileSection
                  defaultOpen={secao === "saude"}
                  icon={<HeartPulse />}
                  title="Saúde"
                  description="Exercícios que carregam as regiões marcadas saem dos planos gerados."
                  summary={
                    prefs.injuries.length > 0
                      ? `${prefs.injuries.length} região(ões) a preservar`
                      : "Nenhuma restrição"
                  }
                >
                  <div className="space-y-5">
                    <Group label="Regiões a preservar">
                      <ChipGroup
                        label="Regiões a preservar"
                        options={INJURY_OPTIONS}
                        selected={prefs.injuries}
                        onChange={(v) => updatePref("injuries", v)}
                      />
                    </Group>

                    <SavePreferences
                      disabled={!prefsTouched}
                      loading={savePreferences.isPending}
                      onSave={() => savePreferences.mutate()}
                    />
                  </div>
                </ProfileSection>
              )}

              {mostra("aparencia") && (
                <ProfileSection
                  defaultOpen={secao === "aparencia"}
                  icon={<Palette />}
                  title="Aparência"
                  description="A escolha fica salva neste aparelho."
                  summary="Claro, escuro ou automático"
                >
                  <AppearanceSection />
                </ProfileSection>
              )}

              {mostra("conta") && (
                <>
                  <ImportDataCard />
                  <ExportDataCard />
                  <DeleteAccountCard />
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => void supabase.auth.signOut()}
                  >
                    <LogOut className="mr-1.5 size-4" aria-hidden />
                    Sair da conta
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </PageBody>
    </>
  );
}

/**
 * Botão de salvar das seções de preferências.
 *
 * As três seções gravam pela **mesma** mutação, porque escrevem na mesma linha
 * de `profiles`. Repetir o botão em cada uma é proposital: quem mudou algo em
 * "Treino" não deveria precisar rolar até outra seção para salvar.
 */
function SavePreferences({
  disabled,
  loading,
  onSave,
}: {
  disabled: boolean;
  loading: boolean;
  onSave: () => void;
}) {
  return (
    <Button className="w-full" onClick={onSave} disabled={disabled} loading={loading}>
      Salvar preferências
    </Button>
  );
}

function Group({ label: groupLabel, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{groupLabel}</p>
      {children}
    </div>
  );
}

function MissingDataNotice({
  hasWeight,
  hasHeight,
  hasBirthDate,
}: {
  hasWeight: boolean;
  hasHeight: boolean;
  hasBirthDate: boolean;
}) {
  const faltando = [
    !hasBirthDate && "data de nascimento",
    !hasHeight && "altura",
    !hasWeight && "peso registrado em Progresso",
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Para calcular suas metas, ainda falta:</p>
      <ul className="space-y-1.5 text-sm">
        {faltando.map((item) => (
          <li key={item} className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden />
            <span className="capitalize">{item}</span>
          </li>
        ))}
      </ul>
      {!hasWeight && (
        <Button variant="outline" size="sm" asChild>
          <Link to="/body">Registrar peso</Link>
        </Button>
      )}
    </div>
  );
}

function Field({
  label: fieldLabel,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{fieldLabel}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function Stat({
  label: statLabel,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        highlight
          ? "rounded-lg border border-primary/30 bg-primary-soft/50 p-3"
          : "rounded-lg border border-border p-3"
      }
    >
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{statLabel}</p>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}
