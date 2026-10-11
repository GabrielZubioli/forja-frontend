import { useCallback, useEffect, useRef, useState } from "react";
import { HandFist } from "lucide-react";
import { BrandSymbol } from "@/components/brand-logo";
import { formatClock } from "@/lib/date";
import { cn } from "@/lib/utils";

/**
 * O botão central de treinar e a transição que ele dispara.
 *
 * Parado, é o símbolo da marca num círculo verde. Ao tocar, um painel verde
 * sobe do botão com um punho na borda, empurrando a tela para cima — e por
 * baixo dele a tela Treinar (do mesmo verde) já está carregando. Com um treino
 * aberto, vira um "gravando": quadradinho no lugar do símbolo e um anel que se
 * completa conforme o tempo previsto do treino passa.
 */

type Fase = "subindo" | "saindo" | null;

/** Duração da subida; a navegação acontece no meio dela, coberta pelo painel. */
const SUBIDA_MS = 640;

export function useTrainLaunch(irParaTreinar: () => void) {
  const [fase, setFase] = useState<Fase>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const lancar = useCallback(() => {
    if (fase) return;
    // Quem pediu menos movimento vai direto, sem a encenação.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      irParaTreinar();
      return;
    }
    setFase("subindo");
    timers.current = [
      window.setTimeout(irParaTreinar, SUBIDA_MS * 0.6),
      window.setTimeout(() => setFase("saindo"), SUBIDA_MS + 80),
      window.setTimeout(() => setFase(null), SUBIDA_MS + 480),
    ];
  }, [fase, irParaTreinar]);

  return { fase, lancar };
}

/** O painel verde com o punho, por cima de tudo durante a transição. */
export function TrainLaunchOverlay({ fase }: { fase: Fase }) {
  if (!fase) return null;
  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-0 z-[70] overflow-hidden transition-opacity duration-300 ease-out",
        fase === "saindo" && "opacity-0",
      )}
      aria-hidden
    >
      <div className="hf-sheet-up absolute inset-0 bg-[#01D798]">
        {/* O punho vai na borda de cima do painel, como quem o empurra. */}
        <div className="hf-fist-punch absolute left-1/2 top-0">
          <span className="grid size-28 place-items-center rounded-full bg-[#01D798] shadow-[0_-12px_40px_-8px_rgba(1,215,152,0.6)]">
            <HandFist className="size-14 text-[#020306]" strokeWidth={2.4} />
          </span>
        </div>
      </div>
    </div>
  );
}

/** O conteúdo do botão central da barra inferior. */
export function TrainFab({
  sessao,
}: {
  sessao: { startedAt: string; plannedSeconds: number } | null;
}) {
  if (!sessao) {
    return (
      <>
        <span className="grid size-16 place-items-center rounded-full bg-[#01D798] shadow-lg shadow-[#01D798]/30 transition-transform active:scale-90">
          <BrandSymbol escuro className="w-9" />
        </span>
        <span className="text-[12px] font-bold text-primary">Treinar</span>
      </>
    );
  }
  return <Gravando startedAt={sessao.startedAt} plannedSeconds={sessao.plannedSeconds} />;
}

/** Treino em andamento: quadradinho de parar e o anel do tempo, como numa gravação. */
function Gravando({ startedAt, plannedSeconds }: { startedAt: string; plannedSeconds: number }) {
  const agora = useAgora(1000);
  const decorrido = Math.max(0, (agora - Date.parse(startedAt)) / 1000);
  const progresso = Math.min(1, decorrido / plannedSeconds);

  const R = 35;
  const C = 2 * Math.PI * R;

  return (
    <>
      <span className="relative grid size-16 place-items-center">
        <svg viewBox="0 0 76 76" className="absolute -inset-1.5 size-[76px] -rotate-90" aria-hidden>
          <circle cx="38" cy="38" r={R} fill="none" stroke="var(--border)" strokeWidth="4" />
          <circle
            cx="38"
            cy="38"
            r={R}
            fill="none"
            stroke="var(--warning)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - progresso)}
            style={{ transition: "stroke-dashoffset 1s linear" }}
          />
        </svg>
        <span className="grid size-[3.4rem] place-items-center rounded-full bg-warning shadow-lg shadow-warning/30 transition-transform active:scale-90">
          <span className="size-5 rounded-[6px] bg-warning-foreground" />
        </span>
      </span>
      <span className="text-[12px] font-bold tabular-nums text-warning">
        {formatClock(decorrido)}
      </span>
      <span className="sr-only">
        Treino em andamento, {Math.round(progresso * 100)}% do tempo previsto
      </span>
    </>
  );
}

function useAgora(intervaloMs: number) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setAgora(Date.now()), intervaloMs);
    return () => window.clearInterval(id);
  }, [intervaloMs]);
  return agora;
}
