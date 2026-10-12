import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Bell, BellOff, Minus, Plus, X } from "lucide-react";
import type { RestTimer } from "@/hooks/use-rest-timer";

/**
 * A barra do descanso entre séries. O relógio é `useRestTimer` (alvo em
 * `endsAt`, persistido, reconciliado ao voltar do background); aqui fica só a
 * interface e o som.
 */
export function RestTimerBar({ timer }: { timer: RestTimer }) {
  const [som, setSom] = useState(restSoundEnabled);
  const recorte = useRecorteDoBotao(timer.remaining !== null);

  if (timer.remaining === null) return null;

  const mm = Math.floor(timer.remaining / 60);
  const ss = String(timer.remaining % 60).padStart(2, "0");

  const fracao = timer.total > 0 ? timer.remaining / timer.total : 0;
  const botaoPequeno =
    "grid size-9 shrink-0 place-items-center rounded-full bg-(--t-raised) text-(--t-on) transition active:scale-90";
  const botao =
    "grid size-11 shrink-0 place-items-center rounded-full text-(--t-on-soft) transition hover:bg-(--t-raised) hover:text-(--t-on) active:scale-90";

  // Cores dos tokens da tela do treino (--t-*, ver .tela-treino em styles.css).
  return (
    <div className="fixed inset-x-0 bottom-24 z-30 px-4 md:bottom-6 md:pl-64">
      <div
        ref={recorte.ref}
        style={recorte.style}
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
        {/*
          Tempo e ajuste à esquerda, som e pular à direita: o meio fica livre
          para o recorte do botão Treinar, que sobe sobre a barra.
        */}
        <div className="flex items-center justify-between gap-2 p-2">
          <div className="flex items-center">
            <button
              type="button"
              className={botaoPequeno}
              onClick={() => timer.adjust(-15)}
              aria-label="Menos 15 segundos"
            >
              <Minus className="size-4" />
            </button>
            <div className="w-[3.4rem] text-center">
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-(--t-on-soft)">
                Descanso
              </p>
              <p
                className="text-2xl font-extrabold leading-none tabular-nums text-(--t-accent)"
                aria-live="off"
              >
                {mm}:{ss}
              </p>
            </div>
            <button
              type="button"
              className={botaoPequeno}
              onClick={() => timer.adjust(15)}
              aria-label="Mais 15 segundos"
            >
              <Plus className="size-4" />
            </button>
          </div>
          <div className="flex items-center gap-1">
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

/** Folga entre o botão Treinar e a borda do recorte. */
const FOLGA_PX = 8;

/**
 * Recorte circular em volta do botão Treinar.
 *
 * O botão sobe acima da barra e cairia em cima da barra de descanso. Em vez de
 * empurrar a barra para cima, ela "abre espaço": mede onde o botão está de
 * verdade (`data-train-fab`) e aplica uma máscara com um círculo transparente
 * ali, um pouco maior que ele. Medir em vez de fixar pixels mantém o recorte
 * certo em qualquer aparelho, com ou sem área segura.
 */
function useRecorteDoBotao(ativo: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>();

  useLayoutEffect(() => {
    if (!ativo) return;
    const medir = () => {
      const card = ref.current?.getBoundingClientRect();
      const fab = document.querySelector("[data-train-fab]")?.getBoundingClientRect();
      // Sem botão visível (desktop) ou sem sobreposição: nada a recortar.
      if (!card || !fab || fab.width === 0 || fab.top > card.bottom + 2) {
        setStyle(undefined);
        return;
      }
      const x = fab.left + fab.width / 2 - card.left;
      const y = fab.top + fab.height / 2 - card.top;
      const r = fab.width / 2 + FOLGA_PX;
      const mascara = `radial-gradient(circle ${r}px at ${x}px ${y}px, transparent ${r - 0.5}px, #000 ${r}px)`;
      setStyle({ maskImage: mascara, WebkitMaskImage: mascara });
    };
    medir();
    // A barra entra deslizando: mede de novo quando a animação termina.
    const depois = window.setTimeout(medir, 400);
    window.addEventListener("resize", medir);
    return () => {
      window.clearTimeout(depois);
      window.removeEventListener("resize", medir);
    };
  }, [ativo]);

  return { ref, style };
}
