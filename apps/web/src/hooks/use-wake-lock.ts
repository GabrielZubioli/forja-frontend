import { useEffect } from "react";

/**
 * Mantém a tela acesa enquanto `active` — o celular apoiado no banco não deve
 * apagar entre uma série e outra.
 *
 * O navegador solta o bloqueio sozinho quando a aba vai para segundo plano;
 * por isso ele é pedido de novo ao voltar. Sem suporte (navegadores antigos),
 * não faz nada.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelado = false;

    const pedir = async () => {
      try {
        const novo = await navigator.wakeLock.request("screen");
        if (cancelado) void novo.release();
        else lock = novo;
      } catch {
        // Negado (bateria fraca, aba oculta): a tela só apaga como de costume.
      }
    };
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void pedir();
    };

    void pedir();
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      cancelado = true;
      document.removeEventListener("visibilitychange", aoVoltar);
      void lock?.release();
    };
  }, [active]);
}
