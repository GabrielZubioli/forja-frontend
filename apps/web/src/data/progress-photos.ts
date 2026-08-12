import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fotos de evolução — acesso e URLs assinadas.
 *
 * ## Privacidade
 *
 * O bucket `progress-photos` é privado e a policy de Storage exige que o
 * primeiro segmento do caminho seja o `uid` de quem pede. Não existe URL
 * pública destas imagens em lugar nenhum: toda exibição passa por uma URL
 * assinada, temporária e emitida para a sessão atual.
 *
 * Isso não é excesso de zelo. São fotos do corpo de alguém, quase sempre em
 * roupa de baixo, guardadas por anos. É o dado mais sensível que este app
 * toca — e o único cuja exposição não tem conserto depois.
 */

export const PHOTOS_BUCKET = "progress-photos";

/** URLs assinadas duram 1h; renovar aos 50 min evita imagens quebradas em sessões longas. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const SIGNED_URL_REFRESH_MS = 50 * 60 * 1000;

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

export type ProgressPhoto = {
  id: string;
  log_date: string;
  angle: string | null;
  storage_path: string;
  weight_kg: number | string | null;
  notes: string | null;
};

/**
 * Assina em lote os caminhos recebidos e mantém as URLs válidas.
 *
 * ## Por que um hook e não uma `useQuery`
 *
 * O que expira aqui não é o dado — é a **credencial** de leitura. Uma query
 * normal manteria a resposta em cache e continuaria servindo URLs mortas depois
 * de uma hora com a aba aberta; foi exatamente esse o bug que a galeria já
 * teve. O intervalo renova antes do vencimento, independentemente de haver ou
 * não invalidação de cache.
 *
 * A assinatura é **em lote**: uma requisição para todas as fotos, não uma por
 * miniatura. Numa galeria de sessenta fotos a diferença é de uma chamada contra
 * sessenta.
 */
export function useSignedPhotoUrls(paths: readonly string[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});

  // A lista de caminhos é recriada a cada render pelo chamador; sem esta
  // estabilização o efeito reassinaria tudo a cada renderização.
  const chave = paths.join("|");

  const assinar = useCallback(async () => {
    if (paths.length === 0) {
      setUrls({});
      return;
    }

    const { data, error } = await supabase.storage
      .from(PHOTOS_BUCKET)
      .createSignedUrls([...paths], SIGNED_URL_TTL_SECONDS);
    if (error || !data) return;

    setUrls(() => {
      const next: Record<string, string> = {};
      data.forEach((assinada, i) => {
        if (assinada.signedUrl) next[paths[i]] = assinada.signedUrl;
      });
      return next;
    });
    // `chave` é a identidade real da lista; `paths` muda de referência sem
    // mudar de conteúdo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  useEffect(() => {
    void assinar();
    const timer = setInterval(() => void assinar(), SIGNED_URL_REFRESH_MS);
    return () => clearInterval(timer);
  }, [assinar]);

  return urls;
}

/** Agrupa as fotos por data, da mais recente para a mais antiga. */
export type PhotoSession = {
  date: string;
  photos: ProgressPhoto[];
  /** Peso registrado junto da sessão, quando houver. */
  weightKg: number | null;
};

/**
 * Uma "sessão" é o conjunto de fotos do mesmo dia.
 *
 * É essa a unidade que a pessoa reconhece — ninguém pensa "minha foto de frente
 * de 12 de agosto", pensa "minhas fotos de agosto". A timeline e a comparação
 * trabalham em cima de sessões; a galeria continua vendo fotos individuais.
 */
export function groupByDate(photos: readonly ProgressPhoto[]): PhotoSession[] {
  const porData = new Map<string, ProgressPhoto[]>();

  for (const foto of photos) {
    const lista = porData.get(foto.log_date);
    if (lista) lista.push(foto);
    else porData.set(foto.log_date, [foto]);
  }

  return [...porData.entries()]
    .map(([date, lista]) => ({
      date,
      photos: lista,
      // Basta uma das fotos do dia carregar o peso — foi registrado uma vez
      // para a sessão inteira.
      weightKg: firstWeight(lista),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function firstWeight(photos: readonly ProgressPhoto[]): number | null {
  for (const foto of photos) {
    if (foto.weight_kg != null) {
      const valor = Number(foto.weight_kg);
      if (Number.isFinite(valor)) return valor;
    }
  }
  return null;
}

/** Ordem canônica dos ângulos, para as fotos do dia sempre aparecerem na mesma sequência. */
const ORDEM_ANGULOS = ["front", "back", "side_left", "side_right", "side"];

export function sortByAngle(photos: readonly ProgressPhoto[]): ProgressPhoto[] {
  return [...photos].sort((a, b) => {
    const ia = ORDEM_ANGULOS.indexOf(a.angle ?? "");
    const ib = ORDEM_ANGULOS.indexOf(b.angle ?? "");
    // Ângulo desconhecido vai para o fim em vez de para o começo, que é onde
    // o `-1` do `indexOf` o colocaria.
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

/** Hook de conveniência: agrupa e ordena numa passada só, memoizado. */
export function usePhotoSessions(photos: readonly ProgressPhoto[] | undefined): PhotoSession[] {
  return useMemo(() => {
    if (!photos) return [];
    return groupByDate(photos).map((s) => ({ ...s, photos: sortByAngle(s.photos) }));
  }, [photos]);
}

/** Valida o arquivo antes de gastar rede com um upload que o bucket recusaria. */
export function validatePhotoFile(file: File): void {
  // `accept` no input é apenas uma dica ao seletor do sistema; validar aqui.
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    throw new Error("Formato não suportado. Envie JPG, PNG, WEBP ou HEIC.");
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new Error(`Arquivo muito grande (máx. ${MAX_PHOTO_BYTES / 1024 / 1024} MB).`);
  }
}

/** Caminho no bucket. O primeiro segmento **precisa** ser o uid: é o que a policy verifica. */
export function photoStoragePath(userId: string, angle: string, fileName: string): string {
  const ext =
    fileName
      .split(".")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "jpg";
  return `${userId}/${Date.now()}-${angle}.${ext}`;
}
