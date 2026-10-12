import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/data/query-keys";
import { assertOk, errorMessage, num, unwrapMaybe } from "@/data/supabase-helpers";
import { PageBody, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChipGroup, ChipRadio } from "@/components/ui/chip-group";
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
import { MACRO_COLORS } from "@/components/home/macro-rings";
import {
  Award,
  CalendarDays,
  Clock,
  Crosshair,
  Droplet,
  Dumbbell,
  HeartPulse,
  Info,
  LogOut,
  MapPin,
  Minus,
  Plus,
  ShieldCheck,
  Target,
  Utensils,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { macroTargets, yearsBetween } from "@forja/domain";
import { targetsFor } from "@/lib/profile-targets";
import {
  DURATION_OPTIONS,
  EQUIPMENT_OPTIONS,
  EXPERIENCE_OPTIONS,
  FOCUS_OPTIONS,
  INJURY_OPTIONS,
  MEALS_PER_DAY_OPTIONS,
  PLACE_OPTIONS,
} from "@/lib/onboarding/options";
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
    setPrefsTouched(false);
    // Só reidrata quando muda o registro carregado, não a cada refetch — senão
    // uma revalidação em background descartaria o que o usuário está digitando.
  }, [profileId]); // eslint-disable-line react-hooks/exhaustive-deps

  const validation = profileSchema.safeParse(form);

  const weightKg = latestWeight.data ?? 0;

  const preview = useMemo(
    () =>
      validation.success
        ? targetsFor(
            {
              sex: form.sex,
              birthDate: form.birth_date || null,
              heightCm: form.height_cm ? Number(form.height_cm) : null,
              activityLevel: form.activity_level,
              goal: form.goal,
            },
            weightKg,
          )
        : null,
    [form, weightKg, validation.success],
  );

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
  const editaPreferencias = mostra("treino") || mostra("alimentacao") || mostra("saude");

  return (
    <>
      <PageHeader title={titulo} />
      <PageBody>
        {/* `key`: trocar de seção pelo Menu remonta a tela. */}
        <div key={secao ?? "todas"} className={cn("space-y-8", prefsTouched && "pb-24")}>
          {carregando ? (
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full rounded-[1.25rem]" />
              ))}
            </div>
          ) : (
            <>
              {mostra("metas") && (
                <Secao
                  icon={<Target />}
                  title="Metas nutricionais"
                  description="Calculadas a partir dos seus dados e do objetivo."
                  sozinha={Boolean(secao)}
                >
                  {latestWeight.isPending ? (
                    <Skeleton className="h-48 w-full rounded-[1.25rem]" />
                  ) : !preview ? (
                    <Cartao>
                      <MissingDataNotice
                        hasWeight={Boolean(weightKg)}
                        hasHeight={Boolean(form.height_cm)}
                        hasBirthDate={Boolean(form.birth_date)}
                      />
                    </Cartao>
                  ) : (
                    <MetasResumo preview={preview} pesoKg={weightKg} />
                  )}

                  <p className="flex gap-2.5 rounded-[1.25rem] border border-border p-4 text-sm text-muted-foreground">
                    <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    <span>
                      Esta é a estimativa por <b className="text-foreground">fórmula</b>, que
                      depende do nível de atividade declarado. Abaixo, a estimativa pelos seus
                      dados reais — registre o peso em{" "}
                      <Link to="/body" className="font-semibold text-primary">
                        Progresso
                      </Link>{" "}
                      e o que come em{" "}
                      <Link to="/diet" className="font-semibold text-primary">
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
                </Secao>
              )}

              {mostra("treino") && (
                <Secao
                  icon={<Dumbbell />}
                  title="Treino"
                  description="Define como os próximos planos são montados."
                  sozinha={Boolean(secao)}
                >
                  <Cartao titulo="Dias por semana" icone={<CalendarDays />}>
                    <NumeroPicker
                      label="Dias por semana"
                      options={[...DAYS_PER_WEEK_OPTIONS]}
                      value={prefs.days_per_week}
                      onChange={(v) => updatePref("days_per_week", v)}
                      sufixo="×"
                    />
                  </Cartao>

                  <Cartao titulo="Experiência" icone={<Award />}>
                    <ChipRadio
                      label="Experiência"
                      options={EXPERIENCE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                      value={prefs.experience_level}
                      onChange={(v) => updatePref("experience_level", v)}
                    />
                  </Cartao>

                  <Cartao titulo="Tempo por sessão" icone={<Clock />}>
                    <ChipRadio
                      label="Tempo por sessão"
                      options={DURATION_OPTIONS.map((o) => ({
                        value: o.value,
                        label: `${o.label} · ${o.minutes}`,
                      }))}
                      value={prefs.session_duration}
                      onChange={(v) => updatePref("session_duration", v)}
                    />
                  </Cartao>

                  <Cartao titulo="Onde você treina" icone={<MapPin />}>
                    <ChipRadio
                      label="Onde você treina"
                      options={PLACE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                      value={prefs.training_place}
                      onChange={(v) => updatePref("training_place", v)}
                    />
                  </Cartao>

                  <Cartao
                    titulo="Equipamentos disponíveis"
                    icone={<Dumbbell />}
                    contador={prefs.equipment_available.length}
                  >
                    <ChipGroup
                      label="Equipamentos disponíveis"
                      options={EQUIPMENT_OPTIONS}
                      selected={prefs.equipment_available}
                      onChange={(v) => updatePref("equipment_available", v)}
                    />
                  </Cartao>

                  <Cartao titulo="Foco" icone={<Crosshair />}>
                    <ChipRadio
                      label="Foco"
                      options={FOCUS_OPTIONS}
                      value={prefs.focus_area}
                      onChange={(v) => updatePref("focus_area", v)}
                    />
                  </Cartao>
                </Secao>
              )}

              {mostra("alimentacao") && (
                <Secao
                  icon={<Utensils />}
                  title="Alimentação"
                  description="Quantas refeições o cardápio monta e quanto de água beber."
                  sozinha={Boolean(secao)}
                >
                  <Cartao titulo="Refeições por dia" icone={<Utensils />}>
                    <NumeroPicker
                      label="Refeições por dia"
                      options={[...MEALS_PER_DAY_OPTIONS]}
                      value={prefs.meals_per_day}
                      onChange={(v) => updatePref("meals_per_day", v)}
                    />
                  </Cartao>

                  <Cartao titulo="Meta de água" icone={<Droplet />}>
                    <AguaStepper
                      value={prefs.water_ml_target}
                      onChange={(v) => updatePref("water_ml_target", v)}
                    />
                  </Cartao>
                </Secao>
              )}

              {mostra("saude") && (
                <Secao
                  icon={<HeartPulse />}
                  title="Saúde"
                  description="Exercícios que carregam as regiões marcadas saem dos planos gerados."
                  sozinha={Boolean(secao)}
                >
                  <Cartao
                    titulo="Regiões a preservar"
                    icone={<ShieldCheck />}
                    contador={prefs.injuries.length}
                  >
                    <ChipGroup
                      label="Regiões a preservar"
                      options={INJURY_OPTIONS}
                      selected={prefs.injuries}
                      onChange={(v) => updatePref("injuries", v)}
                    />
                  </Cartao>
                  <p className="flex gap-2.5 rounded-[1.25rem] border border-border p-4 text-sm text-muted-foreground">
                    <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    O app não substitui orientação médica. Em caso de dor durante um exercício,
                    pare e procure um profissional.
                  </p>
                </Secao>
              )}

              {mostra("conta") && (
                <div className="space-y-3">
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
                </div>
              )}
            </>
          )}
        </div>

        {/*
          Um só botão de salvar, preso acima da barra inferior e visível só
          quando há mudança: as três seções gravam na mesma linha de `profiles`.
        */}
        {editaPreferencias && prefsTouched && (
          <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 px-4 animate-in fade-in slide-in-from-bottom-3 duration-300 md:bottom-6 md:left-auto md:right-6 md:w-96">
            <Button
              className="h-13 w-full rounded-2xl text-base font-bold"
              onClick={() => savePreferences.mutate()}
              loading={savePreferences.isPending}
            >
              Salvar alterações
            </Button>
          </div>
        )}
      </PageBody>
    </>
  );
}

/** Cabeçalho de uma seção: ícone em verde sólido, título e o porquê dela. */
function Secao({
  icon,
  title,
  description,
  sozinha,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  /** Aberta pelo Menu: o título da página já diz o nome, então só a descrição. */
  sozinha: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3.5 px-1">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground [&_svg]:size-6">
          {icon}
        </span>
        <div className="min-w-0">
          {!sozinha && <h2 className="text-xl font-extrabold">{title}</h2>}
          <p className={cn("text-muted-foreground", sozinha ? "text-[15px]" : "text-sm")}>
            {description}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Cartao({
  titulo,
  icone,
  contador,
  children,
}: {
  titulo?: string;
  icone?: React.ReactNode;
  contador?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[1.25rem] bg-card p-4">
      {titulo && (
        <p className="mb-3 flex items-center gap-2 font-bold [&_svg]:size-4 [&_svg]:text-primary">
          {icone}
          {titulo}
          {contador ? (
            <span className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">
              {contador}
            </span>
          ) : null}
        </p>
      )}
      {children}
    </div>
  );
}

/** Escolha de um número pequeno (dias, refeições) em círculos grandes. */
function NumeroPicker({
  label: rotulo,
  options,
  value,
  onChange,
  sufixo = "",
}: {
  label: string;
  options: number[];
  value: number | null;
  onChange: (v: number) => void;
  sufixo?: string;
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="flex justify-between gap-2">
      {options.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          onClick={() => onChange(n)}
          className={cn(
            "grid aspect-square w-full max-w-14 place-items-center rounded-full border-2 text-lg font-extrabold tabular-nums transition-colors",
            value === n
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-muted-foreground hover:border-primary/50",
          )}
        >
          {n}
          {sufixo}
        </button>
      ))}
    </div>
  );
}

/** Meta de água em passos de 250 ml; vazio = o app estima pelo peso. */
function AguaStepper({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const atual = value ?? 2500;
  const mudar = (d: number) => onChange(Math.min(8000, Math.max(500, atual + d)));
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => mudar(-250)}
          className="grid size-12 place-items-center rounded-full border-2 border-border text-xl font-bold hover:border-primary/50"
          aria-label="Menos 250 ml"
        >
          <Minus className="size-5" />
        </button>
        <p className="text-center">
          <span className="block text-4xl font-extrabold tabular-nums">
            {value === null ? "Auto" : `${(value / 1000).toLocaleString("pt-BR")} L`}
          </span>
          <span className="text-xs text-muted-foreground">
            {value === null ? "estimada pelo seu peso" : `${Math.round(value / 250)} copos de 250 ml`}
          </span>
        </p>
        <button
          type="button"
          onClick={() => mudar(250)}
          className="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground"
          aria-label="Mais 250 ml"
        >
          <Plus className="size-5" />
        </button>
      </div>
      {value !== null && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="mt-3 w-full text-center text-sm font-semibold text-primary"
        >
          Deixar o app estimar
        </button>
      )}
    </div>
  );
}

/**
 * As metas do dia: a calórica em destaque e a divisão dos macros numa barra
 * proporcional às calorias que cada um fornece (proteína e carbo 4 kcal/g,
 * gordura 9 kcal/g) — dá para ver de relance de onde vem a energia.
 */
function MetasResumo({
  preview,
  pesoKg,
}: {
  preview: NonNullable<ReturnType<typeof targetsFor>>;
  pesoKg: number;
}) {
  const partes = [
    { nome: "Proteína", g: preview.protein_g, kcal: preview.protein_g * 4, cor: MACRO_COLORS.protein },
    { nome: "Carboidrato", g: preview.carbs_g, kcal: preview.carbs_g * 4, cor: MACRO_COLORS.carbs },
    { nome: "Gordura", g: preview.fat_g, kcal: preview.fat_g * 9, cor: MACRO_COLORS.fat },
  ];
  const total = Math.max(1, partes.reduce((n, p) => n + p.kcal, 0));
  return (
    <>
      <div className="rounded-[1.25rem] bg-primary p-5 text-primary-foreground">
        <p className="text-xs font-bold uppercase tracking-[0.14em] opacity-75">Meta diária</p>
        <p className="mt-1 flex items-baseline gap-1.5">
          <span className="text-5xl font-extrabold leading-none tabular-nums">
            {preview.kcal.toLocaleString("pt-BR")}
          </span>
          <span className="text-lg font-bold opacity-75">kcal</span>
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-black/10 px-3 py-2">
            <p className="text-[11px] font-bold uppercase opacity-75">Metabolismo basal</p>
            <p className="font-extrabold tabular-nums">{preview.bmr.toLocaleString("pt-BR")} kcal</p>
          </div>
          <div className="rounded-xl bg-black/10 px-3 py-2">
            <p className="text-[11px] font-bold uppercase opacity-75">Gasto diário</p>
            <p className="font-extrabold tabular-nums">{preview.tdee.toLocaleString("pt-BR")} kcal</p>
          </div>
        </div>
      </div>

      <div className="rounded-[1.25rem] bg-card p-4">
        <p className="mb-3 font-bold">De onde vêm as calorias</p>
        <div className="flex h-3 gap-1 overflow-hidden rounded-full">
          {partes.map((p) => (
            <span
              key={p.nome}
              className="h-full rounded-full"
              style={{ width: `${(p.kcal / total) * 100}%`, background: p.cor }}
            />
          ))}
        </div>
        <ul className="mt-4 grid grid-cols-3 gap-2">
          {partes.map((p) => (
            <li key={p.nome}>
              <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <span className="size-2 rounded-full" style={{ background: p.cor }} aria-hidden />
                {p.nome}
              </p>
              <p className="mt-0.5 text-xl font-extrabold tabular-nums">{p.g} g</p>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {Math.round((p.kcal / total) * 100)}% das kcal
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
          Fibra: <b className="text-foreground">{preview.fiber_g} g</b> · calculado com seu último
          peso ({pesoKg} kg) pela equação de Mifflin-St Jeor, ajustada pela atividade e pelo
          objetivo.
        </p>
      </div>
    </>
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
