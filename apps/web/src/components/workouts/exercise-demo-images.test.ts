import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExerciseDemo } from "./exercise-demo-images";

const images = ["a.jpg", "b.jpg"];

describe("ExerciseDemo", () => {
  it("é um botão de reproduzir por padrão", () => {
    const html = renderToStaticMarkup(createElement(ExerciseDemo, { images, name: "Supino" }));
    expect(html).toContain("<button");
  });

  // Dentro do botão "ver execução" das listas, um segundo botão é HTML
  // inválido: erro de hidratação no React e foco duplo no leitor de tela.
  it("não renderiza botão quando não é interativo", () => {
    const html = renderToStaticMarkup(
      createElement(ExerciseDemo, { images, name: "Supino", interactive: false }),
    );
    expect(html).not.toContain("<button");
    expect(html).toContain("Supino — posição inicial");
  });
});
