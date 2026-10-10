import { defineConfig } from "vitest/config";

/**
 * Testes do app web.
 *
 * Escopo deliberadamente restrito à **lógica pura** de `src/lib` e `src/data`:
 * formatação de datas, escapes de CSV e rótulos. É onde nasceram os bugs mais
 * caros desta base (datas em UTC, locale ausente) e o que dá para cobrir sem
 * puxar jsdom e Testing Library para o projeto.
 *
 * Regras de negócio continuam em `@forja/domain`, com sua própria suíte
 * (`npm run test:domain`).
 */
export default defineConfig({
  resolve: {
    // Resolução nativa do Vite para o alias `@/*` — dispensa o plugin
    // `vite-tsconfig-paths`, que tentava analisar o tsconfig do app mobile.
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    // Os testes de data são escritos no fuso do público (BRT); o CI roda em UTC.
    env: { TZ: "America/Sao_Paulo" },
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", "packages", "apps", ".output"],
  },
});
