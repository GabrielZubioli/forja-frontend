/**
 * Treinos por semana: barras em degradê de jade, a semana tocada acende e as
 * outras recuam. A linha tracejada é a meta semanal da rotina.
 */
import { useId, useState } from "react";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_AXIS, CHART_TOOLTIP_LABEL_STYLE, CHART_TOOLTIP_STYLE } from "./chart-theme";

export type WeekPoint = { semana: string; treinos: number };

export default function WeeklyChart({
  data,
  goal,
}: {
  data: readonly WeekPoint[];
  goal?: number | null;
}) {
  const id = useId();
  const [ativa, setAtiva] = useState<number | null>(null);
  const atual = data.length - 1;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data as WeekPoint[]}
        margin={{ top: 12, right: 4, bottom: 0, left: 4 }}
        onMouseMove={(s) => setAtiva(typeof s.activeTooltipIndex === "number" ? s.activeTooltipIndex : null)}
        onMouseLeave={() => setAtiva(null)}
      >
        <defs>
          <linearGradient id={`${id}-on`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={1} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.55} />
          </linearGradient>
          <linearGradient id={`${id}-off`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.5} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.15} />
          </linearGradient>
          <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="var(--chart-1)" floodOpacity="0.7" />
          </filter>
        </defs>
        <XAxis dataKey="semana" {...CHART_AXIS} interval="preserveStartEnd" minTickGap={16} />
        <YAxis hide allowDecimals={false} domain={[0, (max: number) => Math.max(max, goal ?? 0, 1)]} />
        {goal ? (
          <ReferenceLine
            y={goal}
            stroke="var(--chart-1)"
            strokeOpacity={0.6}
            strokeDasharray="5 5"
            label={{ value: `meta ${goal}`, position: "insideTopRight", fontSize: 10, fill: "var(--muted-foreground)" }}
          />
        ) : null}
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          labelStyle={CHART_TOOLTIP_LABEL_STYLE}
          cursor={{ fill: "var(--chart-1)", fillOpacity: 0.08, radius: 8 }}
          labelFormatter={(l) => `Semana de ${l}`}
          formatter={(v: number) => [`${v} ${v === 1 ? "treino" : "treinos"}`, ""]}
          separator=""
        />
        <Bar dataKey="treinos" radius={[8, 8, 3, 3]} animationDuration={900} animationEasing="ease-out">
          {data.map((_, i) => {
            const acesa = ativa === null ? i === atual : ativa === i;
            return (
              <Cell
                key={i}
                fill={`url(#${id}-${acesa ? "on" : "off"})`}
                filter={acesa ? `url(#${id}-glow)` : undefined}
              />
            );
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
