/**
 * Exclusão da conta — exibida no perfil, logo abaixo da exportação.
 *
 * Apaga de verdade: dados, fotos e a conta (Edge Function `delete-account`).
 * A App Store exige o caminho dentro do app, e a LGPD garante o direito. A
 * confirmação pede para digitar uma palavra porque não há como desfazer.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/data/supabase-helpers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const PALAVRA = "EXCLUIR";

export function DeleteAccountCard() {
  const navigate = useNavigate();
  const [texto, setTexto] = useState("");
  const [excluindo, setExcluindo] = useState(false);

  const excluir = async () => {
    setExcluindo(true);
    try {
      const { error } = await supabase.functions.invoke("delete-account", { method: "POST" });
      if (error) throw error;
      // O usuário já não existe no servidor: só falta limpar a sessão local.
      await supabase.auth.signOut({ scope: "local" });
      toast.success("Conta excluída", { description: "Seus dados foram apagados." });
      void navigate({ to: "/" });
    } catch (e) {
      toast.error("Não foi possível excluir a conta", { description: errorMessage(e) });
      setExcluindo(false);
    }
  };

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-base">Excluir conta</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Apaga seus treinos, dieta, medidas, fotos e a conta. Não dá para desfazer — se quiser
          guardar algo, exporte antes. Assinaturas feitas na App Store ou no Google Play são
          canceladas na própria loja.
        </p>
        <AlertDialog onOpenChange={(aberto) => !aberto && setTexto("")}>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="text-destructive">
              <Trash2 className="mr-1.5 size-4" aria-hidden />
              Excluir minha conta
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir a conta para sempre?</AlertDialogTitle>
              <AlertDialogDescription>
                Digite {PALAVRA} para confirmar. Todos os seus dados serão apagados.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <label className="block">
              <span className="sr-only">Digite {PALAVRA} para confirmar</span>
              <Input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
              />
            </label>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
              <Button
                variant="destructive"
                disabled={texto.trim().toUpperCase() !== PALAVRA || excluindo}
                onClick={() => void excluir()}
              >
                {excluindo ? "Excluindo…" : "Excluir para sempre"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
