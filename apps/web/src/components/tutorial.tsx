/**
 * Tutorial de boas-vindas.
 *
 * Mostrado uma vez, na Início, para quem acabou de entrar. Cada etapa destaca
 * o controle de verdade — o resto da tela escurece e fica bloqueado (overlay
 * por cima e `inert` no app) — e só os botões do tutorial respondem. Concluir
 * ou pular grava `profiles.tutorial_completed_at`: não volta sozinho, nem em
 * outro aparelho.
 *
 * O alvo de cada etapa é o primeiro elemento **visível** da lista: no celular
 * a barra de baixo, no computador a lateral. Sem alvo visível, a etapa vira um
 * cartão centralizado — nunca uma etapa presa sem saída.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { unwrapMaybe } from "@/data/supabase-helpers";
import { queryKeys } from "@/data/query-keys";
import { Button } from "@/components/ui/button";
import { BrandSymbol } from "@/components/brand-logo";

type Etapa = {
  /** Seletores do alvo, em ordem de preferência; vazio = cartão central. */
  alvo: string[];
  titulo: string;
  texto: string;
};

const ETAPAS: Etapa[] = [
  {
    alvo: [],
    titulo: "Bem-vindo ao Habitual Fit",
    texto:
      "Um tour rápido pelas áreas principais. O app organiza e acompanha seus treinos e hábitos — não substitui a orientação de profissionais de saúde.",
  },
  {
    alvo: ['[data-tour="nav-dashboard"]'],
    titulo: "Início",
    texto: "Seu dia num olhar: o treino de hoje, a sequência de dias e o resumo da dieta.",
  },
  {
    alvo: ['[data-tour="nav-treinar"]'],
    titulo: "Treinar",
    texto: "Comece o treino do dia por aqui e registre séries, cargas e descansos.",
  },
  {
    alvo: ['[data-tour="nav-plan"]'],
    titulo: "Plano",
    texto:
      "Suas rotinas e os dias da semana. Crie, edite, exclua ou troque pelo plano sugerido quando quiser.",
  },
  {
    alvo: ['[data-tour="nav-exercises"]', '[data-tour="nav-menu"]'],
    titulo: "Exercícios e Estatísticas",
    texto:
      "Na biblioteca você vê como fazer cada exercício e salva favoritos; nas Estatísticas, acompanha sua evolução.",
  },
  {
    alvo: ['[data-tour="nav-diet"]'],
    titulo: "Dieta",
    texto:
      "Monte suas refeições e registre o que comer. O app não prescreve dieta — siga a orientação do seu nutricionista.",
  },
  {
    alvo: [],
    titulo: "Tudo pronto!",
    texto: "Bons treinos. Você pode rever este tour quando quiser, no Menu.",
  },
];

/** Pedido de rever o tour (Menu → Ver tutorial). */
export const TUTORIAL_EVENT = "habitual:tutorial";

const chaveLocal = (userId: string) => `hf:tutorial-visto:${userId}`;

function visivel(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
}

function acharAlvo(seletores: string[]): Element | null {
  for (const s of seletores) {
    const el = [...document.querySelectorAll(s)].find(visivel);
    if (el) return el;
  }
  return null;
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

  if (!aberto) return null;
  return createPortal(
    <Overlay
      etapa={ETAPAS[i]!}
      indice={i}
      total={ETAPAS.length}
      onVoltar={() => setI((n) => Math.max(0, n - 1))}
      onAvancar={() => (i === ETAPAS.length - 1 ? encerrar() : setI((n) => n + 1))}
      onPular={encerrar}
    />,
    document.body,
  );
}

type Rect = { top: number; left: number; width: number; height: number };
const FOLGA = 6;

function Overlay({
  etapa,
  indice,
  total,
  onVoltar,
  onAvancar,
  onPular,
}: {
  etapa: Etapa;
  indice: number;
  total: number;
  onVoltar: () => void;
  onAvancar: () => void;
  onPular: () => void;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const principal = useRef<HTMLButtonElement>(null);
  const cartao = useRef<HTMLDivElement>(null);
  const [alvo, setAlvo] = useState<Rect | null>(null);
  const [alturaCartao, setAlturaCartao] = useState(0);
  const tituloId = useId();
  const textoId = useId();
  const ultima = indice === total - 1;

  // O resto do app fica inerte: nem clique, nem foco por teclado.
  useEffect(() => {
    const outros = [...document.body.children].filter(
      (el) => el !== raiz.current && !el.hasAttribute("inert"),
    );
    for (const el of outros) el.setAttribute("inert", "");
    return () => {
      for (const el of outros) el.removeAttribute("inert");
    };
  }, []);

  // Posição do alvo, acompanhando rolagem, giro de tela e redimensionamento.
  useLayoutEffect(() => {
    const medir = () => {
      const el = acharAlvo(etapa.alvo);
      if (!el) return setAlvo(null);
      const r = el.getBoundingClientRect();
      setAlvo({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    medir();
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    const t = window.setInterval(medir, 400);
    return () => {
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
      window.clearInterval(t);
    };
  }, [etapa]);

  useLayoutEffect(() => {
    setAlturaCartao(cartao.current?.offsetHeight ?? 0);
    principal.current?.focus();
  }, [etapa]);

  // Teclado: Esc pula, setas navegam.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onPular();
      else if (e.key === "ArrowRight") onAvancar();
      else if (e.key === "ArrowLeft" && indice > 0) onVoltar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [indice, onAvancar, onPular, onVoltar]);

  // O cartão vai do lado com mais espaço — acima de um alvo na barra de baixo,
  // abaixo de um no topo — e nunca sai da tela.
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  let posicao: React.CSSProperties = { top: "50%", transform: "translateY(-50%)" };
  if (alvo) {
    const abaixo = alvo.top + alvo.height / 2 < vh / 2;
    const topo = abaixo
      ? alvo.top + alvo.height + FOLGA + 14
      : alvo.top - FOLGA - 14 - alturaCartao;
    posicao = { top: Math.max(16, Math.min(vh - alturaCartao - 16, topo)) };
  }

  return (
    <div
      ref={raiz}
      className="fixed inset-0 z-[200]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={tituloId}
      aria-describedby={textoId}
    >
      {/* Bloqueia toda interação fora dos botões do tutorial. */}
      <div className="absolute inset-0" aria-hidden />

      {alvo ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-2xl ring-[3px] ring-primary transition-all duration-300 ease-out"
          style={{
            top: alvo.top - FOLGA,
            left: alvo.left - FOLGA,
            width: alvo.width + FOLGA * 2,
            height: alvo.height + FOLGA * 2,
            boxShadow:
              "0 0 0 9999px rgb(0 0 0 / 0.78), 0 0 28px 6px color-mix(in oklab, var(--primary) 55%, transparent)",
          }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-black/78" />
      )}

      <div
        ref={cartao}
        className="absolute inset-x-4 mx-auto max-w-sm rounded-[1.5rem] border border-border bg-card p-5 text-card-foreground shadow-2xl transition-[top] duration-300 ease-out"
        style={posicao}
      >
        {!alvo && <BrandSymbol className="mb-3 w-10" />}
        <p className="text-xs font-semibold tabular-nums text-muted-foreground">
          {indice + 1} de {total}
        </p>
        <h2 id={tituloId} className="mt-1 text-xl font-bold tracking-tight">
          {etapa.titulo}
        </h2>
        <p
          id={textoId}
          className="mt-1.5 text-pretty text-[15px] leading-relaxed text-muted-foreground"
        >
          {etapa.texto}
        </p>

        <div className="mt-4 flex items-center gap-2">
          {!ultima && (
            <Button variant="ghost" className="h-11 px-3 text-muted-foreground" onClick={onPular}>
              Pular
            </Button>
          )}
          <span className="flex-1" />
          {indice > 0 && (
            <Button variant="outline" className="h-11 rounded-xl" onClick={onVoltar}>
              Voltar
            </Button>
          )}
          <Button ref={principal} className="h-11 rounded-xl px-5" onClick={onAvancar}>
            {ultima ? "Concluir" : indice === 0 ? "Começar" : "Próximo"}
          </Button>
        </div>
      </div>
    </div>
  );
}
