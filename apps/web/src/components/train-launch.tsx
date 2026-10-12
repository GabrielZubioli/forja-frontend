import { useCallback, useEffect, useRef, useState } from "react";
import { BrandSymbol } from "@/components/brand-logo";
import { formatClock } from "@/lib/date";
import { cn } from "@/lib/utils";

/**
 * O botão central de treinar e a transição que ele dispara.
 *
 * Parado, é o símbolo da marca num círculo verde. Ao tocar, um braço verde da
 * largura da tela sobe do rodapé com o punho cerrado na ponta: o braço cobre
 * a tela, o punho sai pelo topo e por baixo já está a tela Treinar, do mesmo
 * verde — o punho só existe durante a transição.
 *
 * Com um treino aberto, o botão vira um "gravando": quadradinho de parar e um
 * anel que se completa ao longo do tempo previsto. Fora da tela do treino, o
 * centro mostra o símbolo da marca pulsando de leve ("treinando"); dentro dela, um
 * quadradinho de parar — tocar nele termina o treino.
 */

type Fase = "subindo" | "saindo" | null;

/** Verde: abrir a tela Treinar. Laranja: voltar ao treino em andamento. */
export type CorLancamento = "verde" | "laranja";

/** As cores das telas de destino — o braço tem que ser exatamente a mesma. */
const COR: Record<CorLancamento, string> = {
  verde: "#01D798",
  laranja: "var(--treino)",
};

/** Disparado pelo quadradinho do botão central; a tela do treino o escuta. */
export const TERMINAR_TREINO_EVENT = "habitualfit:terminar-treino";

/** Duração da subida do braço; a navegação acontece no meio, coberta por ele. */
const SUBIDA_MS = 820;

export function useTrainLaunch() {
  const [fase, setFase] = useState<Fase>(null);
  const [cor, setCor] = useState<CorLancamento>("verde");
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const lancar = useCallback(
    (ir: () => void, corDoDestino: CorLancamento) => {
      if (fase) return;
      // Quem pediu menos movimento vai direto, sem a encenação.
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        ir();
        return;
      }
      setCor(corDoDestino);
      setFase("subindo");
      timers.current = [
        window.setTimeout(ir, SUBIDA_MS * 0.5),
        window.setTimeout(() => setFase("saindo"), SUBIDA_MS + 40),
        window.setTimeout(() => setFase(null), SUBIDA_MS + 400),
      ];
    },
    [fase],
  );

  return { fase, cor, lancar };
}

/**
 * O braço com o punho na ponta, durante a transição.
 *
 * Fica **atrás** da barra inferior (z-30 < z-40 da barra): a tela troca, a
 * navegação continua no lugar.
 */
export function TrainLaunchOverlay({ fase, cor }: { fase: Fase; cor: CorLancamento }) {
  if (!fase) return null;
  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-0 z-30 overflow-hidden transition-opacity duration-300 ease-out",
        fase === "saindo" && "opacity-0",
      )}
      style={{ color: COR[cor] }}
      aria-hidden
    >
      {/* Começa logo abaixo da tela e sobe a própria altura (punho + braço):
          termina com o braço cobrindo a tela e o punho já acima dela. */}
      <div className="hf-arm-up absolute inset-x-0 top-full">
        <Punho className="hf-fist-flex relative z-10 block w-full" />
        {/* O braço entra por baixo do punho: quando o soco inclina o punho,
            não abre fresta na emenda. */}
        <div className="-mt-16 h-[calc(100dvh+4rem)] bg-current" />
      </div>
    </div>
  );
}

/**
 * Punho cerrado visto de frente: os quatro dedos dobrados com os nós dos dedos
 * no alto (cada um com a dobra e um brilho suave) e o polegar cruzando na
 * frente. A base emenda no braço — a cor vem de `currentColor`.
 */
function Punho({ className }: { className?: string }) {
  return (
    <svg viewBox="0 92 400 278" className={className} preserveAspectRatio="xMidYMax meet">
      <rect x="0" y="230" width="400" height="140" fill="currentColor" />
      <path d="M10 250 V166 A46 46 0 0 1 102 166 V250 Z" fill="currentColor" stroke="rgba(2,3,6,0.38)" strokeWidth="6" /><path d="M106 250 V146 A46 46 0 0 1 198 146 V250 Z" fill="currentColor" stroke="rgba(2,3,6,0.38)" strokeWidth="6" /><path d="M202 250 V152 A46 46 0 0 1 294 152 V250 Z" fill="currentColor" stroke="rgba(2,3,6,0.38)" strokeWidth="6" /><path d="M298 250 V174 A46 46 0 0 1 390 174 V250 Z" fill="currentColor" stroke="rgba(2,3,6,0.38)" strokeWidth="6" />
      <path d="M24 194 C42 206 70 206 88 194" fill="none" stroke="rgba(2,3,6,0.38)" strokeWidth="6" strokeLinecap="round" /><path d="M120 174 C138 186 166 186 184 174" fill="none" stroke="rgba(2,3,6,0.38)" strokeWidth="6" strokeLinecap="round" /><path d="M216 180 C234 192 262 192 280 180" fill="none" stroke="rgba(2,3,6,0.38)" strokeWidth="6" strokeLinecap="round" /><path d="M312 202 C330 214 358 214 376 202" fill="none" stroke="rgba(2,3,6,0.38)" strokeWidth="6" strokeLinecap="round" />
      <path d="M32 146 C44 132 68 132 80 146" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="7" strokeLinecap="round" /><path d="M128 126 C140 112 164 112 176 126" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="7" strokeLinecap="round" /><path d="M224 132 C236 118 260 118 272 132" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="7" strokeLinecap="round" /><path d="M320 154 C332 140 356 140 368 154" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="7" strokeLinecap="round" />
      <path d="M-6 214 C50 196 170 196 236 206 C272 212 282 252 250 266 C180 284 70 290 -6 300 Z" fill="currentColor" stroke="rgba(2,3,6,0.38)" strokeWidth="6" strokeLinejoin="round" />
      <path d="M206 212 C228 212 246 222 248 238" fill="none" stroke="rgba(2,3,6,0.38)" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

/** O conteúdo do botão central da barra inferior. */
export function TrainFab({
  sessao,
  naSessao,
}: {
  sessao: { startedAt: string; plannedSeconds: number } | null;
  /** A pessoa está na tela do treino em andamento (o botão vira "terminar"). */
  naSessao: boolean;
}) {
  if (!sessao) {
    return (
      <>
        <span
          className="grid size-16 place-items-center rounded-full bg-[#01D798] transition-transform active:scale-90"
          data-train-fab
        >
          <BrandSymbol escuro className="w-9" />
        </span>
        <span className="text-[12px] font-bold text-primary">Treinar</span>
      </>
    );
  }
  return (
    <Gravando
      startedAt={sessao.startedAt}
      plannedSeconds={sessao.plannedSeconds}
      naSessao={naSessao}
    />
  );
}

/**
 * Treino em andamento: o anel do tempo em volta do botão, como numa gravação.
 *
 * Tudo numa caixa de 76 px com posições absolutas e explícitas — o anel ocupa
 * a caixa inteira e o botão fica 11 px para dentro de cada lado. Sem depender
 * de alinhamento de grid, o anel não tem como sair do centro.
 */
function Gravando({
  startedAt,
  plannedSeconds,
  naSessao,
}: {
  startedAt: string;
  plannedSeconds: number;
  naSessao: boolean;
}) {
  const agora = useAgora(1000);
  const decorrido = Math.max(0, (agora - Date.parse(startedAt)) / 1000);
  const progresso = Math.min(1, decorrido / plannedSeconds);

  const R = 35;
  const C = 2 * Math.PI * R;

  return (
    <>
      <span className="relative block size-[76px]" data-train-fab>
        <svg viewBox="0 0 76 76" className="absolute inset-0 size-full -rotate-90" aria-hidden>
          <circle cx="38" cy="38" r={R} fill="none" stroke="var(--border)" strokeWidth="4" />
          <circle
            cx="38"
            cy="38"
            r={R}
            fill="none"
            stroke="var(--treino)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - progresso)}
            style={{ transition: "stroke-dashoffset 1s linear" }}
          />
        </svg>
        <span className="absolute inset-[11px] grid place-items-center rounded-full bg-(--treino) shadow-lg shadow-black/30 transition-transform active:scale-90">
          {naSessao ? (
            <span className="size-5 rounded-[6px] bg-(--treino-ink)" aria-hidden />
          ) : (
            <BrandSymbol escuro className="hf-pulso w-8" />
          )}
        </span>
      </span>
      <span className="text-[12px] font-bold tabular-nums text-(--treino)">
        {formatClock(decorrido)}
      </span>
      <span className="sr-only">
        {naSessao ? "Terminar o treino. " : "Treino em andamento. "}
        {Math.round(progresso * 100)}% do tempo previsto
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
