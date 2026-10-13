import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { BrandSymbol } from "@/components/brand-logo";

/**
 * Cadastro — o primeiro passo.
 *
 * Nome, e-mail e senha. O e-mail precisa ser confirmado: o link leva de volta
 * à raiz já com a sessão, onde o questionário monta o plano na conta.
 */
export const Route = createFileRoute("/criar-conta")({
  head: () => ({
    meta: [
      { title: "Criar conta — Habitual Fit" },
      { name: "description", content: "Crie sua conta para montar seu plano de treino e dieta." },
      { name: "robots", content: "noindex" },
    ],
  }),
  ssr: false,
  component: CreateAccountPage,
});

const nameSchema = z.string().trim().min(2, "Informe seu nome").max(60);
const emailSchema = z.string().trim().email("E-mail inválido").max(255);
const passSchema = z
  .string()
  .min(8, "Use pelo menos 8 caracteres")
  .max(72)
  .regex(/[A-Za-z]/, "Use pelo menos uma letra")
  .regex(/[0-9]/, "Use pelo menos um número");

function CreateAccountPage() {
  const navigate = useNavigate();

  // Sessão ativa: nada a cadastrar, segue para o questionário.
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: "/", replace: true });
    });
  }, [navigate]);

  return (
    <Shell onBack={() => void navigate({ to: "/" })}>
      <div className="mb-7 text-center">
        <BrandSymbol className="mx-auto w-14 animate-in zoom-in-50 duration-500" />
        <h1 className="mt-5 text-balance text-2xl font-bold leading-tight tracking-tight">
          Crie sua conta
        </h1>
        <p className="mt-2 text-pretty text-sm text-muted-foreground">
          Depois de confirmar o e-mail, você responde algumas perguntas e seu plano fica pronto.
        </p>
      </div>

      <SignUpForm />

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link to="/auth" className="font-medium text-primary underline-offset-4 hover:underline">
          Entrar
        </Link>
      </p>
    </Shell>
  );
}

function SignUpForm() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string }>({});
  const [loading, setLoading] = useState<"email" | "google" | null>(null);
  const [contaExiste, setContaExiste] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    const nm = nameSchema.safeParse(name);
    const em = emailSchema.safeParse(email);
    const pw = passSchema.safeParse(password);
    const next: typeof errors = {};
    if (!nm.success) next.name = nm.error.issues[0]?.message;
    if (!em.success) next.email = em.error.issues[0]?.message;
    if (!pw.success) next.password = pw.error.issues[0]?.message;
    setErrors(next);
    if (!nm.success || !em.success || !pw.success) return;

    setLoading("email");
    const { data, error } = await supabase.auth.signUp({
      email: em.data,
      password: pw.data,
      options: {
        // O link de confirmação leva ao questionário, já logado.
        emailRedirectTo: `${window.location.origin}/`,
        data: { name: nm.data },
      },
    });
    setLoading(null);

    // Conta já existente: com a confirmação desligada vem o erro; ligada, o
    // Supabase não acusa (para não revelar contas) e devolve um usuário sem
    // identidades — nos dois casos, o aviso fica na tela.
    if (
      error?.code === "user_already_exists" ||
      /already registered/i.test(error?.message ?? "") ||
      (!error && data.user?.identities?.length === 0)
    ) {
      return setContaExiste(em.data);
    }
    if (error) return void toast.error(error.message);

    // Confirmação desligada no projeto: já veio sessão, segue para o questionário.
    if (data.session) return void navigate({ to: "/", replace: true });

    void navigate({ to: "/confirme-email", search: { email: em.data } });
  };

  const googleSignUp = async () => {
    setLoading("google");
    const res = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (res.error) {
      toast.error("Não foi possível entrar com o Google.");
      setLoading(null);
    }
  };

  return (
    <div>
      <form onSubmit={submit} className="space-y-3.5" noValidate>
        <Field id="name" label="Nome" error={errors.name}>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="given-name"
            placeholder="Como podemos te chamar?"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "name-error" : undefined}
            className="h-12 rounded-xl text-base"
            required
          />
        </Field>

        <Field id="email" label="E-mail" error={errors.email}>
          <Input
            id="email"
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setContaExiste(null);
            }}
            autoComplete="email"
            placeholder="voce@email.com"
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
            placeholder="Mínimo de 8 caracteres"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "password-error" : undefined}
            className="h-12 rounded-xl text-base"
            required
          />
          <PasswordStrength value={password} />
        </Field>

        {contaExiste && (
          <div
            role="alert"
            className="rounded-2xl border border-primary/40 bg-primary/10 p-4 animate-in fade-in slide-in-from-bottom-1 duration-300"
          >
            <p className="font-semibold">Este e-mail já tem uma conta</p>
            <p className="mt-1 text-pretty text-sm text-muted-foreground">
              <span className="break-all font-medium text-foreground">{contaExiste}</span> já está
              cadastrado. Entre com ele ou recupere a senha.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button asChild className="h-11 rounded-xl">
                <Link to="/auth">Entrar</Link>
              </Button>
              <Button asChild variant="outline" className="h-11 rounded-xl">
                <Link to="/esqueci-senha" search={{ email: contaExiste }}>
                  Esqueci a senha
                </Link>
              </Button>
            </div>
          </div>
        )}

        <Button
          type="submit"
          size="lg"
          className="h-14 w-full rounded-2xl text-base font-semibold"
          disabled={loading !== null}
        >
          {loading === "email" && <Loader2 className="mr-2 size-4 animate-spin" />}
          Criar conta
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        ou
        <div className="h-px flex-1 bg-border" />
      </div>

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

      <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        Seus dados de treino, peso e alimentação são privados e visíveis só para você.
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
              aria-label="Voltar"
              className="size-10 rounded-full"
            >
              <ArrowLeft className="size-5" />
            </Button>
          ) : (
            <BrandSymbol className="w-10" />
          )}
        </header>
        <main className="flex-1">{children}</main>
      </div>
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
