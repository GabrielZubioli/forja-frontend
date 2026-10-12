import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { BrandSymbol } from "@/components/brand-logo";
import { cn } from "@/lib/utils";

/**
 * Tutorial rápido do primeiro acesso.
 *
 * Passa pelas telas principais tocando nos botões de verdade: em cada passo a
 * tela escurece e **só o botão destacado responde** — as quatro faixas escuras
 * em volta dele bloqueiam o resto. "Pular" está sempre disponível. Roda uma vez
 * por conta neste aparelho, só no celular (os passos apontam para a barra
 * inferior) e só para contas criadas há pouco.
 */
type Passo =
  | { tipo: "aviso"; titulo: string; texto: string; botao: string }
  | { tipo: "toque"; alvo: string; titulo: string; texto: string; destino: string };

const PASSOS: Passo[] = [
  {
    tipo: "aviso",
    titulo: "Bem-vindo ao Habitual Fit!",
    texto: "Em 20 segundos eu te mostro onde fica cada coisa. Toque nos botões destacados.",
    botao: "Começar",
  },
  {
    tipo: "toque",
    alvo: "nav/plan",
    titulo: "Seu plano de treino",
    texto: "Toque em Plano: aqui ficam suas rotinas e os dias de cada uma.",
    destino: "/plan",
  },
  {
    tipo: "toque",
    alvo: "nav/diet",
    titulo: "Sua dieta do dia",
    texto: "Toque em Dieta para ver as refeições e marcar o que já comeu.",
    destino: "/diet",
  },
  {
    tipo: "toque",
    alvo: "nav-treinar",
    titulo: "Hora de treinar",
    texto: "Este é o botão mais importante: toque nele para ver e começar o treino.",
    destino: "/train",
  },
  {
    tipo: "aviso",
    titulo: "Tudo pronto!",
    texto: "Estatísticas, corpo, receitas e ajustes ficam no Menu. Bom treino!",
    botao: "Concluir",
  },
];

const chave = (userId: string) => `hf:tour:${userId}`;
const TRES_DIAS = 3 * 24 * 60 * 60 * 1000;

export function AppTour({ userId, createdAt }: { userId: string; createdAt: string | undefined }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [passo, setPasso] = useState<number | null>(null);
  const [aguardando, setAguardando] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Começa na Início, uma vez, para conta nova, no celular.
  useEffect(() => {
    if (passo !== null || pathname !== "/dashboard") return;
    if (!createdAt || Date.now() - Date.parse(createdAt) > TRES_DIAS) return;
    if (window.matchMedia("(min-width: 768px)").matches) return;
    try {
      if (localStorage.getItem(chave(userId))) return;
    } catch {
      return;
    }
    const t = window.setTimeout(() => setPasso(0), 900);
    return () => window.clearTimeout(t);
  }, [pathname, passo, userId, createdAt]);

  const atual = passo === null ? null : PASSOS[passo];

  const encerrar = () => {
    try {
      localStorage.setItem(chave(userId), "feito");
    } catch {
      // Sem storage: o tutorial pode voltar numa próxima visita — aceitável.
    }
    setPasso(null);
  };
  const avancar = () => {
    setAguardando(false);
    setPasso((p) => (p === null || p + 1 >= PASSOS.length ? null : p + 1));
    if (passo !== null && passo + 1 >= PASSOS.length) encerrar();
  };

  // Passo de toque: chegou ao destino → próximo.
  useEffect(() => {
    if (atual?.tipo === "toque" && pathname === atual.destino) avancar();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Acompanha a posição do botão destacado e percebe o toque nele.
  useEffect(() => {
    if (atual?.tipo !== "toque") return setRect(null);
    let el: Element | null = null;
    const tocou = () => setAguardando(true);
    const medir = () => {
      const novo = document.querySelector(`[data-tour="${atual.alvo}"]`);
      if (novo !== el) {
        el?.removeEventListener("click", tocou);
        novo?.addEventListener("click", tocou);
        el = novo;
      }
      const r = el?.getBoundingClientRect();
      setRect(r && r.width > 0 ? r : null);
    };
    medir();
    const id = window.setInterval(medir, 250);
    return () => {
      window.clearInterval(id);
      el?.removeEventListener("click", tocou);
    };
  }, [atual]);

  if (!atual || aguardando) return null;

  if (atual.tipo === "aviso") {
    return (
      <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-in fade-in duration-300 sm:items-center">
        <div className="w-full max-w-sm rounded-[1.75rem] bg-card p-6 text-center animate-in slide-in-from-bottom-6 duration-500">
          <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-primary">
            <BrandSymbol escuro className="w-9" />
          </span>
          <h2 className="mt-4 text-xl font-extrabold">{atual.titulo}</h2>
          <p className="mt-1.5 text-muted-foreground">{atual.texto}</p>
          <button
            type="button"
            onClick={avancar}
            className="mt-6 h-12 w-full rounded-2xl bg-primary font-bold text-primary-foreground transition active:scale-[0.98]"
          >
            {atual.botao}
          </button>
          {passo === 0 && (
            <button
              type="button"
              onClick={encerrar}
              className="mt-2 h-11 w-full rounded-2xl text-sm font-semibold text-muted-foreground"
            >
              Pular tutorial
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!rect) return null;
  const folga = 6;
  const furo = {
    top: rect.top - folga,
    left: rect.left - folga,
    right: rect.right + folga,
    bottom: rect.bottom + folga,
  };
  const faixa = "fixed z-[70] bg-black/70";
  const passosDeToque = PASSOS.filter((p) => p.tipo === "toque");
  const indice = passosDeToque.indexOf(atual) + 1;

  return (
    <>
      {/* Quatro faixas em volta do botão: escurecem e bloqueiam todo o resto. */}
      <div className={faixa} style={{ top: 0, left: 0, right: 0, height: Math.max(0, furo.top) }} />
      <div className={faixa} style={{ top: furo.bottom, left: 0, right: 0, bottom: 0 }} />
      <div
        className={faixa}
        style={{ top: furo.top, left: 0, width: Math.max(0, furo.left), height: furo.bottom - furo.top }}
      />
      <div
        className={faixa}
        style={{ top: furo.top, left: furo.right, right: 0, height: furo.bottom - furo.top }}
      />
      <div
        className="pointer-events-none fixed z-[71] rounded-3xl ring-4 ring-primary animate-pulse"
        style={{
          top: furo.top,
          left: furo.left,
          width: furo.right - furo.left,
          height: furo.bottom - furo.top,
        }}
        aria-hidden
      />

      <div
        role="dialog"
        aria-label={atual.titulo}
        className={cn(
          "fixed inset-x-4 z-[72] mx-auto max-w-sm rounded-[1.5rem] bg-card p-5 animate-in fade-in slide-in-from-bottom-3 duration-300",
        )}
        style={{ bottom: window.innerHeight - furo.top + 16 }}
      >
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
          {indice} de {passosDeToque.length}
        </p>
        <h2 className="mt-1 text-lg font-extrabold">{atual.titulo}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{atual.texto}</p>
        <button
          type="button"
          onClick={encerrar}
          className="mt-3 text-sm font-semibold text-muted-foreground underline-offset-2 hover:underline"
        >
          Pular tutorial
        </button>
      </div>
    </>
  );
}
