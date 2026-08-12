import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Cronômetro de descanso entre séries.
 *
 * A implementação anterior era um `setTimeout` recursivo que decrementava um
 * contador em estado. Três problemas para o uso real (celular no bolso entre
 * séries):
 *
 * 1. **Drift** — cada ciclo acumulava o atraso do agendamento.
 * 2. **Throttling em background** — navegadores estrangulam timers de abas
 *    ocultas; o cronômetro simplesmente parava justamente quando o usuário
 *    guardava o telefone.
 * 3. **Perdido na navegação** — sair da rota zerava o descanso.
 *
 * Aqui o estado da verdade é o **instante de término** (`endsAt`). O intervalo
 * apenas reconcilia a exibição, então voltar ao app depois de 40s em background
 * mostra o tempo correto. O alvo é persistido em `sessionStorage` para
 * sobreviver à navegação e ao recarregamento.
 */

const STORAGE_KEY = "forja:rest-timer";

export type RestTimer = {
  /** Segundos restantes, ou `null` quando não há descanso ativo. */
  remaining: number | null;
  /** Duração total do descanso atual, para desenhar o progresso. */
  total: number;
  start: (seconds: number) => void;
  stop: () => void;
  /** Soma (ou subtrai) segundos ao descanso em andamento. */
  adjust: (deltaSeconds: number) => void;
};

export function useRestTimer(options?: { onFinish?: () => void }): RestTimer {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const onFinishRef = useRef(options?.onFinish);
  onFinishRef.current = options?.onFinish;

  // Restaura um descanso em andamento (navegação entre rotas, reload).
  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as { endsAt: number; total: number };
      if (saved.endsAt > Date.now()) {
        setEndsAt(saved.endsAt);
        setTotal(saved.total);
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (endsAt === null) {
      setRemaining(null);
      return;
    }

    let finished = false;

    const tick = () => {
      const left = Math.ceil((endsAt - Date.now()) / 1000);
      if (left <= 0) {
        if (finished) return;
        finished = true;
        setRemaining(null);
        setEndsAt(null);
        sessionStorage.removeItem(STORAGE_KEY);
        notifyRestFinished();
        onFinishRef.current?.();
        return;
      }
      setRemaining(left);
    };

    tick();
    const interval = setInterval(tick, 250);

    // Reconcilia imediatamente ao voltar do background, sem esperar o intervalo
    // (que pode ter sido estrangulado pelo navegador).
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [endsAt]);

  const start = useCallback((seconds: number) => {
    const duration = Math.max(1, Math.round(seconds));
    const target = Date.now() + duration * 1000;
    setTotal(duration);
    setEndsAt(target);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ endsAt: target, total: duration }));
    void requestNotificationPermission();
  }, []);

  const stop = useCallback(() => {
    setEndsAt(null);
    setRemaining(null);
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  const adjust = useCallback((deltaSeconds: number) => {
    setEndsAt((current) => {
      if (current === null) return current;
      const next = Math.max(Date.now() + 1000, current + deltaSeconds * 1000);
      setTotal((t) => Math.max(1, t + deltaSeconds));
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ endsAt: next, total: Math.ceil((next - Date.now()) / 1000) }),
      );
      return next;
    });
  }, []);

  return { remaining, total, start, stop, adjust };
}

/**
 * Pede permissão de notificação de forma silenciosa. Só faz sentido pedir
 * quando o usuário já demonstrou intenção (iniciou um descanso), e não na
 * abertura do app.
 */
async function requestNotificationPermission(): Promise<void> {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "default") return;
  try {
    await Notification.requestPermission();
  } catch {
    // Permissão negada ou API indisponível — o app segue com vibração/toast.
  }
}

/** Avisa o fim do descanso mesmo com o app em segundo plano. */
function notifyRestFinished(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.([200, 100, 200]);
  }
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      new Notification("Descanso concluído", {
        body: "Hora da próxima série.",
        icon: "/favicon.ico",
        tag: "forja-rest",
      });
    } catch {
      // Alguns navegadores exigem service worker para notificações; ignorar.
    }
  }
}
