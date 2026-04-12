import {
  AxisManager,
  SeriesManager,
} from "../../../analytics/components/ChartRenderer/managers";
import { TrafficDistribution } from "../../../analytics/components/ChartRenderer/primitives/TrafficDistribution";
import type {
  ChartResult,
  ChartSeries,
} from "../../../analytics/schemas/charting";
import type {
  DemographicSlice,
  SiteFlowDemographicsData,
} from "../utils/siteFlowDemographics";
import "../styles/DashboardPage.css";

const AGE_SLICE_COLORS: Record<string, string> = {
  "0–4": "#dce6f0",
  "5–13": "#a9bfd6",
  "14–25": "#6f96c6",
  "26–45": "#3f6fa8",
  "46–65": "#2f4f79",
  "66+": "#27384f",
  Unknown: "#8a94a3",
};

const GENDER_SLICE_COLORS: Record<string, string> = {
  Male: "#2d6cdf",
  Female: "#e26da8",
  Unknown: "#8a94a3",
};

const RACE_SLICE_COLORS: Record<string, string> = {
  Light: "#dfccb2",
  Mix: "#c99663",
  Mixed: "#c99663",
  Dark: "#7b5538",
  Unknown: "#8a94a3",
};

const resolveDemographicSliceColor = (title: string, label: string): string => {
  if (title === "Age") {
    return AGE_SLICE_COLORS[label] ?? AGE_SLICE_COLORS.Unknown;
  }
  if (title === "Gender") {
    return GENDER_SLICE_COLORS[label] ?? GENDER_SLICE_COLORS.Unknown;
  }
  if (title === "Race") {
    return RACE_SLICE_COLORS[label] ?? RACE_SLICE_COLORS.Unknown;
  }
  return "#8a94a3";
};

const toPercentageSeries = (
  title: string,
  slices: DemographicSlice[],
): ChartSeries => {
  const total = slices.reduce(
    (sum, slice) => sum + (Number.isFinite(slice.count) ? slice.count : 0),
    0,
  );
  const safeTotal = total > 0 ? total : 1;
  return {
    id: `${title.toLowerCase().replace(/\s+/g, "-")}-demographics`,
    label: title,
    geometry: "bar",
    data: slices.map((slice) => ({
      x: slice.label,
      label: slice.label,
      code: slice.code,
      value: (slice.count / safeTotal) * 100,
      color: resolveDemographicSliceColor(title, slice.label),
    })),
  };
};

const toTrafficDistributionProps = (
  title: string,
  slices: DemographicSlice[],
  timezone: string,
) => {
  const series = [toPercentageSeries(title, slices)];
  const axisConfig = new AxisManager(series).build();
  const visibility = new SeriesManager(series).toObject();
  const result: ChartResult = {
    chartType: "categorical",
    xDimension: { id: "category", type: "category", timezone },
    series,
    meta: {
      timezone,
      summary: {
        title,
        presentation: "vrm",
        chartStyle: "traffic_distribution",
      },
    },
  };
  return { series, result, axisConfig, visibility };
};

export const SiteFlowDemographicsView = ({
  data,
}: {
  data: SiteFlowDemographicsData;
}) => {
  const charts = [
    { title: "Age", slices: data.age },
    { title: "Gender", slices: data.gender },
    { title: "Race", slices: data.race },
  ];

  return (
    <div className="site-flow-demographics">
      {charts.map(({ title, slices }) => {
        const safeSlices = slices.length > 0
          ? slices
          : [{ code: null, label: "No data", count: 0 }];
        const { series, result, axisConfig, visibility } =
          toTrafficDistributionProps(title, safeSlices, data.timezone);
        return (
          <TrafficDistribution
            key={title}
            result={result}
            series={series}
            axisConfig={axisConfig}
            visibility={visibility}
            height={220}
            className="site-flow-demographics__chart"
            widgetId={`site-flow-${title.toLowerCase()}`}
            useRawLabels
            labelKey="label"
          />
        );
      })}
    </div>
  );
};
