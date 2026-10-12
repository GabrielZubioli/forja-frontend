/**
 * Gráfico de peso + tendência, isolado para carregamento sob demanda.
 *
 * O Recharts pesa ~94 kB gzip e era importado estaticamente pelo dashboard e
 * pela tela de corpo — entrava no bundle inicial de **todo** carregamento do
 * app, inclusive de quem só ia registrar uma série de treino. Extraindo os
 * gráficos para módulos separados, o `React.lazy` os tira do caminho crítico.
 *
 * ## Duas séries com pesos diferentes
 *
 * O peso diário é ruído: come mais sal num dia e sobe 1,2 kg de água. A
 * tendência (média móvel) é o que responde à pergunta real. Por isso o dado
 * bruto é uma linha fina e apagada, e a tendência é a linha grossa em jade com
 * a área preenchida. A hierarquia visual diz qual das duas olhar antes de
 * qualquer legenda.
 */
import { useId } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CHART_AXIS,
  CHART_GRID,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
} from "./chart-theme";

export type WeightPoint = {
  date: string;
  peso: number;
  tendencia: number;
};

export { CHART_TOOLTIP_STYLE } from "./chart-theme";

export default function WeightChart({
  data,
  showDots = false,
  goal,
}: {
  data: readonly WeightPoint[];
  showDots?: boolean;
  /** Meta de peso: linha tracejada em âmbar. */
  goal?: number | null;
}) {
  const gradiente = useId();

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={data as WeightPoint[]}
        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
      >
        <defs>
          {/*
            Preenchimento sob a tendência. Vai de 22% a zero: forte o bastante
            para dar corpo à linha, fraco o bastante para a grade continuar
            visível através dele. Área sólida esconderia o eixo.
          */}
          <linearGradient id={gradiente} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.45} />
            <stop offset="60%" stopColor="var(--chart-1)" stopOpacity={0.12} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
          <filter id={`${gradiente}-glow`} x="-10%" y="-30%" width="120%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="var(--chart-1)" floodOpacity="0.55" />
          </filter>
        </defs>

        <CartesianGrid {...CHART_GRID} />
        <XAxis dataKey="date" {...CHART_AXIS} minTickGap={24} />
        <YAxis
          {...CHART_AXIS}
          domain={goal ? [(min: number) => Math.min(min, goal) - 1, "auto"] : ["auto", "auto"]}
          width={52}
          unit=" kg"
        />
        {goal ? (
          <ReferenceLine
            y={goal}
            stroke="var(--warning)"
            strokeDasharray="6 5"
            strokeWidth={2}
            ifOverflow="extendDomain"
          />
        ) : null}

        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          labelStyle={CHART_TOOLTIP_LABEL_STYLE}
          cursor={{ stroke: "var(--chart-1)", strokeWidth: 1.5, strokeDasharray: "3 3" }}
          formatter={(value: number, name) => [
            `${value} kg`,
            name === "peso" ? "Peso" : "Tendência",
          ]}
        />

        <Area
          type="monotone"
          dataKey="tendencia"
          stroke="none"
          fill={`url(#${gradiente})`}
          // A área é o mesmo dado da linha da tendência; anunciá-la de novo
          // faria o tooltip repetir o valor.
          tooltipType="none"
          animationDuration={1100}
        />
        <Line
          type="monotone"
          dataKey="peso"
          stroke="var(--muted-foreground)"
          strokeWidth={1.5}
          strokeOpacity={0.7}
          dot={showDots ? { r: 2, fill: "var(--muted-foreground)", strokeWidth: 0 } : false}
          activeDot={{ r: 3 }}
        />
        <Line
          type="monotone"
          dataKey="tendencia"
          stroke="var(--chart-1)"
          strokeWidth={3}
          strokeLinecap="round"
          filter={`url(#${gradiente}-glow)`}
          dot={false}
          activeDot={{ r: 7, strokeWidth: 3, stroke: "var(--card)", fill: "var(--chart-1)" }}
          animationDuration={1100}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
