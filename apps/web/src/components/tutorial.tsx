/**
 * Tutorial de boas-vindas — guiado e interativo, nas telas de verdade.
 *
 * ## Como funciona
 *
 * Os passos ficam todos em `PASSOS`. Cada um aponta para um elemento real
 * (`data-tour="…"`) e é de dois tipos:
 *
 * - **toque**: a pessoa precisa tocar no elemento destacado; o passo só avança
 *   quando o toque acontece (é o toque de verdade — navega, abre, etc.).
 * - **info**: destaca uma área e explica; avança com "Próximo".
 *
 * Enquanto um passo está ativo, todo o resto do app fica `inert` (sem clique,
 * toque nem foco por teclado) — menos o cartão do tutorial e o caminho até o
 * elemento pedido. O escurecimento é um "furo" em volta só do **ícone** do
 * elemento; o furo não captura o toque, que chega ao elemento.
 *
 * ## Segurança
 *
 * O tutorial não grava nada além da própria conclusão: abre uma rotina (só
 * expande), toca no play — que só pede confirmação — e pede "Cancelar". O
 * "Iniciar treino" fica bloqueado, então nenhum treino é criado.
 *
 * ## Robustez
 *
 * Cada passo espera o elemento aparecer (navegação e montagem assíncronas) e
 * rola até ele. Passo `opcional` sem elemento (ex.: plano em branco, sem
 * rotinas) é pulado; obrigatório oferece "Pular etapa". Sair por qualquer
 * caminho — pular, concluir, desmontar — desfaz todo o bloqueio.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { unwrapMaybe } from "@/data/supabase-helpers";
import { queryKeys } from "@/data/query-keys";
import { Button } from "@/components/ui/button";
import { BrandSymbol } from "@/components/brand-logo";
import { cn } from "@/lib/utils";

type Passo = {
  tipo: "toque" | "info";
  /** Seletores do elemento, em ordem de preferência (celular × computador). Vazio = cartão central. */
  alvo: string[];
  titulo: string;
  texto: string;
  /** Sem o elemento na tela, o passo é pulado em vez de travar. */
  opcional?: boolean;
  /** Pula o passo quando a tela já é a esperada (ex.: no computador não há Menu). */
  pularSe?: (path: string) => boolean;
  /** Passos da mesma tela permitem "Voltar" entre si. */
  tela: string;
  /** Mini ilustração no cartão (o que tem na tela do treino). */
  ilustracao?: "treino";
};

const tour = (id: string) => `[data-tour="${id}"]`;

export const PASSOS: Passo[] = [
  {
    tipo: "info",
    alvo: [],
    tela: "intro",
    titulo: "Vamos conhecer o Habitual Fit",
    texto:
      "Um tour pelas telas de verdade. Em cada etapa, toque no item destacado para continuar. Nada é registrado durante o tour — e você pode pular quando quiser.",
  },
  {
    tipo: "toque",
    alvo: [tour("nav-dashboard")],
    tela: "nav",
    titulo: "Tela inicial",
    texto: "Toque no ícone Início.",
  },
  {
    tipo: "info",
    alvo: [tour("home-semana")],
    tela: "inicio",
    titulo: "Seu treino e sua semana",
    texto: "O treino de hoje, os dias com treino na semana e o que você já fez.",
  },
  {
    tipo: "info",
    alvo: [tour("home-prontidao")],
    tela: "inicio",
    opcional: true,
    titulo: "Prontidão do corpo",
    texto: "Quanto seus músculos já se recuperaram dos últimos treinos.",
  },
  {
    tipo: "info",
    alvo: [tour("home-peso")],
    tela: "inicio",
    opcional: true,
    titulo: "Peso",
    texto: "Seu último peso e a meta. Registre novas pesagens para ver a tendência.",
  },
  {
    tipo: "info",
    alvo: [tour("home-dieta")],
    tela: "inicio",
    opcional: true,
    titulo: "Dieta de hoje",
    texto: "O resumo do que você registrou hoje na dieta.",
  },
  {
    tipo: "toque",
    alvo: [tour("nav-plan")],
    tela: "nav",
    titulo: "Plano",
    texto: "Agora toque no ícone Plano.",
  },
  {
    tipo: "info",
    alvo: [tour("plano-agenda")],
    tela: "plano",
    titulo: "Agenda da semana",
    texto:
      "Cada dia mostra a rotina que você vai treinar. Use o + de um dia para vincular uma rotina a ele.",
  },
  {
    tipo: "toque",
    alvo: [tour("segmento-rotinas")],
    tela: "plano",
    titulo: "Seus treinos",
    texto: "Toque em Rotinas para ver os treinos do seu plano.",
  },
  {
    tipo: "toque",
    alvo: [tour("rotina-abrir")],
    tela: "rotinas",
    opcional: true,
    titulo: "Abrir um treino",
    texto: "Toque na seta para abrir um treino e ver os exercícios.",
  },
  {
    tipo: "info",
    alvo: [tour("rotina-exercicios")],
    tela: "rotinas",
    opcional: true,
    titulo: "Séries, repetições e carga",
    texto:
      "Cada exercício mostra as séries, as repetições e a carga. Toque num exercício para ajustar ou trocar.",
  },
  {
    tipo: "toque",
    alvo: [tour("rotina-comecar")],
    tela: "rotinas",
    opcional: true,
    titulo: "Começar o treino",
    texto: "Para começar, toque no play. Antes de iniciar, o app pede confirmação.",
  },
  {
    tipo: "toque",
    alvo: [tour("confirmar-cancelar")],
    tela: "confirmar",
    opcional: true,
    ilustracao: "treino",
    titulo: "Na tela do treino",
    texto:
      "Ao confirmar, você marca cada série, ajusta repetições e peso, pausa o descanso e pode cancelar o treino. Agora toque em Cancelar — no tour não iniciamos nenhum treino.",
  },
  {
    tipo: "toque",
    alvo: [tour("nav-exercises"), tour("nav-menu")],
    tela: "nav",
    titulo: "Exercícios",
    texto: "Vamos à biblioteca de exercícios: toque no ícone destacado.",
  },
  {
    tipo: "toque",
    alvo: [tour("menu-exercises")],
    tela: "menu",
    pularSe: (path) => path.startsWith("/exercises"),
    titulo: "Exercícios",
    texto: "Toque em Exercícios.",
  },
  {
    tipo: "toque",
    alvo: [tour("exercicios-grupo")],
    tela: "exercicios",
    titulo: "Grupos musculares",
    texto: "Escolha um grupo muscular.",
  },
  {
    tipo: "toque",
    alvo: [tour("exercicio-item")],
    tela: "exercicios-lista",
    titulo: "Um exercício",
    texto: "Toque em um exercício para abrir a ficha dele.",
  },
  {
    tipo: "info",
    alvo: [tour("exercicio-demo")],
    tela: "exercicio",
    titulo: "Execução",
    texto: "A demonstração mostra o movimento completo.",
  },
  {
    tipo: "info",
    alvo: [tour("exercicio-passos")],
    tela: "exercicio",
    opcional: true,
    titulo: "Passo a passo",
    texto: "Como executar, as dicas e os erros mais comuns.",
  },
  {
    tipo: "toque",
    alvo: [tour("nav-diet")],
    tela: "nav",
    titulo: "Dieta",
    texto: "Agora toque no ícone Dieta.",
  },
  {
    tipo: "info",
    alvo: [tour("dieta-abas")],
    tela: "dieta",
    titulo: "Diário e Cardápio",
    texto:
      "No Diário você marca o que comeu em cada dia. No Cardápio da semana você monta as refeições de cada dia da semana.",
  },
  {
    tipo: "toque",
    alvo: [tour("dieta-aba-cardapio")],
    tela: "dieta",
    titulo: "Cardápio da semana",
    texto: "Toque em Cardápio da semana.",
  },
  {
    tipo: "info",
    alvo: [tour("cardapio-adicionar")],
    tela: "cardapio",
    opcional: true,
    titulo: "Adicionar alimentos",
    texto: "O + de cada refeição adiciona alimentos ou receitas. Não vamos adicionar nada agora.",
  },
  {
    tipo: "toque",
    alvo: [tour("dieta-aba-diario")],
    tela: "cardapio",
    titulo: "De volta ao Diário",
    texto: "Toque em Diário.",
  },
  {
    tipo: "info",
    alvo: [tour("renomear-refeicao")],
    tela: "diario",
    opcional: true,
    titulo: "Renomear uma refeição",
    texto:
      "O lápis muda o nome da refeição. Você escolhe se o nome novo vale para a semana toda ou só para aquele dia.",
  },
  {
    tipo: "toque",
    alvo: [tour("nav-stats"), tour("nav-menu")],
    tela: "nav",
    titulo: "Sua evolução",
    texto: "Por fim, sua evolução: toque no ícone destacado.",
  },
  {
    tipo: "toque",
    alvo: [tour("menu-stats")],
    tela: "menu",
    pularSe: (path) => path.startsWith("/stats"),
    titulo: "Estatísticas",
    texto: "Toque em Estatísticas.",
  },
  {
    tipo: "info",
    alvo: [tour("stats-semana")],
    tela: "stats",
    titulo: "Constância",
    texto: "Seus treinos da semana contra a meta e as últimas semanas.",
  },
  {
    tipo: "info",
    alvo: [tour("stats-treinos")],
    tela: "stats",
    titulo: "Registros de treino",
    texto: "Seus últimos treinos ficam aqui. O peso você registra e acompanha em Corpo, no Menu.",
  },
  {
    tipo: "info",
    alvo: [],
    tela: "fim",
    titulo: "Tudo pronto!",
    texto: "Bons treinos. Para rever este tour, use Ver tutorial, no Menu.",
  },
];

/** Pedido de rever o tour (Menu → Ver tutorial). */
export const TUTORIAL_EVENT = "habitual:tutorial";

const chaveLocal = (userId: string) => `hf:tutorial-visto:${userId}`;
/** Quanto esperar um elemento aparecer (navegação, carregamento) antes de desistir. */
const ESPERA_MS = 7000;

function visivel(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
}

function acharAlvo(seletores: string[]): HTMLElement | null {
  for (const s of seletores) {
    const el = [...document.querySelectorAll<HTMLElement>(s)].find(visivel);
    if (el) return el;
  }
  return null;
}

/** O que recebe o destaque: só o ícone, quando o elemento tem um. */
function areaDoDestaque(el: HTMLElement, tipo: Passo["tipo"]): Element {
  if (tipo !== "toque") return el;
  const icone = el.querySelector("svg");
  return icone && visivel(icone) ? icone : el;
}

/**
 * Deixa inerte tudo que não está no caminho até `alvo` (nem é o tutorial).
 * Sem alvo, bloqueia todo o app. Devolve a função que desfaz.
 */
function bloquearFora(alvo: HTMLElement | null, raiz: HTMLElement): () => void {
  const marcados: Element[] = [];
  const marcar = (el: Element) => {
    if (el === raiz || el.contains(raiz) || el.hasAttribute("inert")) return;
    el.setAttribute("inert", "");
    marcados.push(el);
  };
  if (!alvo) {
    for (const el of document.body.children) marcar(el);
  } else {
    let no: Element = alvo;
    while (no.parentElement && no !== document.body) {
      for (const irmao of no.parentElement.children) if (irmao !== no) marcar(irmao);
      no = no.parentElement;
    }
  }
  return () => {
    for (const el of marcados) el.removeAttribute("inert");
  };
}

export function Tutorial({ userId, enabled }: { userId: string; enabled: boolean }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [i, setI] = useState(0);

  const profile = useQuery({
    queryKey: queryKeys.profile(),
    queryFn: async () =>
      unwrapMaybe("carregar perfil", await supabase.from("profiles").select("*").maybeSingle()),
  });

  // Abre sozinho só para quem ainda não viu (no banco e neste aparelho).
  useEffect(() => {
    if (!enabled || !profile.data || profile.data.tutorial_completed_at) return;
    try {
      if (localStorage.getItem(chaveLocal(userId))) return;
    } catch {
      /* sem armazenamento: decide pelo banco */
    }
    if (!profile.data.onboarding_completed) return;
    setI(0);
    setAberto(true);
  }, [enabled, profile.data, userId]);

  // Rever pelo Menu.
  useEffect(() => {
    const abrir = () => {
      setI(0);
      setAberto(true);
    };
    window.addEventListener(TUTORIAL_EVENT, abrir);
    return () => window.removeEventListener(TUTORIAL_EVENT, abrir);
  }, []);

  // Enquanto aberto, o app sabe (ex.: o deslizar entre abas fica parado).
  useEffect(() => {
    if (!aberto) return;
    document.body.setAttribute("data-tutorial", "");
    return () => document.body.removeAttribute("data-tutorial");
  }, [aberto]);

  const encerrar = useCallback(() => {
    setAberto(false);
    try {
      localStorage.setItem(chaveLocal(userId), "1");
    } catch {
      /* o banco basta */
    }
    if (profile.data && !profile.data.tutorial_completed_at) {
      const agora = new Date().toISOString();
      qc.setQueryData(queryKeys.profile(), { ...profile.data, tutorial_completed_at: agora });
      void supabase
        .from("profiles")
        .update({ tutorial_completed_at: agora })
        .eq("id", profile.data.id)
        .then(() => qc.invalidateQueries({ queryKey: queryKeys.profile() }));
    }
  }, [profile.data, qc, userId]);

  const avancar = useCallback(() => setI((n) => (n >= PASSOS.length - 1 ? n : n + 1)), []);

  if (!aberto) return null;
  const passo = PASSOS[i]!;
  const anterior = PASSOS[i - 1];
  return createPortal(
    <Etapa
      key={i}
      passo={passo}
      indice={i}
      total={PASSOS.length}
      podeVoltar={!!anterior && anterior.tipo === "info" && anterior.tela === passo.tela}
      reabrivel={anterior?.tipo === "toque"}
      onVoltar={() => setI((n) => Math.max(0, n - 1))}
      onAvancar={i === PASSOS.length - 1 ? encerrar : avancar}
      onPular={encerrar}
    />,
    document.body,
  );
}

type Rect = { top: number; left: number; width: number; height: number };

function Etapa({
  passo,
  indice,
  total,
  podeVoltar,
  reabrivel,
  onVoltar,
  onAvancar: avancarDoPai,
  onPular,
}: {
  passo: Passo;
  indice: number;
  total: number;
  podeVoltar: boolean;
  reabrivel: boolean;
  onVoltar: () => void;
  onAvancar: () => void;
  onPular: () => void;
}) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  // Cada etapa avança uma vez só: o toque num item do Menu também muda a rota
  // e dispara o `pularSe` — sem a trava, a etapa seguinte era pulada junto.
  const avancou = useRef(false);
  const onAvancar = useCallback(() => {
    if (avancou.current) return;
    avancou.current = true;
    avancarDoPai();
  }, [avancarDoPai]);
  const raiz = useRef<HTMLDivElement>(null);
  const cartao = useRef<HTMLDivElement>(null);
  const principal = useRef<HTMLButtonElement>(null);
  const [alvo, setAlvo] = useState<HTMLElement | null>(null);
  const [estado, setEstado] = useState<"procurando" | "pronto" | "faltando">(
    passo.alvo.length ? "procurando" : "pronto",
  );
  const [rect, setRect] = useState<Rect | null>(null);
  const [caixa, setCaixa] = useState<Rect | null>(null);
  const tocou = useRef(false);
  const [alturaCartao, setAlturaCartao] = useState(0);
  const tituloId = useId();
  const textoId = useId();
  const ultima = indice === total - 1;

  // Passo que não se aplica a esta tela (ex.: Menu no computador).
  useEffect(() => {
    if (passo.pularSe?.(path)) onAvancar();
  }, [passo, path, onAvancar]);

  // Procura o elemento: espera a tela montar, rola até ele, ou desiste.
  useEffect(() => {
    if (!passo.alvo.length || passo.pularSe?.(path)) return;
    const inicio = Date.now();
    const t = window.setInterval(() => {
      const el = acharAlvo(passo.alvo);
      if (el) {
        const r = el.getBoundingClientRect();
        const foraDaTela = r.top < 72 || r.bottom > window.innerHeight - 96;
        // Itens da barra fixa não rolam; o resto vem para o meio da tela.
        if (foraDaTela && !el.closest("nav, aside")) {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        }
        setAlvo(el);
        setEstado("pronto");
        window.clearInterval(t);
      } else if (Date.now() - inicio > ESPERA_MS) {
        window.clearInterval(t);
        if (passo.opcional) onAvancar();
        else setEstado("faltando");
      }
    }, 150);
    return () => window.clearInterval(t);
  }, [passo, path, onAvancar]);

  // Bloqueio: só o elemento pedido e o tutorial respondem.
  useEffect(() => {
    if (!raiz.current || estado === "procurando") return;
    return bloquearFora(estado === "pronto" ? alvo : null, raiz.current);
  }, [alvo, estado]);

  // Posição do destaque, acompanhando rolagem, giro e mudanças de layout.
  useLayoutEffect(() => {
    if (!alvo) return setRect(null);
    const dentroDeCamada = !!alvo.closest('[role="dialog"], [role="alertdialog"]');
    const medir = () => {
      if (!alvo.isConnected) {
        // O Menu (ou diálogo) fechou sem o toque pedido: volta à etapa que o abre,
        // senão o tour fica preso com o botão de abrir bloqueado.
        if (passo.tipo === "toque" && dentroDeCamada && reabrivel && !tocou.current) onVoltar();
        return;
      }
      const r = areaDoDestaque(alvo, passo.tipo).getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      const c = alvo.getBoundingClientRect();
      setCaixa({ top: c.top, left: c.left, width: c.width, height: c.height });
    };
    medir();
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    const t = window.setInterval(medir, 250);
    return () => {
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
      window.clearInterval(t);
    };
  }, [alvo, passo.tipo, reabrivel, onVoltar]);

  // Passo de toque: avança só quando o toque acontece de verdade.
  useEffect(() => {
    if (passo.tipo !== "toque" || !alvo) return;
    const aoTocar = (e: MouseEvent) => {
      if (e.target instanceof Node && alvo.contains(e.target)) {
        tocou.current = true;
        // Depois do clique seguir seu caminho (navegar, abrir, expandir).
        window.setTimeout(onAvancar, 0);
      }
    };
    document.addEventListener("click", aoTocar, true);
    return () => document.removeEventListener("click", aoTocar, true);
  }, [alvo, passo.tipo, onAvancar]);

  // Foco: no elemento a tocar (teclado aciona com Enter) ou no botão do cartão.
  useLayoutEffect(() => {
    setAlturaCartao(cartao.current?.offsetHeight ?? 0);
    if (estado !== "pronto") return;
    if (passo.tipo === "toque" && alvo) alvo.focus({ preventScroll: true });
    else principal.current?.focus({ preventScroll: true });
  }, [estado, alvo, passo.tipo]);

  // Esc encerra o tour; seta avança só nos passos de explicação.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onPular();
      else if (e.key === "ArrowRight" && passo.tipo === "info" && estado === "pronto") onAvancar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [estado, passo.tipo, onAvancar, onPular]);

  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  let posicao: React.CSSProperties = { top: "50%", transform: "translateY(-50%)" };
  if (caixa && estado === "pronto") {
    const abaixo = caixa.top + caixa.height / 2 < vh / 2;
    const topo = abaixo ? caixa.top + caixa.height + 20 : caixa.top - 20 - alturaCartao;
    posicao = { top: Math.max(12, Math.min(vh - alturaCartao - 12, topo)) };
  }
  const folga = passo.tipo === "toque" ? 10 : 6;

  return (
    // pointer-events explícito: menus e diálogos modais desligam o do body.
    <div ref={raiz} className="fixed inset-0 z-[200]" style={{ pointerEvents: "none" }}>
      {rect && estado === "pronto" ? (
        <div
          aria-hidden
          className={cn(
            "absolute ring-2 ring-primary transition-all duration-300 ease-out",
            passo.tipo === "toque" ? "rounded-full" : "rounded-[1.5rem]",
          )}
          style={{
            top: rect.top - folga,
            left: rect.left - folga,
            width: rect.width + folga * 2,
            height: rect.height + folga * 2,
            boxShadow:
              "0 0 0 9999px rgb(0 0 0 / 0.8), 0 0 24px 6px color-mix(in oklab, var(--primary) 50%, transparent)",
          }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-black/80" />
      )}

      <div
        ref={cartao}
        role="dialog"
        aria-labelledby={tituloId}
        aria-describedby={textoId}
        aria-live="polite"
        className="absolute inset-x-4 mx-auto max-w-sm rounded-[1.5rem] border border-border bg-card p-5 text-card-foreground shadow-2xl transition-[top] duration-300 ease-out"
        style={{ ...posicao, pointerEvents: "auto" }}
      >
        {!passo.alvo.length && <BrandSymbol className="mb-3 w-10" />}
        <p className="text-xs font-semibold tabular-nums text-muted-foreground">
          {indice + 1} de {total}
        </p>
        <h2 id={tituloId} className="mt-1 text-xl font-bold tracking-tight">
          {estado === "faltando" ? "Não encontramos este item" : passo.titulo}
        </h2>
        <p
          id={textoId}
          className="mt-1.5 text-pretty text-[15px] leading-relaxed text-muted-foreground"
        >
          {estado === "faltando"
            ? "Ele não apareceu nesta tela. Você pode pular esta etapa e seguir com o tour."
            : estado === "procurando"
              ? "Um instante…"
              : passo.texto}
        </p>

        {passo.ilustracao === "treino" && estado === "pronto" && <MiniTreino />}

        {passo.tipo === "toque" && estado === "pronto" && (
          <p className="mt-3 text-sm font-semibold text-primary">
            Toque no item destacado para continuar.
          </p>
        )}

        <div className="mt-4 flex items-center gap-2">
          {!ultima && (
            <Button variant="ghost" className="h-11 px-3 text-muted-foreground" onClick={onPular}>
              Pular tutorial
            </Button>
          )}
          <span className="flex-1" />
          {podeVoltar && estado !== "procurando" && (
            <Button variant="outline" className="h-11 rounded-xl" onClick={onVoltar}>
              Voltar
            </Button>
          )}
          {estado === "faltando" ? (
            <Button ref={principal} className="h-11 rounded-xl px-5" onClick={onAvancar}>
              Pular etapa
            </Button>
          ) : passo.tipo === "info" && estado === "pronto" ? (
            <Button ref={principal} className="h-11 rounded-xl px-5" onClick={onAvancar}>
              {ultima ? "Concluir" : indice === 0 ? "Começar" : "Próximo"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Como fica uma série na tela do treino — só ilustração, nada é gravado. */
function MiniTreino() {
  return (
    <div
      aria-hidden
      className="mt-3 overflow-hidden rounded-xl border border-border bg-elevated text-xs"
    >
      <div className="grid grid-cols-[2.5rem_1fr_1fr_2rem] gap-2 border-b border-border/60 px-3 py-1.5 font-semibold text-muted-foreground">
        <span>Série</span>
        <span>Peso</span>
        <span>Reps</span>
        <span />
      </div>
      {[
        ["1", "20 kg", "12", true],
        ["2", "20 kg", "10", false],
      ].map(([serie, peso, reps, feita]) => (
        <div
          key={serie as string}
          className="grid grid-cols-[2.5rem_1fr_1fr_2rem] items-center gap-2 px-3 py-1.5 tabular-nums"
        >
          <span className="font-bold">{serie}</span>
          <span>{peso}</span>
          <span>{reps}</span>
          <span
            className={cn(
              "grid size-6 place-items-center rounded-md",
              feita ? "bg-primary text-primary-foreground" : "bg-card",
            )}
          >
            {feita && <Check className="size-3.5" strokeWidth={3} />}
          </span>
        </div>
      ))}
    </div>
  );
}
