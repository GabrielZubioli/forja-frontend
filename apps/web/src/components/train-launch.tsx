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
        {/* Abaixo do desenho o antebraço (23,4% a 94,4% da largura) se abre
            até a tela toda — o braço em perspectiva vira a própria tela. */}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="-mt-1 block h-[28vh] w-full"
          aria-hidden
        >
          <path d="M23.4 0 L94.4 0 C97 30 100 60 100 100 L0 100 C0 60 18 30 23.4 0 Z" fill="currentColor" />
        </svg>
        <div className="-mt-px h-[calc(100dvh+4rem)] bg-current" />
      </div>
    </div>
  );
}

/**
 * Punho erguido (silhueta clássica, levemente de lado), vetorizado da
 * referência: dedos inclinados separados por vãos, o vinco do polegar e o
 * antebraço afinando para baixo. Os vãos são buracos (evenodd) — mostram o que
 * está atrás. A cor vem de `currentColor`.
 */
const PUNHO_D =
  "M 107.254 43.535 C 106.049 44.379, 104.184 47.056, 103.110 49.484 C 100.411 55.586, 93.662 78.995, 94.391 79.724 C 95.173 80.506, 128.426 94.885, 128.745 94.579 C 129.621 93.737, 137.164 58.663, 137.234 55.104 C 137.342 49.650, 136.541 49.011, 124.604 45.035 C 114.390 41.632, 110.456 41.292, 107.254 43.535 M 146.881 53.503 C 145.441 54.286, 143.490 56.554, 142.546 58.544 C 140.513 62.829, 133.773 92.481, 134.202 95.252 C 134.527 97.348, 167.589 111.475, 168.546 109.926 C 168.816 109.489, 171.017 99.802, 173.438 88.400 C 179.430 60.176, 179.065 59.219, 160.500 54.539 C 148.868 51.607, 150.186 51.707, 146.881 53.503 M 187.500 64.945 C 183.190 66.710, 182.137 69.560, 177.143 93 C 168.970 131.356, 167.835 138.007, 168.557 143.335 C 169.796 152.489, 177.053 157.658, 187.454 156.795 C 200.434 155.719, 203.948 148.007, 215.108 96.122 C 220.500 71.049, 220.546 71.169, 203.800 66.607 C 193.805 63.884, 190.833 63.581, 187.500 64.945 M 229.500 76.945 C 224.242 79.097, 221.898 86.073, 214.405 121.871 C 209.324 146.145, 209.961 150.386, 219.418 155.212 C 224.475 157.794, 234.226 157.407, 238.221 154.467 C 244.164 150.093, 248.227 138.290, 253.951 108.777 C 258.813 83.703, 258.306 82.318, 242.761 78.241 C 233.499 75.811, 232.507 75.714, 229.500 76.945 M 81.302 83.959 C 77.717 85.489, 75.512 90.656, 63.784 125 C 52.037 159.402, 51.777 160.434, 53.761 164.797 C 61.006 180.734, 82.222 214.860, 99.120 237.758 C 116.755 261.654, 117.001 262.227, 116.996 279.391 C 116.991 293.073, 115.156 316.732, 110.974 357 C 107.740 388.139, 103.024 431.169, 102.399 435.250 L 101.824 439 173.010 439 L 244.196 439 243.608 433.250 C 243.284 430.087, 241.650 393.525, 239.976 352 C 238.303 310.475, 236.688 274.536, 236.388 272.135 L 235.843 267.770 231.921 268.397 C 226.975 269.187, 226.964 268.569, 231.878 266.062 C 247.640 258.021, 252.927 237.231, 253 183 C 253.023 166.134, 253.592 154.701, 255.015 142.500 C 258.524 112.406, 257.382 108.152, 252.171 131.903 C 247.211 154.507, 242.265 160.500, 228.573 160.500 C 219.746 160.500, 214.876 158.188, 210.014 151.691 L 206.527 147.032 204.802 150.395 C 196.408 166.757, 167.230 163.096, 165.239 145.430 L 164.766 141.228 159.947 144.224 C 156.571 146.322, 152.879 147.543, 147.611 148.302 L 140.093 149.385 148.296 154.851 C 157.574 161.032, 171.837 174.740, 174.464 180 C 175.942 182.959, 175.152 182.418, 169.355 176.500 C 153.096 159.901, 131.771 147.493, 110.052 141.995 C 102.205 140.008, 95.006 137.132, 97.650 137.040 C 98.282 137.018, 104.582 138.633, 111.650 140.629 C 128.598 145.415, 145.162 146.002, 153.757 142.121 C 162.578 138.138, 167.915 130.268, 168.304 120.667 L 168.500 115.835 159.500 112.567 C 149.239 108.842, 146.033 107.500, 114.836 93.880 C 92.496 84.127, 85.653 82.102, 81.302 83.959";

function Punho({ className }: { className?: string }) {
  return (
    <svg viewBox="53 40 203 399" className={className} preserveAspectRatio="xMidYMax meet">
      <path fill="currentColor" fillRule="evenodd" d={PUNHO_D} />
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
