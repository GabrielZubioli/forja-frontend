import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { MUSCLE_LABELS, label } from "@/lib/labels";
import {
  BODY_OUTLINE,
  MUSCLES_BY_VIEW,
  SILHOUETTE_PARTS,
  VIEW_BOX,
  resolveMuscle,
  type BodyView,
} from "./muscle-paths";

/**
 * Mapa muscular — o que o treino de hoje estimula.
 *
 * ## Como a figura é montada
 *
 * Quatro camadas, nesta ordem:
 *
 * 1. **Silhueta** — cabeça, mãos, pés e articulações, em cinza neutro. Sem ela
 *    a figura teria buracos onde não há músculo mapeado.
 * 2. **Todos os músculos, apagados** — dá relevo anatômico ao corpo mesmo
 *    quando nada está destacado. Sem esta camada o boneco fica chapado e
 *    parece uma sombra, não um corpo.
 * 3. **Músculos ativos** — preenchidos com a cor de destaque.
 * 4. **Contorno** — traçado por cima de tudo, que é o que dá a linha da figura.
 *
 * ## A intensidade importa
 *
 * Um treino de peito recruta tríceps e deltoide anterior, mas não da mesma
 * forma. Pintar os três com a mesma cor diria algo falso; a opacidade acompanha
 * a **contribuição real** (a coluna `contribution` de `exercise_muscles`, 0 a
 * 1), então o peitoral aparece sólido e o tríceps, translúcido. É a diferença
 * entre um gráfico e um enfeite.
 *
 * ## Duas vistas, a primeira escolhida sozinha
 *
 * Um dia de costas abre de costas. Obrigar o usuário a virar a figura para ver
 * o que ele vai treinar é um toque a mais em cada abertura da tela.
 */

export interface MuscleIntensity {
  /** Valor de `muscle_t`. */
  muscle: string;
  /** 0 a 1. */
  intensity: number;
  /** Cor própria do músculo (ex.: fadiga em laranja); sem ela, o verde da marca. */
  color?: string;
}

export function BodyMap({
  muscles,
  className,
  showLegend = true,
  showToggle = true,
  size = "md",
}: {
  muscles: readonly MuscleIntensity[];
  className?: string;
  showLegend?: boolean;
  showToggle?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  /** Intensidade por grupo desenhável, já resolvendo os apelidos. */
  const corDoGrupo = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const m of muscles) {
      const grupo = resolveMuscle(m.muscle);
      if (grupo && m.color && !mapa.has(grupo)) mapa.set(grupo, m.color);
    }
    return mapa;
  }, [muscles]);
  const porGrupo = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const m of muscles) {
      const grupo = resolveMuscle(m.muscle);
      if (!grupo) continue;
      // Fica com o **maior** valor, não a soma: vários músculos do banco podem
      // apontar para o mesmo grupo desenhado (costas + dorsais), e somar
      // saturaria justamente os que têm mais apelidos.
      mapa.set(grupo, Math.max(mapa.get(grupo) ?? 0, m.intensity));
    }
    return mapa;
  }, [muscles]);

  /** Vista com mais estímulo. Empate vai para a frente, leitura mais familiar. */
  const vistaSugerida = useMemo<BodyView>(() => {
    const soma = (view: BodyView) =>
      Object.keys(MUSCLES_BY_VIEW[view]).reduce((s, m) => s + (porGrupo.get(m) ?? 0), 0);
    return soma("back") > soma("front") * 1.05 ? "back" : "front";
  }, [porGrupo]);

  const [escolhida, setEscolhida] = useState<BodyView | null>(null);
  // Enquanto o usuário não escolher, a vista acompanha o treino selecionado.
  const view = escolhida ?? vistaSugerida;

  const destacados = [...porGrupo.entries()].sort((a, b) => b[1] - a[1]);

  const altura = { sm: "h-40", md: "h-56 sm:h-64", lg: "h-72 sm:h-80" }[size];

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div className="relative">
        <svg
          viewBox={VIEW_BOX[view]}
          className={cn("w-auto", altura)}
          role="img"
          aria-label={
            destacados.length > 0
              ? `Músculos trabalhados: ${destacados.map(([m]) => label(MUSCLE_LABELS, m)).join(", ")}`
              : "Nenhum músculo destacado"
          }
        >
          {/* 1 — silhueta */}
          {SILHOUETTE_PARTS[view].map((d, i) => (
            <path key={`sil-${i}`} d={d} fill="var(--body-fill)" />
          ))}

          {/* 2 — músculos apagados, num tom levemente distinto da silhueta.
               É essa diferença mínima que dá relevo ao corpo: com o mesmo tom
               dos dois lados, o boneco vira uma sombra chapada. */}
          {Object.entries(MUSCLES_BY_VIEW[view]).map(([muscle, paths]) =>
            paths.map((d, i) => (
              <path key={`base-${muscle}-${i}`} d={d} fill="var(--body-relief)" />
            )),
          )}

          {/* 3 — músculos ativos */}
          {Object.entries(MUSCLES_BY_VIEW[view]).map(([muscle, paths]) => {
            const intensidade = porGrupo.get(muscle) ?? 0;
            if (intensidade <= 0) return null;

            // Piso de 0,35: um músculo com contribuição 0,1 ficaria invisível, e
            // "quase não aparece" não é a mesma informação que "não trabalha".
            const opacidade = 0.35 + Math.min(1, intensidade) * 0.65;

            return paths.map((d, i) => (
              <path
                key={`on-${muscle}-${i}`}
                d={d}
                fill={corDoGrupo.get(muscle) ?? "var(--primary)"}
                opacity={opacidade}
                className="transition-opacity duration-500 motion-reduce:transition-none"
              />
            ));
          })}

          {/* 4 — contorno por cima, que é o que dá a linha da figura */}
          <path
            d={BODY_OUTLINE[view]}
            fill="none"
            stroke="var(--muted-foreground)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.45}
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {showToggle && (
          <div className="absolute inset-x-0 -bottom-2 flex justify-center">
            <div className="inline-flex rounded-full border border-border bg-card p-0.5 shadow-sm">
              {(["front", "back"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setEscolhida(v)}
                  aria-pressed={view === v}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    view === v
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {v === "front" ? "Frente" : "Costas"}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {showLegend && destacados.length > 0 && (
        <ul className="mt-7 flex flex-wrap justify-center gap-1.5">
          {destacados.slice(0, 6).map(([m, intensidade]) => {
            const principal = intensidade >= 0.75;
            return (
              <li
                key={m}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium",
                  principal ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                {label(MUSCLE_LABELS, m)}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Agrega as contribuições de uma lista de exercícios num conjunto de
 * intensidades normalizado.
 *
 * A normalização é pelo **máximo**, não pela soma: o que interessa é a
 * proporção entre os músculos daquele treino. Dividir pela soma faria um treino
 * de seis exercícios parecer inteiro mais fraco que um de dois.
 */
export function aggregateMuscleIntensities(
  contributions: readonly { muscle: string; contribution: number }[],
): MuscleIntensity[] {
  const soma = new Map<string, number>();
  for (const c of contributions) {
    soma.set(c.muscle, (soma.get(c.muscle) ?? 0) + c.contribution);
  }

  const maximo = Math.max(...soma.values(), 1);
  return [...soma.entries()].map(([muscle, valor]) => ({
    muscle,
    intensity: valor / maximo,
  }));
}
