import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Dumbbell, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { isComplete, missingFields, type Answers } from "@/lib/onboarding/schema";
import { loadDraft } from "@/lib/onboarding/storage";
import { derivedObjective } from "@/lib/onboarding/options";
import { bmrMifflin, goalCalories, macroTargets, tdee, waterTargetMl } from "@forja/domain";
import { derivedActivityLevel } from "@/lib/onboarding/options";

/**
 * Cadastro — o último passo, não o primeiro.
 *
 * O usuário chega aqui com o questionário respondido e uma prévia do que já foi
 * calculado a partir dele. A conta serve para **guardar** algo que já existe,
 * não para desbloquear algo que ele ainda não viu.
 *
 * Mostrar as metas reais nesta tela não é enfeite: é a prova de que valeu
 * responder. Um botão "criar conta" sem contexto é indistinguível de qualquer
 * outro formulário; um botão ao lado de "2.480 kcal e 150 g de proteína, para
 * você" é a conclusão natural do que a pessoa acabou de fazer.
 */
export const Route = createFileRoute("/criar-conta")({
  head: () => ({
    meta: [
      { title: "Criar conta — Forja" },
      { name: "description", content: "Crie sua conta para salvar seu plano de treino e dieta." },
      { name: "robots", content: "noindex" },
    ],
  }),
  ssr: false,
  component: CreateAccountPage,
});

const emailSchema = z.string().trim().email("E-mail inválido").max(255);
const passSchema = z.string().min(8, "Use pelo menos 8 caracteres").max(72);

function CreateAccountPage() {
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<Answers | null>(null);

  useEffect(() => {
    setAnswers(loadDraft());
  }, []);

  // Sessão ativa: nada a cadastrar.
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: "/preparando", replace: true });
    });
  }, [navigate]);

  const preview = useMemo(() => (answers ? computePreview(answers) : null), [answers]);

  if (!answers) return <PageSkeleton />;

  // Rascunho incompleto (armazenamento limpo no meio do caminho, link direto):
  // devolver ao questionário é melhor que gerar um plano sobre lacunas.
  if (!isComplete(answers)) {
    return (
      <Shell>
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">Faltam algumas respostas</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Precisamos de {missingFields(answers).length}{" "}
            {missingFields(answers).length === 1 ? "informação" : "informações"} para montar seu
            plano.
          </p>
          <Button asChild className="mt-6 h-12 w-full rounded-xl">
            <Link to="/">Voltar ao questionário</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell onBack={() => void navigate({ to: "/" })}>
      <div className="mb-6 text-center">
        <span
          className="mx-auto grid size-14 place-items-center rounded-2xl animate-in zoom-in-50 duration-500"
          style={{ background: "var(--gradient-primary)" }}
          aria-hidden
        >
          <Sparkles className="size-7 text-primary-foreground" />
        </span>
        <h1 className="mt-4 text-balance text-2xl font-bold leading-tight tracking-tight">
          Seu plano está pronto
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Crie sua conta para salvá-lo e começar hoje.
        </p>
      </div>

      {preview && <PlanPreview preview={preview} />}

      <SignUpForm answers={answers} />

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link to="/auth" className="font-medium text-primary underline-offset-4 hover:underline">
          Entrar
        </Link>
      </p>
    </Shell>
  );
}

interface Preview {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  waterMl: number;
  days: number;
  objective: string;
}

/**
 * Prévia calculada no cliente, com as mesmas funções do domínio que a geração
 * usará depois.
 *
 * Reusar `bmrMifflin`/`tdee`/`macroTargets` — em vez de estimar aqui e calcular
 * de verdade depois — é o que garante que o número mostrado antes do cadastro
 * seja exatamente o que aparece dentro do app. Prometer 2.480 kcal e entregar
 * 2.310 destruiria a confiança logo no primeiro minuto.
 */
function computePreview(answers: Answers): Preview {
  const objective = derivedObjective(answers);
  const weightKg = answers.weightKg ?? 75;

  const bmr = bmrMifflin({
    sex: answers.sex ?? "other",
    weightKg,
    heightCm: answers.heightCm ?? 172,
    ageYears: answers.age ?? 28,
  });
  const kcal = goalCalories(tdee(bmr, derivedActivityLevel(answers)), objective.weightGoal);
  const macros = macroTargets(kcal, weightKg);

  return {
    kcal,
    protein: macros.protein_g,
    carbs: macros.carbs_g,
    fat: macros.fat_g,
    waterMl: waterTargetMl({ weightKg, trainingMinutes: 40 }),
    days: answers.daysPerWeek ?? 3,
    objective: objective.label,
  };
}

function PlanPreview({ preview }: { preview: Preview }) {
  const linhas = [
    { label: "Calorias por dia", value: `${preview.kcal.toLocaleString("pt-BR")} kcal` },
    { label: "Proteína", value: `${preview.protein} g` },
    { label: "Carboidrato", value: `${preview.carbs} g` },
    { label: "Gordura", value: `${preview.fat} g` },
    { label: "Água", value: `${(preview.waterMl / 1000).toFixed(1)} L` },
    { label: "Treinos por semana", value: `${preview.days}` },
  ];

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-border">
      <div className="border-b border-border bg-muted/40 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {preview.objective}
        </p>
      </div>
      <dl className="divide-y divide-border">
        {linhas.map((l, i) => (
          <div
            key={l.label}
            className="flex items-center justify-between px-4 py-2.5 animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards duration-300"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <dt className="text-sm text-muted-foreground">{l.label}</dt>
            <dd className="text-sm font-semibold tabular-nums">{l.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SignUpForm({ answers }: { answers: Answers }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState<"email" | "google" | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    const em = emailSchema.safeParse(email);
    const pw = passSchema.safeParse(password);
    const next: typeof errors = {};
    if (!em.success) next.email = em.error.issues[0]?.message;
    if (!pw.success) next.password = pw.error.issues[0]?.message;
    setErrors(next);
    if (!em.success || !pw.success) return;

    setLoading("email");
    const { data, error } = await supabase.auth.signUp({
      email: em.data,
      password: pw.data,
      options: {
        // O link de confirmação leva direto à geração: quem confirma o e-mail
        // cai no plano sendo montado, não numa tela de login.
        emailRedirectTo: `${window.location.origin}/preparando`,
        data: { name: name.trim() || em.data.split("@")[0] },
      },
    });
    setLoading(null);

    if (error) {
      toast.error(
        error.message.includes("already registered")
          ? "Este e-mail já tem conta. Faça login para continuar."
          : error.message,
      );
      return;
    }

    // Confirmação desligada no projeto: já veio sessão, segue para a geração.
    if (data.session) return void navigate({ to: "/preparando", replace: true });

    void navigate({ to: "/confirme-email", search: { email: em.data } });
  };

  const googleSignUp = async () => {
    setLoading("google");
    const res = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/preparando`,
    });
    if (res.error) {
      toast.error("Não foi possível entrar com o Google.");
      setLoading(null);
    }
  };

  return (
    <div>
      <Button
        type="button"
        variant="outline"
        className="h-12 w-full rounded-xl text-base"
        onClick={googleSignUp}
        disabled={loading !== null}
      >
        {loading === "google" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <GoogleIcon />}
        Continuar com Google
      </Button>

      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        ou com e-mail
        <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={submit} className="space-y-3.5" noValidate>
        <Field id="name" label="Como podemos te chamar?">
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="given-name"
            placeholder="Seu nome"
            className="h-12 rounded-xl text-base"
          />
        </Field>

        <Field id="email" label="E-mail" error={errors.email}>
          <Input
            id="email"
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
            className="h-12 rounded-xl text-base"
            required
          />
        </Field>

        <Field id="password" label="Senha" error={errors.password}>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "password-error" : undefined}
            className="h-12 rounded-xl text-base"
            required
          />
          <PasswordStrength value={password} />
        </Field>

        <Button
          type="submit"
          size="lg"
          className="h-14 w-full rounded-2xl text-base font-semibold"
          disabled={loading !== null}
        >
          {loading === "email" && <Loader2 className="mr-2 size-4 animate-spin" />}
          Criar conta e ver meu plano
        </Button>
      </form>

      <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        Seus dados de treino, peso e alimentação são privados e visíveis só para você.
        {answers.allergies.length > 0 &&
          " Suas alergias ficam registradas e nunca entram no plano."}
      </p>
    </div>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Força da senha.
 *
 * O mínimo é 8 caracteres, mas a barra mostra o que ainda dá para melhorar sem
 * transformar isso em obstáculo: nenhuma regra bloqueia o cadastro além do
 * comprimento. Exigir símbolo e maiúscula produz senhas piores, anotadas em
 * papel, não melhores.
 */
function PasswordStrength({ value }: { value: string }) {
  if (!value) return null;

  const criterios = [
    value.length >= 8,
    value.length >= 12,
    /[a-z]/.test(value) && /[A-Z]/.test(value),
    /\d/.test(value) || /[^A-Za-z0-9]/.test(value),
  ];
  const nivel = criterios.filter(Boolean).length;
  const rotulos = ["Muito fraca", "Fraca", "Razoável", "Boa", "Forte"];

  return (
    <div className="pt-1">
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i < nivel
                ? nivel <= 1
                  ? "bg-destructive"
                  : nivel <= 2
                    ? "bg-chart-4"
                    : "bg-primary"
                : "bg-muted",
            )}
          />
        ))}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{rotulos[nivel]}</p>
    </div>
  );
}

function Shell({ children, onBack }: { children: React.ReactNode; onBack?: () => void }) {
  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pb-8 pt-5">
        <header className="mb-4 flex items-center gap-3">
          {onBack ? (
            <Button
              size="icon"
              variant="ghost"
              onClick={onBack}
              aria-label="Voltar ao questionário"
              className="size-10 rounded-full"
            >
              <ArrowLeft className="size-5" />
            </Button>
          ) : (
            <span
              className="grid size-10 place-items-center rounded-xl"
              style={{ background: "var(--gradient-primary)" }}
              aria-hidden
            >
              <Dumbbell className="size-5 text-primary-foreground" />
            </span>
          )}
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="mx-auto min-h-dvh max-w-lg space-y-4 px-5 pt-16">
      <div className="mx-auto size-14 animate-pulse rounded-2xl bg-muted" />
      <div className="mx-auto h-8 w-2/3 animate-pulse rounded-lg bg-muted" />
      <div className="h-48 animate-pulse rounded-2xl bg-muted" />
      <div className="h-12 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="mr-2 size-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.12A6.98 6.98 0 015.5 12c0-.74.13-1.45.34-2.12V7.04H2.18A11 11 0 001 12c0 1.78.43 3.46 1.18 4.96l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.2 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
        fill="#EA4335"
      />
    </svg>
  );
}
