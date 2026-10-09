import { useState } from "react";
import { Bell, BellOff, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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

  return (
    <div className="fixed inset-x-0 bottom-20 z-30 px-4 md:bottom-6 md:pl-64">
      <div
        className="mx-auto flex max-w-md items-center gap-2 rounded-2xl border border-border bg-card p-2 shadow-lg"
        role="timer"
        aria-label="Descanso"
      >
        <Button
          size="icon"
          variant="ghost"
          onClick={() => timer.adjust(-15)}
          aria-label="Menos 15 segundos"
        >
          <Minus className="size-4" />
        </Button>
        <div className="flex-1 text-center">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Descanso
          </p>
          <p className="text-2xl font-bold tabular-nums" aria-live="off">
            {mm}:{ss}
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => timer.adjust(15)}
          aria-label="Mais 15 segundos"
        >
          <Plus className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => {
            setSom(!som);
            writeSound(!som);
          }}
          aria-label={som ? "Desligar som do descanso" : "Ligar som do descanso"}
          aria-pressed={som}
        >
          {som ? <Bell className="size-4" /> : <BellOff className="size-4" />}
        </Button>
        <Button size="icon" variant="secondary" onClick={timer.stop} aria-label="Pular descanso">
          <X className="size-4" />
        </Button>
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
