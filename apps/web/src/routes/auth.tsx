import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/data/supabase-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

/**
 * Entrar — **só** entrar. Cadastro em /criar-conta, senha esquecida em
 * /esqueci-senha.
 *
 * Depois de entrar, a raiz decide o destino: com plano, o painel; sem plano
 * (conta nova, primeiro login com Google), o questionário.
 */
export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Habitual Fit" },
      { name: "description", content: "Acesse sua conta Habitual Fit." },
      { name: "robots", content: "noindex" },
    ],
  }),
  ssr: false,
  component: AuthPage,
});

const emailSchema = z.string().trim().email("E-mail inválido").max(255);
const passSchema = z.string().min(1, "Informe sua senha").max(72);

function AuthPage() {
  const navigate = useNavigate();

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: "/", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) void navigate({ to: "/", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  return (
    <div className="grid min-h-dvh place-items-center bg-background px-6 py-10">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex items-center justify-center" aria-label="Habitual Fit">
          <BrandLogo className="h-14" />
        </Link>

        <h1 className="text-center text-2xl font-bold tracking-tight">Bem-vindo de volta</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Entre para continuar de onde parou.
        </p>

        <div className="mt-8">
          <GoogleButton />

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            ou com e-mail
            <div className="h-px flex-1 bg-border" />
          </div>

          <SignInForm />
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Ainda não tem conta?{" "}
          <Link
            to="/criar-conta"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Criar conta
          </Link>
        </p>
      </div>
    </div>
  );
}

function GoogleButton() {
  const [loading, setLoading] = useState(false);

  const signIn = async () => {
    setLoading(true);
    const res = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (res.error) {
      toast.error("Não foi possível entrar com o Google.");
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      className="h-12 w-full rounded-xl text-base"
      onClick={signIn}
      disabled={loading}
    >
      {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <GoogleIcon />}
      Continuar com Google
    </Button>
  );
}

function SignInForm() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const em = emailSchema.safeParse(email);
    const pw = passSchema.safeParse(password);
    if (!em.success) return toast.error(em.error.issues[0]!.message);
    if (!pw.success) return toast.error(pw.error.issues[0]!.message);

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: em.data, password: pw.data });
    setLoading(false);

    if (!error) return; // sucesso: `onAuthStateChange` redireciona

    if (error.code === "email_not_confirmed" || /not confirmed/i.test(error.message)) {
      toast.info("Confirme seu e-mail para entrar.");
      return void navigate({ to: "/confirme-email", search: { email: em.data } });
    }
    // Mensagem genérica de propósito: distinguir "e-mail não existe" de "senha
    // errada" confirma a terceiros quem tem conta no app.
    toast.error(errorMessage(error));
  };

  return (
    <form onSubmit={submit} className="space-y-3.5" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className="h-12 rounded-xl text-base"
          required
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Senha</Label>
          <Link
            to="/esqueci-senha"
            search={{ email: email.trim() || undefined }}
            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            Esqueci a senha
          </Link>
        </div>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="h-12 rounded-xl text-base"
          required
        />
      </div>

      <Button
        type="submit"
        size="lg"
        className="h-14 w-full rounded-2xl text-base font-semibold"
        disabled={loading}
      >
        {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
        Entrar
      </Button>
    </form>
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
