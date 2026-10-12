import { useEffect, useState, type ReactNode } from "react";
import { onlineManager } from "@tanstack/react-query";
import { RotateCw, SearchX, TriangleAlert, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { BrandSymbol } from "@/components/brand-logo";
import { cn } from "@/lib/utils";

/**
 * Telas de estado do app: erro inesperado, página inexistente e sem conexão.
 *
 * Todas seguem o mesmo desenho — o símbolo da marca com um selo do problema,
 * título curto, uma frase do que fazer e no máximo duas ações — para que um
 * erro pareça parte do app, não uma página quebrada.
 */
export function StatusScreen({
  selo,
  titulo,
  texto,
  acoes,
  detalhe,
  telaCheia = true,
}: {
  selo: ReactNode;
  titulo: string;
  texto: string;
  acoes: ReactNode;
  detalhe?: string;
  /** Fora do layout (raiz) ocupa a tela; dentro dele, só a área de conteúdo. */
  telaCheia?: boolean;
}) {
  return (
    <main
      className={cn(
        "flex flex-col items-center justify-center bg-background px-6 text-center",
        telaCheia ? "min-h-dvh" : "min-h-[70dvh]",
      )}
    >
      <div className="relative animate-in fade-in zoom-in-95 duration-500">
        <span className="grid size-24 place-items-center rounded-[1.75rem] bg-card">
          <BrandSymbol className="w-12 opacity-90" />
        </span>
        <span className="absolute -bottom-2 -right-2 grid size-10 place-items-center rounded-full border-4 border-background bg-foreground text-background [&_svg]:size-4">
          {selo}
        </span>
      </div>
      <h1 className="mt-7 text-2xl font-extrabold">{titulo}</h1>
      <p className="mt-2 max-w-xs text-[15px] text-muted-foreground">{texto}</p>
      <div className="mt-7 flex w-full max-w-xs flex-col gap-2.5">{acoes}</div>
      {detalhe && (
        <p className="mt-6 max-w-xs break-words font-mono text-[11px] text-muted-foreground/70">
          {detalhe}
        </p>
      )}
    </main>
  );
}

export const acaoPrimaria =
  "flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary font-bold text-primary-foreground transition active:scale-[0.98]";
export const acaoSecundaria =
  "flex h-12 w-full items-center justify-center rounded-2xl border border-border font-semibold transition-colors hover:bg-card";

export function ErrorScreen({
  error,
  onRetry,
  telaCheia,
}: {
  error?: unknown;
  onRetry: () => void;
  telaCheia?: boolean;
}) {
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  if (offline) return <OfflineScreen onRetry={onRetry} telaCheia={telaCheia} />;
  return (
    <StatusScreen
      telaCheia={telaCheia}
      selo={<TriangleAlert />}
      titulo="Algo saiu do previsto"
      texto="Esta tela encontrou um problema. Seus dados estão salvos — tente de novo ou volte ao início."
      detalhe={error instanceof Error ? error.message : undefined}
      acoes={
        <>
          <button type="button" className={acaoPrimaria} onClick={onRetry}>
            <RotateCw className="size-4" aria-hidden />
            Tentar de novo
          </button>
          <a href="/dashboard" className={acaoSecundaria}>
            Voltar ao início
          </a>
        </>
      }
    />
  );
}

export function NotFoundScreen() {
  return (
    <StatusScreen
      selo={<SearchX />}
      titulo="Página não encontrada"
      texto="O endereço não existe ou foi movido."
      acoes={
        <a href="/dashboard" className={acaoPrimaria}>
          Voltar ao início
        </a>
      }
    />
  );
}

export function OfflineScreen({
  onRetry,
  telaCheia,
}: {
  onRetry: () => void;
  telaCheia?: boolean;
}) {
  return (
    <StatusScreen
      telaCheia={telaCheia}
      selo={<WifiOff />}
      titulo="Sem conexão"
      texto="Não foi possível falar com o servidor. Confira o Wi-Fi ou os dados móveis e tente de novo."
      acoes={
        <button type="button" className={acaoPrimaria} onClick={onRetry}>
          <RotateCw className="size-4" aria-hidden />
          Tentar de novo
        </button>
      }
    />
  );
}

/** `true` enquanto o aparelho está sem rede. Começa `true` no servidor. */
export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const atualizar = () => setOnline(navigator.onLine);
    atualizar();
    window.addEventListener("online", atualizar);
    window.addEventListener("offline", atualizar);
    return () => {
      window.removeEventListener("online", atualizar);
      window.removeEventListener("offline", atualizar);
    };
  }, []);
  return online;
}

/**
 * Aviso fixo no topo enquanto não há rede. As consultas ficam pausadas (o
 * React Query já faz isso) e voltam sozinhas quando a conexão retorna — aí o
 * aviso some e um toast confirma.
 */
export function OfflineBanner() {
  const online = useOnline();
  const [caiu, setCaiu] = useState(false);

  useEffect(() => {
    if (!online) setCaiu(true);
    else if (caiu) {
      toast.success("Conexão restabelecida", { icon: <Wifi className="size-4" /> });
      setCaiu(false);
      onlineManager.setOnline(true);
    }
  }, [online]); // eslint-disable-line react-hooks/exhaustive-deps

  if (online) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[60] flex justify-center px-4 pt-[max(0.75rem,env(safe-area-inset-top))] animate-in fade-in slide-in-from-top-4 duration-300"
    >
      <div className="flex items-center gap-3 rounded-2xl bg-foreground px-4 py-3 text-background shadow-xl">
        <WifiOff className="size-5 shrink-0" aria-hidden />
        <div className="text-left">
          <p className="text-sm font-bold">Sem conexão com a internet</p>
          <p className="text-xs opacity-75">O que você fizer agora pode não ser salvo.</p>
        </div>
      </div>
    </div>
  );
}
