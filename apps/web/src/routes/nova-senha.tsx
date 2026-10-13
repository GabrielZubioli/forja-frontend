import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandLogo } from "@/components/brand-logo";

/**
 * Nova senha: destino do link de recuperação. O link já abre uma sessão; aqui
 * a pessoa só escolhe a senha nova.
 */
export const Route = createFileRoute("/nova-senha")({
  head: () => ({
    meta: [{ title: "Nova senha — Habitual Fit" }, { name: "robots", content: "noindex" }],
  }),
  ssr: false,
  component: NewPasswordPage,
});

const passSchema = z
  .string()
  .min(8, "Use pelo menos 8 caracteres")
  .max(72)
  .regex(/[A-Za-z]/, "Use pelo menos uma letra")
  .regex(/[0-9]/, "Use pelo menos um número");

function NewPasswordPage() {
  const navigate = useNavigate();
  const [estado, setEstado] = useState<"verificando" | "pronto" | "invalido">("verificando");
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erros, setErros] = useState<{ senha?: string; confirma?: string }>({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    // Link expirado ou já usado: o Supabase devolve o erro no fragmento.
    if (/error(_code)?=/.test(window.location.hash + window.location.search)) {
      return setEstado("invalido");
    }
    void supabase.auth.getSession().then(({ data }) => {
      setEstado(data.session ? "pronto" : "invalido");
    });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pw = passSchema.safeParse(senha);
    const next: typeof erros = {};
    if (!pw.success) next.senha = pw.error.issues[0]?.message;
    else if (senha !== confirma) next.confirma = "As senhas não são iguais";
    setErros(next);
    if (next.senha || next.confirma) return;

    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSalvando(false);
    if (error) {
      return toast.error(
        /different from the old/i.test(error.message)
          ? "A nova senha precisa ser diferente da anterior."
          : error.message,
      );
    }
    toast.success("Senha alterada.");
    void navigate({ to: "/", replace: true });
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-background px-6 py-10">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex items-center justify-center" aria-label="Habitual Fit">
          <BrandLogo className="h-14" />
        </Link>

        {estado === "verificando" && (
          <div className="grid place-items-center py-10" role="status" aria-label="Carregando">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {estado === "invalido" && (
          <div className="text-center">
            <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-destructive/12 text-destructive">
              <ShieldAlert className="size-8" aria-hidden />
            </span>
            <h1 className="mt-6 text-2xl font-bold tracking-tight">Link inválido ou expirado</h1>
            <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
              O link de redefinição vale por 1 hora e só pode ser usado uma vez. Peça um novo para
              continuar.
            </p>
            <Button asChild className="mt-8 h-12 w-full rounded-xl">
              <Link to="/esqueci-senha">Pedir novo link</Link>
            </Button>
          </div>
        )}

        {estado === "pronto" && (
          <>
            <h1 className="text-center text-2xl font-bold tracking-tight">Crie uma nova senha</h1>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Pelo menos 8 caracteres, com letras e números.
            </p>
            <form onSubmit={submit} className="mt-8 space-y-3.5" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="senha">Nova senha</Label>
                <Input
                  id="senha"
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  autoComplete="new-password"
                  aria-invalid={!!erros.senha}
                  aria-describedby={erros.senha ? "senha-error" : undefined}
                  className="h-12 rounded-xl text-base"
                  required
                />
                {erros.senha && (
                  <p id="senha-error" role="alert" className="text-sm text-destructive">
                    {erros.senha}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirma">Repita a nova senha</Label>
                <Input
                  id="confirma"
                  type="password"
                  value={confirma}
                  onChange={(e) => setConfirma(e.target.value)}
                  autoComplete="new-password"
                  aria-invalid={!!erros.confirma}
                  aria-describedby={erros.confirma ? "confirma-error" : undefined}
                  className="h-12 rounded-xl text-base"
                  required
                />
                {erros.confirma && (
                  <p id="confirma-error" role="alert" className="text-sm text-destructive">
                    {erros.confirma}
                  </p>
                )}
              </div>
              <Button
                type="submit"
                size="lg"
                className="h-14 w-full rounded-2xl text-base font-semibold"
                disabled={salvando}
              >
                {salvando && <Loader2 className="mr-2 size-4 animate-spin" />}
                Salvar nova senha
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
