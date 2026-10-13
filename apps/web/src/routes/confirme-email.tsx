import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

/**
 * "Confirme seu e-mail" como rota própria, não como estado interno da tela de
 * cadastro.
 *
 * O usuário sai do app para abrir o e-mail e volta. Se a instrução vivesse
 * dentro do estado de outro componente, esse retorno o traria de volta ao
 * formulário em branco — sem explicação do que fazer e com a impressão de que o
 * cadastro se perdeu. Com URL própria, a tela sobrevive ao recarregamento e ao
 * botão "voltar".
 */
export const Route = createFileRoute("/confirme-email")({
  head: () => ({
    meta: [{ title: "Confirme seu e-mail — Habitual Fit" }, { name: "robots", content: "noindex" }],
  }),
  ssr: false,
  // O e-mail vem na URL para a tela sobreviver ao recarregamento; um estado em
  // memória não sobreviveria, e sem ele não há como reenviar.
  validateSearch: z.object({ email: z.string().email().optional() }),
  component: ConfirmEmailPage,
});

function ConfirmEmailPage() {
  const { email } = Route.useSearch();
  const [resending, setResending] = useState(false);
  const [sentAt, setSentAt] = useState<number | null>(null);

  const resend = async () => {
    if (!email) return;
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    setResending(false);

    if (error) return toast.error(error.message);
    setSentAt(Date.now());
    toast.success("E-mail reenviado.");
  };

  // Reenvio tem limite no Supabase; bloquear por um minuto evita que o usuário
  // gaste as tentativas em cliques repetidos e receba um erro de quota.
  const podeReenviar = !sentAt || Date.now() - sentAt > 60_000;

  return (
    <div className="grid min-h-dvh place-items-center bg-background px-6">
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-primary/12 text-primary animate-in zoom-in-50 duration-500">
          <MailCheck className="size-8" aria-hidden />
        </span>

        <h1 className="mt-6 text-2xl font-bold tracking-tight">Confirme seu e-mail</h1>
        <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
          Enviamos um link para{" "}
          {email ? <span className="font-medium text-foreground">{email}</span> : "o seu e-mail"}.
          Toque no botão do e-mail para confirmar sua conta e montar seu plano.
        </p>

        <div className="mt-8 space-y-3">
          {email && (
            <Button
              variant="outline"
              className="h-12 w-full rounded-xl"
              onClick={resend}
              disabled={resending || !podeReenviar}
            >
              {resending && <Loader2 className="mr-2 size-4 animate-spin" />}
              {podeReenviar ? "Reenviar e-mail" : "Aguarde um minuto para reenviar"}
            </Button>
          )}
          <Button asChild variant="ghost" className="h-12 w-full rounded-xl">
            <Link to="/auth">Já confirmei — entrar</Link>
          </Button>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Não chegou? Verifique a caixa de spam ou de promoções.
        </p>
      </div>
    </div>
  );
}
