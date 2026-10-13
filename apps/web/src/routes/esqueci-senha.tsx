import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandLogo } from "@/components/brand-logo";

/**
 * Recuperação de senha: pede o e-mail e manda o link que abre /nova-senha.
 */
export const Route = createFileRoute("/esqueci-senha")({
  head: () => ({
    meta: [{ title: "Recuperar senha — Habitual Fit" }, { name: "robots", content: "noindex" }],
  }),
  ssr: false,
  validateSearch: z.object({ email: z.string().optional() }),
  component: ForgotPasswordPage,
});

const emailSchema = z.string().trim().email("Informe um e-mail válido").max(255);

function ForgotPasswordPage() {
  const search = Route.useSearch();
  const [email, setEmail] = useState(search.email ?? "");
  const [erro, setErro] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [enviadoPara, setEnviadoPara] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const em = emailSchema.safeParse(email);
    setErro(em.success ? undefined : em.error.issues[0]?.message);
    if (!em.success) return;

    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(em.data, {
      redirectTo: `${window.location.origin}/nova-senha`,
    });
    setLoading(false);

    if (error) {
      return toast.error(
        /rate limit|security purposes/i.test(error.message)
          ? "Muitas tentativas. Aguarde um pouco e tente de novo."
          : error.message,
      );
    }
    // Mesma tela havendo conta ou não: não confirma a terceiros quem tem conta.
    setEnviadoPara(em.data);
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-background px-6 py-10">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex items-center justify-center" aria-label="Habitual Fit">
          <BrandLogo className="h-14" />
        </Link>

        {enviadoPara ? (
          <div className="text-center">
            <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-primary/12 text-primary animate-in zoom-in-50 duration-500">
              <MailCheck className="size-8" aria-hidden />
            </span>
            <h1 className="mt-6 text-2xl font-bold tracking-tight">Verifique seu e-mail</h1>
            <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
              Se houver uma conta com{" "}
              <span className="font-medium text-foreground">{enviadoPara}</span>, enviamos um link
              para criar uma nova senha. Ele vale por 1 hora.
            </p>
            <Button
              variant="outline"
              className="mt-8 h-12 w-full rounded-xl"
              onClick={() => setEnviadoPara(null)}
            >
              Usar outro e-mail
            </Button>
            <p className="mt-6 text-xs text-muted-foreground">
              Não chegou? Verifique a caixa de spam ou de promoções.
            </p>
          </div>
        ) : (
          <>
            <h1 className="text-center text-2xl font-bold tracking-tight">Esqueceu a senha?</h1>
            <p className="mt-2 text-pretty text-center text-sm text-muted-foreground">
              Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha.
            </p>

            <form onSubmit={submit} className="mt-8 space-y-3.5" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="voce@email.com"
                  aria-invalid={!!erro}
                  aria-describedby={erro ? "email-error" : undefined}
                  className="h-12 rounded-xl text-base"
                  required
                />
                {erro && (
                  <p id="email-error" role="alert" className="text-sm text-destructive">
                    {erro}
                  </p>
                )}
              </div>
              <Button
                type="submit"
                size="lg"
                className="h-14 w-full rounded-2xl text-base font-semibold"
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
                Enviar link
              </Button>
            </form>
          </>
        )}

        <Link
          to="/auth"
          className="mt-8 flex items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Voltar para o login
        </Link>
      </div>
    </div>
  );
}
