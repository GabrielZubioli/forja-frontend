/**
 * Linguagem visual dos gráficos.
 *
 * Existe porque cada gráfico do app vinha decidindo por conta própria a cor do
 * eixo, o tamanho da fonte e o estilo do tooltip. O resultado era um conjunto
 * de gráficos que pareciam vir de bibliotecas diferentes — e nenhum deles
 * parecido com o resto da interface.
 *
 * ## Duas regras
 *
 * 1. **Nada de cor literal.** Tudo aponta para os tokens de `styles.css`, então
 *    os gráficos trocam de tema junto com o app, sem código de tema aqui.
 * 2. **A moldura recua, o dado avança.** Eixo, grade e legenda são desenhados
 *    no tom mais fraco que ainda passa no contraste; a série fica com a cor
 *    saturada. É o oposto do padrão do Recharts, em que a grade compete com a
 *    linha.
 *
 * A ordem das séries não é decorativa: `chart-1` é o jade da marca e cabe
 * sempre ao dado principal (peso, meta, o que a pessoa veio ver). As demais
 * seguem em matizes espaçados o suficiente para permanecerem distinguíveis
 * também em visão de cores atípica.
 */

/** Cor de cada série, na ordem em que devem ser usadas. */
export const CHART_SERIES = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

/** Caixa flutuante de valores. Elevada, porque flutua sobre o conteúdo. */
export const CHART_TOOLTIP_STYLE = {
  background: "var(--elevated)",
  border: "1px solid color-mix(in oklch, var(--chart-1) 45%, transparent)",
  fontWeight: 600,
  borderRadius: "var(--radius-md)",
  boxShadow: "var(--elevation-md)",
  color: "var(--card-foreground)",
  fontSize: 12,
  padding: "0.5rem 0.75rem",
} as const;

export const CHART_TOOLTIP_LABEL_STYLE = {
  color: "var(--muted-foreground)",
  fontSize: 11,
  marginBottom: 2,
} as const;

/**
 * Eixos.
 *
 * `axisLine` e `tickLine` desligados: com a grade horizontal presente, as duas
 * linhas do eixo só somam traço. `dy`/`dx` afastam o rótulo do gráfico o
 * bastante para ele não encostar na primeira marca.
 */
export const CHART_AXIS = {
  stroke: "var(--muted-foreground)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
  tickMargin: 8,
} as const;

/** Grade: só horizontal. A vertical duplica a informação que o eixo X já dá. */
export const CHART_GRID = {
  stroke: "var(--border)",
  strokeDasharray: "3 3",
  vertical: false,
} as const;

/**
 * Linha de referência (meta, limite, média).
 *
 * Tracejada e no tom de aviso quando marca um limite; é o único caso em que a
 * moldura pode ter cor, porque aí ela **é** informação.
 */
export const CHART_REFERENCE_LINE = {
  stroke: "var(--muted-foreground)",
  strokeDasharray: "4 4",
  strokeWidth: 1,
} as const;
