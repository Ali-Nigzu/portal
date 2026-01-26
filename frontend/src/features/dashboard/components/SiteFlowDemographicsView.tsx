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
        if (slices.length === 0) {
          return null;
        }
        const { series, result, axisConfig, visibility } =
          toTrafficDistributionProps(title, slices, data.timezone);
        return (
          <div className="site-flow-demographics__chart" key={title}>
            <div className="site-flow-demographics__heading">{title}</div>
            <TrafficDistribution
              result={result}
              series={series}
              axisConfig={axisConfig}
              visibility={visibility}
              height={220}
              className="site-flow-demographics__pie"
              widgetId={`site-flow-${title.toLowerCase()}`}
              useRawLabels
              labelKey="label"
            />
          </div>
        );
      })}
    </div>
  );
};
