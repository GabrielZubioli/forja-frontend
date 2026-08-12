/**
 * Botão que pede confirmação antes de executar uma ação destrutiva.
 *
 * O app tinha seis pontos de exclusão (treino, medida, foto, item do diário,
 * receita, ingrediente) disparando direto no clique. Num app usado com o celular
 * na mão durante o treino, um toque acidental apagava a sessão inteira sem
 * qualquer aviso — e sem desfazer.
 */
import { type ReactNode, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ConfirmButton({
  onConfirm,
  title,
  description,
  confirmLabel = "Excluir",
  cancelLabel = "Cancelar",
  children,
  disabled,
  className,
  variant = "ghost",
  size = "icon",
  "aria-label": ariaLabel,
}: {
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  /** Obrigatório quando o botão só tem ícone — sem isso o leitor de tela lê "botão". */
  "aria-label": string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant={variant}
          size={size}
          disabled={disabled}
          className={className}
          aria-label={ariaLabel}
        >
          {children}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            className={cn("bg-destructive text-destructive-foreground hover:bg-destructive/90")}
            onClick={() => onConfirm()}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
