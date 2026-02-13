import type { ChartResult, ChartSeries, DataPoint } from "../../../analytics/schemas/charting";

type KpiDef = {
  id: string;
  label: string;
  value: number;
  points: number[];
};

const HOURS = Array.from({ length: 24 }, (_, index) =>
  new Date(Date.UTC(2024, 0, 1, index, 0, 0)).toISOString(),
);

const toSeriesData = (values: number[]): DataPoint[] =>
  values.map((value, index) => ({ x: HOURS[index] ?? String(index), y: value, value }));

const buildKpiResult = ({ id, label, value, points }: KpiDef): ChartResult => {
  const series: ChartSeries = {
    id,
    label,
    geometry: "area",
    data: toSeriesData(points),
  };

  return {
    chartType: "single_value",
    xDimension: {
      id: "time",
      type: "time",
      bucket: "HOUR",
      timezone: "UTC",
      label: "Hour",
    },
    series: [series],
    meta: {
      timezone: "UTC",
      summary: {
        presentation: "vrm",
        title: label,
        headlineValue: value,
        compact: true,
      },
    },
  };
};

export const KPI_RESULTS: Record<"entrances" | "occupancy" | "exits" | "footfall" | "dwell", ChartResult> = {
  entrances: buildKpiResult({
    id: "kpi-preview-entrances",
    label: "Entrances",
    value: 3,
    points: [12, 13, 15, 14, 17, 16, 15, 14, 16, 18, 20, 22, 24, 21, 20, 19, 18, 17, 16, 15, 17, 19, 21, 23],
  }),
  occupancy: buildKpiResult({
    id: "kpi-preview-occupancy",
    label: "Occupancy",
    value: 2,
    points: [6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 9, 10, 11, 12],
  }),
  exits: buildKpiResult({
    id: "kpi-preview-exits",
    label: "Exits",
    value: 1,
    points: [5, 5, 6, 6, 7, 8, 9, 10, 11, 10, 9, 8, 8, 7, 7, 6, 6, 5, 5, 6, 7, 8, 9, 10],
  }),
  footfall: buildKpiResult({
    id: "kpi-preview-footfall",
    label: "Footfall",
    value: 4,
    points: [10, 11, 12, 14, 16, 18, 19, 20, 21, 22, 23, 24, 23, 22, 21, 20, 19, 18, 17, 16, 17, 18, 19, 20],
  }),
  dwell: buildKpiResult({
    id: "kpi-preview-dwell",
    label: "Dwell Minutes",
    value: 4,
    points: [4, 4.2, 4.4, 4.6, 4.8, 5, 5.3, 5.6, 5.9, 6.2, 6.4, 6.1, 5.9, 5.7, 5.5, 5.3, 5.1, 4.9, 4.7, 4.6, 4.8, 5.1, 5.4, 5.8],
  }),
};
