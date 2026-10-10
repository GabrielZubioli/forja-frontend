/**
 * Carregamento sob demanda dos gráficos.
 *
 * Cada gráfico vira um chunk próprio, baixado apenas quando a tela que o usa é
 * renderizada. Enquanto chega, mostramos um skeleton do mesmo tamanho — sem
 * salto de layout.
 */
import { Suspense, lazy } from "react";
import { ChartSkeleton } from "@/components/query-boundary";
import type { WeightPoint } from "./weight-chart";
import type { MeasurementPoint } from "./measurement-sparkline";

const WeightChartImpl = lazy(() => import("./weight-chart"));
const MeasurementSparklineImpl = lazy(() => import("./measurement-sparkline"));

export function LazyWeightChart(props: {
  data: readonly WeightPoint[];
  showDots?: boolean;
  goal?: number | null;
}) {
  return (
    <Suspense fallback={<ChartSkeleton />}>
      <WeightChartImpl {...props} />
    </Suspense>
  );
}

export function LazyMeasurementSparkline(props: { data: readonly MeasurementPoint[] }) {
  return (
    <Suspense fallback={<ChartSkeleton />}>
      <MeasurementSparklineImpl {...props} />
    </Suspense>
  );
}

export type { WeightPoint, MeasurementPoint };
