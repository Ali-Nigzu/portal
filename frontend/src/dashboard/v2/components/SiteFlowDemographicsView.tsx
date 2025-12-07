import { TrafficDistribution } from "../../../analytics/components/ChartRenderer/primitives/TrafficDistribution";
import type {
  ChartResult,
  ChartSeries,
} from "../../../analytics/schemas/charting";
import type { SiteFlowDemographicsData, DemographicSlice } from "../utils/siteFlowDemographics";
import "../styles/DashboardV2Page.css";

const toPercentageSeries = (title: string, slices: DemographicSlice[]): ChartSeries => {
  const total = slices.reduce((sum, slice) => sum + (Number.isFinite(slice.value) ? slice.value : 0), 0);
  const safeTotal = total > 0 ? total : 1;
  return {
    id: `${title.toLowerCase().replace(/\s+/g, "-")}-demographics`,
    label: title,
    geometry: "bar",
    data: slices.map((slice) => ({ x: slice.label, value: (slice.value / safeTotal) * 100 })),
  };
};

const toTrafficDistributionProps = (title: string, slices: DemographicSlice[]) => {
  const series = [toPercentageSeries(title, slices)];
  const result: ChartResult = {
    chartType: "categorical",
    series,
    meta: { summary: { title, presentation: "vrm", chartStyle: "traffic_distribution" } },
  };
  return { series, result };
};

const EmptyPie = ({ title }: { title: string }) => (
  <div className="site-flow-demographics__empty">No {title.toLowerCase()} data</div>
);

export const SiteFlowDemographicsView = ({ data }: { data: SiteFlowDemographicsData }) => {
  const charts = [
    { title: "Age", slices: data.age },
    { title: "Gender", slices: data.gender },
    { title: "Race", slices: data.race },
    { title: "Hour", slices: data.hour },
  ];

  return (
    <div className="site-flow-demographics">
      {charts.map(({ title, slices }) => {
        const hasData = slices.length > 0;
        const { series, result } = toTrafficDistributionProps(title, slices);
        return (
          <div className="site-flow-demographics__chart" key={title}>
            <div className="site-flow-demographics__heading">{title}</div>
            {hasData ? (
              <TrafficDistribution
                result={result}
                series={series}
                height={220}
                className="site-flow-demographics__pie"
                widgetId={`site-flow-${title.toLowerCase()}`}
              />
            ) : (
              <EmptyPie title={title} />
            )}
          </div>
        );
      })}
    </div>
  );
};
