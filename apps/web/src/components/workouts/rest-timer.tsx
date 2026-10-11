import { useState } from "react";
import { Bell, BellOff, Minus, Plus, X } from "lucide-react";
import type { RestTimer } from "@/hooks/use-rest-timer";

/**
 * A barra do descanso entre séries. O relógio é `useRestTimer` (alvo em
 * `endsAt`, persistido, reconciliado ao voltar do background); aqui fica só a
 * interface e o som.
 */
export function RestTimerBar({ timer }: { timer: RestTimer }) {
  const [som, setSom] = useState(restSoundEnabled);

  if (timer.remaining === null) return null;

  const mm = Math.floor(timer.remaining / 60);
  const ss = String(timer.remaining % 60).padStart(2, "0");

  const fracao = timer.total > 0 ? timer.remaining / timer.total : 0;
  const botao =
    "grid size-11 shrink-0 place-items-center rounded-full text-(--t-on-soft) transition hover:bg-(--t-raised) hover:text-(--t-on) active:scale-90";

  // Cores dos tokens da tela do treino (--t-*, ver .tela-treino em styles.css).
  return (
    <div className="fixed inset-x-0 bottom-24 z-30 px-4 md:bottom-6 md:pl-64">
      <div
        className="mx-auto max-w-md overflow-hidden rounded-[1.5rem] bg-(--t-surface) text-(--t-on) shadow-2xl shadow-black/40 animate-in fade-in slide-in-from-bottom-4 duration-300"
        role="timer"
        aria-label="Descanso"
      >
        {/* O tempo que falta, encolhendo. */}
        <div className="h-1 bg-(--t-raised)" aria-hidden>
          <div
            className="h-full bg-(--t-accent) transition-[width] duration-1000 ease-linear"
            style={{ width: `${fracao * 100}%` }}
          />
        </div>
        <div className="flex items-center gap-1 p-2">
          <button
            type="button"
            className={botao}
            onClick={() => timer.adjust(-15)}
            aria-label="Menos 15 segundos"
          >
            <Minus className="size-5" />
          </button>
          <div className="flex-1 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-(--t-on-soft)">
              Descanso
            </p>
            <p
              className="text-[1.75rem] font-extrabold leading-none tabular-nums text-(--t-accent)"
              aria-live="off"
            >
              {mm}:{ss}
            </p>
          </div>
          <button
            type="button"
            className={botao}
            onClick={() => timer.adjust(15)}
            aria-label="Mais 15 segundos"
          >
            <Plus className="size-5" />
          </button>
          <button
            type="button"
            className={botao}
            onClick={() => {
              setSom(!som);
              writeSound(!som);
            }}
            aria-label={som ? "Desligar som do descanso" : "Ligar som do descanso"}
            aria-pressed={som}
          >
            {som ? <Bell className="size-5" /> : <BellOff className="size-5" />}
          </button>
          <button
            type="button"
            onClick={timer.stop}
            aria-label="Pular descanso"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-(--t-accent) text-(--t-accent-fg) transition active:scale-90"
          >
            <X className="size-5" strokeWidth={2.75} />
          </button>
        </div>
      </div>
    </div>
  );
}

const SOUND_KEY = "forja:rest-sound";

function restSoundEnabled(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

function writeSound(on: boolean) {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // Sem storage (aba privada): a preferência vale só nesta sessão.
  }
}

/** Dois bipes curtos gerados na hora, se o som estiver ligado — sem arquivo de áudio. */
export function playRestFinishedSound() {
  if (!restSoundEnabled()) return;
  try {
    const ctx = new AudioContext();
    [0, 0.25].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.2, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.2);
    });
    window.setTimeout(() => void ctx.close(), 800);
  } catch {
    // Sem Web Audio: a vibração do hook ainda avisa.
  }
}
