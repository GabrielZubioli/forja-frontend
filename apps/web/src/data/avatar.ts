import { supabase } from "@/integrations/supabase/client";

/**
 * Foto de perfil.
 *
 * ## A coluna guarda duas coisas diferentes
 *
 * `profiles.avatar_url` nasceu povoada pelo `raw_user_meta_data` do OAuth —
 * uma URL pública completa do Google. Agora ela também recebe o **caminho** de
 * um arquivo no bucket privado `avatars`, que não é uma URL e não pode ir
 * direto num `src`.
 *
 * Guardar os dois numa coluna só é uma decisão, não um descuido: a alternativa
 * seria uma segunda coluna e uma migration de dados sobre contas que já
 * existem, para representar a mesma ideia ("a foto desta pessoa"). A regra que
 * distingue os dois casos é estável e cabe numa linha — começa com `http`, é
 * URL externa; qualquer outra coisa é caminho no nosso bucket.
 *
 * Toda leitura passa por `resolveAvatarUrl`, então a regra vive num lugar só.
 */

/** URLs assinadas do avatar duram 1h, como as das fotos de progresso. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export const AVATAR_BUCKET = "avatars";
export const MAX_AVATAR_BYTES = 4 * 1024 * 1024;
export const ACCEPTED_AVATAR_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

/** É uma URL externa (OAuth) e não um caminho no nosso bucket? */
function isExternalUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

/**
 * Transforma o valor guardado em algo que pode ir num `src`.
 *
 * Devolve `null` quando não há foto — e também quando a assinatura falha, para
 * a interface cair no fallback de iniciais em vez de exibir uma imagem
 * quebrada.
 */
export async function resolveAvatarUrl(stored: string | null | undefined): Promise<string | null> {
  if (!stored) return null;
  if (isExternalUrl(stored)) return stored;

  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(stored, SIGNED_URL_TTL_SECONDS);

  return error || !data?.signedUrl ? null : data.signedUrl;
}

/**
 * Envia a nova foto e devolve o caminho a gravar no perfil.
 *
 * O caminho é fixo por usuário (`<uid>/avatar.<ext>`) com `upsert`: um avatar
 * substitui o anterior em vez de acumular arquivos órfãos no bucket. O primeiro
 * segmento **precisa** ser o uid — é o que a policy de Storage verifica.
 */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  if (!ACCEPTED_AVATAR_TYPES.includes(file.type)) {
    throw new Error("Formato não suportado. Envie JPG, PNG, WEBP ou HEIC.");
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error(`Imagem muito grande (máx. ${MAX_AVATAR_BYTES / 1024 / 1024} MB).`);
  }

  const ext =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${userId}/avatar.${ext}`;

  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw new Error(error.message);

  return path;
}

/**
 * Iniciais para quando não há foto.
 *
 * Primeira e última palavra, no máximo duas letras: "Gabriel Zubioli" → "GZ".
 * Um nome de uma palavra vira uma letra só, o que é melhor que duas letras da
 * mesma palavra ("Ga"), que lê como erro.
 */
export function initialsFrom(name: string | null | undefined, fallbackEmail?: string): string {
  const source = name?.trim() || fallbackEmail?.split("@")[0] || "";
  if (!source) return "?";

  const words = source.split(/[\s._-]+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0][0]!.toUpperCase();
  return (words[0][0]! + words[words.length - 1][0]!).toUpperCase();
}
