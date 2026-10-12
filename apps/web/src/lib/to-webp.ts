/**
 * Converte uma imagem para WebP antes do upload.
 *
 * Foto de celular sai com 3–8 MB em JPEG; em WebP, com o lado maior limitado a
 * 1600 px, fica em ~200–400 KB sem diferença visível numa tela de celular —
 * upload mais rápido, menos armazenamento e telas que carregam antes.
 *
 * Se o navegador não consegue ler o arquivo (HEIC fora do Safari) ou não
 * sabe gerar WebP, devolve o arquivo original: a conversão é otimização, não
 * requisito, e nunca pode impedir o envio.
 */
export async function toWebp(file: File, maxSide = 1600, quality = 0.82): Promise<File> {
  if (file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * escala);
    const h = Math.round(bitmap.height * escala);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/webp", quality));
    // Navegador sem encoder WebP devolve PNG: aí o original é melhor.
    if (!blob || blob.type !== "image/webp") return file;
    // Imagem já pequena e otimizada pode crescer ao recodificar.
    if (blob.size >= file.size && file.type === "image/webp") return file;

    const nome = file.name.replace(/\.[^.]+$/, "") || "imagem";
    return new File([blob], `${nome}.webp`, { type: "image/webp" });
  } catch {
    return file;
  }
}
