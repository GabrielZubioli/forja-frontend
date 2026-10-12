/**
 * Treinos por semana: barras em jade, a semana tocada acende e as
 * outras recuam. A linha tracejada é a meta semanal da rotina.
 */
import { useState } from "react";
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
                fill="var(--chart-1)"
                fillOpacity={acesa ? 1 : 0.35}
              />
            );
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
