/**
 * Mini-gráfico de uma medida corporal, isolado para carregamento sob demanda.
 * Ver a nota sobre o peso do Recharts em `weight-chart.tsx`.
 *
 * Sem eixo, sem grade, sem legenda: num retângulo de 64 px de altura, qualquer
 * moldura ocupa o espaço que deveria ser da forma da curva. O número exato já
 * está impresso ao lado — aqui só interessa a direção.
 */
import { useId } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
import { CHART_TOOLTIP_LABEL_STYLE, CHART_TOOLTIP_STYLE } from "./chart-theme";

export type MeasurementPoint = {
  date: string;
  v: number;
};

export default function MeasurementSparkline({ data }: { data: readonly MeasurementPoint[] }) {
  // A tela de medidas desenha um destes por medida acompanhada. Um `id` fixo
  // repetiria o mesmo identificador sete vezes no documento — inválido, e o
  // tipo de coisa que quebra de forma imprevisível quando um dos gráficos
  // passar a ter cor própria.
  const gradiente = useId();

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={data as MeasurementPoint[]}
        margin={{ top: 4, right: 2, bottom: 0, left: 2 }}
      >
        <defs>
          <linearGradient id={gradiente} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.5} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          labelStyle={CHART_TOOLTIP_LABEL_STYLE}
          cursor={{ stroke: "var(--chart-1)", strokeWidth: 1, strokeDasharray: "3 3" }}
        />
        <Area
          type="monotone"
          dataKey="v"
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill={`url(#${gradiente})`}
          dot={false}
          activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--card)", fill: "var(--chart-1)" }}
          animationDuration={900}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
