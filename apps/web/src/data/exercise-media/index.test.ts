import { describe, expect, it } from "vitest";
import { exerciseImages, exerciseMedia, videoSearchUrl } from "./index";

/**
 * O que estes testes protegem.
 *
 * A camada de mídia resolve por precedência, e cada degrau existe por um motivo
 * diferente. Quebrar a ordem não gera erro: gera a imagem *errada* na tela, ou
 * nenhuma — falhas que só aparecem olhando o app, e só em alguns exercícios.
 *
 * O primeiro bloco é o mais importante. O projeto decidiu **não** distribuir a
 * mídia do `exercises-dataset`, e uma decisão dessas se perde em silêncio: um
 * caminho de resolução esquecido continua montando URLs para a fonte
 * desligada, nada quebra, nada avisa, e o app volta a servir imagem de
 * terceiro sem que ninguém perceba.
 */
describe("exerciseMedia — a fonte desligada é inalcançável", () => {
  /*
   * O projeto decidiu não distribuir a mídia do `exercises-dataset`. O
   * provedor continua implementado, mas fora de `PROVIDER_ORDER`.
   *
   * Estes testes existem porque "desligado" tem mais de um caminho para falhar:
   * a lista de provedores é só o principal. Um exercício com `media_source`
   * gravado no banco resolve **antes** dela, e sem a verificação de habilitado
   * continuaria montando URLs para uma fonte que ninguém deveria estar usando.
   */
  it("não usa a fonte desligada nem quando o exercício aponta explicitamente para ela", () => {
    const media = exerciseMedia({
      name: "Agachamento Livre",
      mediaSource: "gymvisual",
      mediaRef: "gymvisual:0043",
      mediaId: "abc123",
      externalId: "Barbell_Squat",
    });

    expect(media.provider).not.toBe("gymvisual");
    expect(media.gif).toBeNull();
    expect(JSON.stringify(media)).not.toContain("exercises-dataset");
  });

  it("nenhuma mídia resolvida aponta para a CDN da fonte desligada", () => {
    const casos = [
      { name: "Supino Reto com Barra" },
      { name: "Rosca Direta com Barra", externalId: "Barbell_Curl" },
      { name: "Abdominal Supra", externalId: "gymvisual:0001", mediaId: "2gPfomN" },
      { name: "Movimento Inventado Xyz" },
    ];

    for (const caso of casos) {
      expect(JSON.stringify(exerciseMedia(caso))).not.toContain("exercises-dataset");
    }
  });
});

describe("exerciseMedia — precedência das fontes", () => {
  it("imagens gravadas vencem as fontes externas", () => {
    const media = exerciseMedia({
      name: "Supino Reto com Barra",
      imageUrls: ["https://exemplo.test/minha-foto.jpg"],
    });

    expect(media.images).toEqual(["https://exemplo.test/minha-foto.jpg"]);
  });

  it("cai no casamento por nome quando não há imagem gravada", () => {
    // É o caso do exercício criado pelo próprio usuário.
    const media = exerciseMedia({ name: "Supino Reto com Barra" });

    expect(media.provider).toBe("free-exercise-db");
    expect(media.images).toHaveLength(2);
    expect(media.images[0]).toContain("Barbell_Bench_Press");
  });

  it("casa por palavra-chave o exercício que não está na lista exata", () => {
    const media = exerciseMedia({ name: "Supino Declinado com Halteres" });
    expect(media.images[0]).toContain("Barbell_Bench_Press");
  });

  it("prefere a palavra-chave mais específica", () => {
    // "crucifixo invertido" precisa casar antes de "crucifixo", senão o
    // exercício de deltoide posterior mostra uma foto de peito.
    const invertido = exerciseMedia({ name: "Crucifixo Invertido na Máquina" });
    expect(invertido.images[0]).toContain("Reverse_Flyes");

    const normal = exerciseMedia({ name: "Crucifixo com Halteres" });
    expect(normal.images[0]).toContain("Dumbbell_Flyes");
  });

  it("usa a pasta da free-exercise-db quando o external_id é dela", () => {
    const media = exerciseMedia({ name: "Agachamento Livre", externalId: "Barbell_Squat" });
    expect(media.images[0]).toContain("Barbell_Squat");
  });

  it("devolve mídia vazia, e não erro, para um nome desconhecido", () => {
    const media = exerciseMedia({ name: "Movimento Inventado Xyz" });
    expect(media.images).toEqual([]);
    expect(media.gif).toBeNull();
  });

  it("preserva o vídeo do banco mesmo quando a imagem vem de fora", () => {
    const media = exerciseMedia({
      name: "Supino Reto com Barra",
      videoUrl: "https://exemplo.test/meu-video.mp4",
    });

    expect(media.video).toBe("https://exemplo.test/meu-video.mp4");
  });
});

describe("exerciseMedia — atribuição", () => {
  it("a free-exercise-db não exige crédito, e isso é declarado explicitamente", () => {
    // `null` significa "não precisa", não "esqueceram de preencher" — a fonte
    // é de domínio público (Unlicense). A distinção importa: o dia em que uma
    // fonte que exige crédito voltar, o campo preenchido é o que garante que
    // ele apareça.
    const media = exerciseMedia({ name: "Supino Reto com Barra" });
    expect(media.attribution.label).toBeNull();
  });
});

describe("compatibilidade", () => {
  it("exerciseImages continua devolvendo o que as telas antigas esperam", () => {
    expect(exerciseImages("Supino Reto com Barra")).toHaveLength(2);
    expect(exerciseImages("Qualquer Coisa", ["https://exemplo.test/a.jpg"])).toEqual([
      "https://exemplo.test/a.jpg",
    ]);
  });

  it("a busca por vídeo escapa o nome do exercício", () => {
    const url = videoSearchUrl("Rosca Direta com Barra");
    expect(url).toContain("Rosca%20Direta%20com%20Barra");
    expect(url).toContain("execu%C3%A7%C3%A3o%20correta");
  });
});
