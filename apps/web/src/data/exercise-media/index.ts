import {
  createFreeExerciseDbProvider,
  createGymVisualProvider,
  type ExerciseMedia,
  type ExerciseMediaProvider,
  type ExerciseMediaProviderId,
  type MediaLookup,
} from "./providers";
import { exerciseSlugByName } from "./name-index";

export type { ExerciseMedia, MediaAttribution, MediaLookup } from "./providers";

/**
 * Resolvedor de mídia dos exercícios.
 *
 * ## O contrato
 *
 * Componentes nunca montam URL. Eles pedem `exerciseMedia(exercicio)` e
 * recebem `{ images, gif, video, attribution }`. Trocar a fonte da mídia — por
 * decisão de licença, custo ou qualidade — é mudar a ordem em `PROVIDER_ORDER`
 * e nada mais.
 *
 * ## A ordem importa, e não é arbitrária
 *
 * 1. **Vínculo explícito** (`media_source` + `media_id`). Uma decisão do
 *    pipeline de catálogo, e por isso a mais forte.
 * 2. **Imagens gravadas** (`image_urls`) — upload próprio ou resíduo de um seed
 *    anterior.
 * 3. **Provedores externos**, na ordem configurada, até algum reconhecer o
 *    exercício.
 * 4. **Casamento por nome** na free-exercise-db, para exercícios sem
 *    identificador externo nenhum — inclusive os criados pelo usuário.
 * 5. **Busca em vídeo** pelo nome. Último recurso, e deliberadamente uma busca
 *    e não um vídeo específico: o app não tem licença sobre nenhum vídeo de
 *    execução, e fingir curadoria que não existe seria pior que mandar a
 *    pessoa a uma busca que ela faria de qualquer jeito.
 *
 * Nenhum passo devolve lista vazia por preguiça: cada um só desiste quando
 * realmente não conhece o exercício.
 */

/**
 * Fontes de mídia ativas, em ordem de preferência.
 *
 * Hoje só a **free-exercise-db**: duas fotos por exercício (início e fim do
 * movimento), domínio público, sem exigência de atribuição nem de licença
 * própria para uso comercial.
 *
 * O provedor `gymvisual` continua implementado em `providers.ts`, mas **fora
 * desta lista** — o projeto decidiu não distribuir aquela mídia. Foi para
 * exatamente isto que a camada existe: desligar uma fonte é remover um item
 * daqui, sem tocar em componente nenhum.
 *
 * Para religá-lo seria preciso, além de acrescentar o id de volta, repovoar
 * `media_source`/`media_id` no banco — ver
 * `supabase/migrations/20260810160000_revert_gymvisual_media.sql`, que traz o
 * comando de reversão.
 */
const PROVIDER_ORDER: ExerciseMediaProviderId[] = ["free-exercise-db"];

const PROVIDERS: Record<ExerciseMediaProviderId, ExerciseMediaProvider> = {
  gymvisual: createGymVisualProvider(),
  "free-exercise-db": createFreeExerciseDbProvider(),
};

const FREE_DB_CDN = "https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises";

/**
 * A fonte está ligada?
 *
 * Existe porque o vínculo explícito de um exercício (`media_source` no banco)
 * é resolvido antes da lista de provedores, e por isso poderia contornar o
 * desligamento: uma linha antiga apontando para uma fonte removida continuaria
 * montando URLs para ela. Um provedor desligado precisa ficar inalcançável por
 * **todos** os caminhos, não só pelo principal — senão o "interruptor" não é
 * interruptor, é sugestão.
 */
function isEnabled(source: string): source is ExerciseMediaProviderId {
  return (PROVIDER_ORDER as string[]).includes(source);
}

/** Vazio, mas válido: evita `null` espalhando checagem por todo componente. */
const SEM_MIDIA: ExerciseMedia = {
  images: [],
  gif: null,
  video: null,
  attribution: { label: null, href: null },
  provider: "free-exercise-db",
};

export function exerciseMedia(lookup: MediaLookup): ExerciseMedia {
  /*
   * 1. Vínculo explícito com uma fonte.
   *
   * Vem antes de `image_urls` de propósito. O catálogo curado tem as duas
   * coisas: fotos estáticas gravadas por um seed antigo **e** um vínculo com a
   * mídia animada, feito depois pelo pipeline. Se as fotos vencessem, o
   * vínculo novo nunca apareceria na tela — o trabalho de casamento existiria
   * no banco e não no app.
   *
   * A regra distingue as duas naturezas: `media_source` é uma decisão
   * deliberada do pipeline; `image_urls` é o que sobrou de antes.
   */
  if (lookup.mediaSource && isEnabled(lookup.mediaSource)) {
    const provider = PROVIDERS[lookup.mediaSource as ExerciseMediaProviderId];
    const media = provider?.resolve(lookup);
    if (media) return lookup.videoUrl ? { ...media, video: lookup.videoUrl } : media;
  }

  // 2. Imagens gravadas para este exercício (upload próprio ou seed anterior).
  if (lookup.imageUrls && lookup.imageUrls.length > 0) {
    return {
      images: [...lookup.imageUrls],
      gif: null,
      video: lookup.videoUrl ?? null,
      attribution: { label: null, href: null },
      provider: "free-exercise-db",
    };
  }

  // 3. Provedores externos, na ordem configurada.
  for (const id of PROVIDER_ORDER) {
    const media = PROVIDERS[id].resolve(lookup);
    if (media) {
      // Um vídeo gravado no banco continua valendo mesmo quando a imagem vem
      // de fora — são coisas independentes.
      return lookup.videoUrl ? { ...media, video: lookup.videoUrl } : media;
    }
  }

  // 4. Casamento por nome: a única saída para exercícios criados pelo usuário,
  //    que não têm identificador externo nenhum.
  const slug = exerciseSlugByName(lookup.name);
  if (slug) {
    return {
      images: [`${FREE_DB_CDN}/${slug}/0.jpg`, `${FREE_DB_CDN}/${slug}/1.jpg`],
      gif: null,
      video: lookup.videoUrl ?? null,
      attribution: { label: null, href: null },
      provider: "free-exercise-db",
    };
  }

  return lookup.videoUrl ? { ...SEM_MIDIA, video: lookup.videoUrl } : SEM_MIDIA;
}

/**
 * Busca de vídeo pelo nome do exercício.
 *
 * O último recurso, e deliberadamente uma busca e não um vídeo específico: o
 * app não tem licença sobre nenhum vídeo de execução, e fingir curadoria que
 * não existe seria pior que enviar a pessoa a uma busca que ela faria de
 * qualquer forma.
 */
export function videoSearchUrl(name: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} execução correta`)}`;
}

/**
 * Compatibilidade com o módulo anterior.
 *
 * Várias telas ainda chamam `exerciseImages(nome, urlsDoBanco)`. Mantê-la aqui
 * como fachada evita uma alteração em massa no mesmo commit que introduz a
 * camada — e o corpo dela é uma linha, então não há lógica duplicada.
 */
export function exerciseImages(name: string, fromDatabase?: readonly string[] | null): string[] {
  return exerciseMedia({ name, imageUrls: fromDatabase }).images;
}
