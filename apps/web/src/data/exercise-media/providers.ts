/**
 * De onde vem a mídia dos exercícios.
 *
 * ## Por que existe uma camada
 *
 * Antes, a URL da CDN estava escrita dentro do módulo que resolvia imagens, e
 * os componentes montavam `src` a partir dela. Trocar de fonte significaria
 * caçar concatenação de string por toda a aplicação.
 *
 * O motivo real, porém, não é elegância: é **licença**. A mídia deste app vem
 * de fontes com condições diferentes, e essas condições mudam. Uma fonte pode
 * precisar sair de circulação de um dia para o outro — e isso precisa ser uma
 * troca de configuração, não uma refatoração.
 *
 * ## Os provedores
 *
 * - `free-exercise-db` — domínio público (Unlicense). Duas fotos por exercício,
 *   início e fim do movimento. É o padrão seguro: pode ser usado em qualquer
 *   contexto, inclusive comercial, sem atribuição.
 * - `gymvisual` — o dataset de 1.324 exercícios com GIFs animados. A mídia é
 *   © Gym visual, redistribuída no repositório de origem com permissão do
 *   detentor, **limitada a 180×180 e condicionada a manter a atribuição**. O
 *   `NOTICE.md` da fonte é explícito: clonar o repositório não concede licença
 *   sobre a mídia, e o uso próprio deve ser licenciado direto com a Gym visual.
 *
 * O provedor ativo é decidido em `config.ts`, num lugar só.
 */

export type ExerciseMediaProviderId = "free-exercise-db" | "gymvisual";

/** Como uma mídia deve ser creditada onde ela aparece. */
export type MediaAttribution = {
  /** Texto exibido junto da imagem. `null` = não exige crédito visível. */
  label: string | null;
  href: string | null;
};

export type ExerciseMedia = {
  /** Quadros estáticos do movimento. Pode ser vazio. */
  images: string[];
  /** Animação do movimento, quando a fonte oferece. */
  gif: string | null;
  /** Vídeo próprio do exercício, quando houver. */
  video: string | null;
  attribution: MediaAttribution;
  provider: ExerciseMediaProviderId;
};

/** Identificadores que um exercício carrega e que permitem achar sua mídia. */
export type MediaLookup = {
  /** Nome em português, usado no casamento por similaridade. */
  name: string;
  /** `image_urls` do banco — imagens gravadas para este exercício. */
  imageUrls?: readonly string[] | null;
  /** Identificador da mídia na fonte externa (`media_id` do dataset). */
  mediaId?: string | null;
  /** Identificador do exercício na **nossa** base. */
  externalId?: string | null;
  /**
   * Identificador do exercício **na fonte de mídia**, quando difere do nosso.
   *
   * O catálogo curado tem `external_id` como `Barbell_Squat` (a pasta na
   * free-exercise-db), mas a mídia animada é indexada por número
   * (`gymvisual:0043`). Sem esta coluna separada, ligar um ao outro exigiria
   * sobrescrever o `external_id` — e é ele que o histórico de treino e os
   * seeds usam para achar o exercício.
   */
  mediaRef?: string | null;
  /**
   * Fonte declarada explicitamente para este exercício.
   *
   * Quando presente, vence as `imageUrls` gravadas: é um vínculo deliberado
   * feito pelo pipeline de catálogo, enquanto `image_urls` costuma ser o
   * resíduo de um seed anterior.
   */
  mediaSource?: string | null;
  /** Vídeo próprio já gravado no banco. */
  videoUrl?: string | null;
};

export interface ExerciseMediaProvider {
  readonly id: ExerciseMediaProviderId;
  readonly attribution: MediaAttribution;
  /**
   * Devolve a mídia, ou `null` quando esta fonte não conhece o exercício —
   * o que permite ao resolvedor tentar a próxima.
   */
  resolve(lookup: MediaLookup): ExerciseMedia | null;
}

/**
 * free-exercise-db — domínio público.
 *
 * Duas fotos por exercício (`0.jpg` e `1.jpg`): início e fim do movimento.
 * Alternadas, comunicam a execução quase tão bem quanto um GIF, e sem nenhuma
 * restrição de uso.
 */
export function createFreeExerciseDbProvider(): ExerciseMediaProvider {
  const CDN = "https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises";

  return {
    id: "free-exercise-db",
    // Unlicense: dispensa crédito. `null` aqui não é esquecimento — é a
    // diferença entre "não precisa" e "precisa e não foi feito".
    attribution: { label: null, href: null },

    resolve({ externalId }) {
      if (!externalId) return null;
      const slug = externalId.startsWith("free:") ? externalId.slice(5) : externalId;
      // Os ids da free-exercise-db são nomes de pasta; um id de outra fonte
      // (numérico, do gymvisual) produziria uma URL 404.
      if (/^\d+$/.test(slug)) return null;

      return {
        images: [`${CDN}/${slug}/0.jpg`, `${CDN}/${slug}/1.jpg`],
        gif: null,
        video: null,
        attribution: { label: null, href: null },
        provider: "free-exercise-db",
      };
    },
  };
}

/**
 * Gym visual, via o dataset `hasaneyldrm/exercises-dataset`.
 *
 * ## Condições de uso
 *
 * A mídia **não** é coberta pela licença MIT do repositório. Ela é propriedade
 * da Gym visual, redistribuída ali com permissão escrita do detentor, sob duas
 * condições que este provedor respeita:
 *
 * 1. Resolução limitada a 180×180 — é a única que a fonte publica, e não há
 *    upscaling em lugar nenhum do app.
 * 2. Atribuição visível: "© Gym visual". Ela vem preenchida aqui e é o
 *    componente de exibição que a coloca na tela.
 *
 * Quem for distribuir o app deve obter licença própria com a Gym visual.
 */
export function createGymVisualProvider(): ExerciseMediaProvider {
  const CDN = "https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@main";
  const ATTRIBUTION: MediaAttribution = {
    label: "© Gym visual",
    href: "https://gymvisual.com/",
  };

  return {
    id: "gymvisual",
    attribution: ATTRIBUTION,

    resolve({ externalId, mediaRef, mediaId }) {
      // `mediaRef` tem prioridade: é o identificador **nesta fonte**, gravado
      // justamente para os exercícios cujo `external_id` aponta para outro
      // lugar. Sem ele, cai no `external_id`, que é o caso dos 1.324
      // importados diretamente.
      const referencia = mediaRef ?? externalId;

      // O nome do arquivo combina os dois identificadores
      // (`0001-2gPfomN.gif`), então um sem o outro não resolve nada.
      if (!referencia || !mediaId) return null;
      const numericId = referencia.startsWith("gymvisual:") ? referencia.slice(10) : referencia;
      if (!/^\d+$/.test(numericId)) return null;

      const base = `${numericId}-${mediaId}`;
      return {
        images: [`${CDN}/images/${base}.jpg`],
        gif: `${CDN}/videos/${base}.gif`,
        video: null,
        attribution: ATTRIBUTION,
        provider: "gymvisual",
      };
    },
  };
}
