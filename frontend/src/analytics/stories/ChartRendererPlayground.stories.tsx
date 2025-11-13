import { useEffect, useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { ChartRenderer } from "../components/ChartRenderer";
import { Card } from "../components/Card";
import type { ChartResult } from "../schemas/charting";
import {
  loadChartFixture,
  listAvailableFixtures,
  type ChartFixtureName,
} from "../utils/loadChartFixture";
import { triggerExport } from "../utils/exportChart";

const FIXTURE_OPTIONS = listAvailableFixtures();

type PlaygroundProps = {
  fixture: ChartFixtureName;
  height: number;
};

type FixtureTransform = (result: ChartResult) => ChartResult;

type FixtureCardProps = {
  fixture: ChartFixtureName;
  title: string;
  subtitle: string;
  height?: number;
  transform?: FixtureTransform;
};

const cloneResult = (result: ChartResult): ChartResult =>
  JSON.parse(JSON.stringify(result));

const withLowCoverage = (result: ChartResult): ChartResult => {
  const copy = cloneResult(result);
  copy.series = copy.series.map((series) => ({
    ...series,
    data: series.data.map((point, index) => ({
      ...point,
      coverage:
        index % 2 === 0 ? point.coverage ?? 1 : Math.min(0.45, point.coverage ?? 0.45),
    })),
  }));
  return copy;
};

const withDwellNulls = (result: ChartResult): ChartResult => {
  const copy = cloneResult(result);
  copy.series = copy.series.map((series) => {
    if (series.id === "avg_dwell" || series.id === "p90_dwell") {
      return {
        ...series,
        data: series.data.map((point, index) => ({
          ...point,
          y: index === 1 ? null : point.y,
          value: index === 1 ? null : point.value,
          coverage: index === 1 ? 0.4 : point.coverage ?? 1,
        })),
      };
    }
    return series;
  });
  return copy;
};

const withRetentionCoverage = (result: ChartResult): ChartResult => {
  const copy = cloneResult(result);
  copy.series = copy.series.map((series) => ({
    ...series,
    data: series.data.map((point, index) => ({
      ...point,
      coverage: index % 3 === 0 ? 0.42 : 0.85,
    })),
  }));
  return copy;
};

const useFixture = (fixture: ChartFixtureName, transform?: FixtureTransform) => {
  const [result, setResult] = useState<ChartResult | null>(null);
  useEffect(() => {
    loadChartFixture(fixture)
      .then((base) => setResult(transform ? transform(base) : base))
      .catch(console.error);
  }, [fixture, transform]);
  return result;
};

const FixtureCard = ({ fixture, title, subtitle, height = 360, transform }: FixtureCardProps) => {
  const result = useFixture(fixture, transform);
  const cardSubtitle = useMemo(() => subtitle, [subtitle]);

  if (!result) {
    return <div style={{ padding: "2rem" }}>Loading fixture…</div>;
  }

  return (
    <Card
      title={title}
      subtitle={cardSubtitle}
      onExport={() => triggerExport({ result, spec: null, specHash: null })}
    >
      <ChartRenderer result={result} height={height} />
    </Card>
  );
};

const meta: Meta<PlaygroundProps> = {
  title: "Analytics/ChartRenderer",
  argTypes: {
    fixture: {
      control: {
        type: "select",
        options: FIXTURE_OPTIONS,
      },
    },
    height: {
      control: { type: "range", min: 200, max: 640, step: 20 },
    },
  },
  args: {
    fixture: FIXTURE_OPTIONS[0] ?? "golden_dashboard_live_flow",
    height: 360,
  },
};

export default meta;

const PlaygroundComponent = ({ fixture, height }: PlaygroundProps) => {
  const [result, setResult] = useState<ChartResult | null>(null);

  useEffect(() => {
    loadChartFixture(fixture).then(setResult).catch(console.error);
  }, [fixture]);

  if (!result) {
    return <div style={{ padding: "2rem" }}>Loading fixture…</div>;
  }

  return (
    <Card
      title={`ChartRenderer – ${fixture}`}
      subtitle="Fixture explorer"
      onExport={() => triggerExport({ result, spec: null, specHash: null })}
    >
      <ChartRenderer result={result} height={height} />
    </Card>
  );
};

type Story = StoryObj<PlaygroundProps>;

export const Playground: Story = {
  render: (args) => <PlaygroundComponent {...args} />,
};

export const OccupancyActivityTimeSeries = {
  render: () => (
    <FixtureCard
      fixture="chartresult_phase2_example"
      title="Occupancy & Activity"
      subtitle="Multi-series time chart with low coverage"
      height={420}
    />
  ),
};

export const LiveFlowComposite = {
  render: () => (
    <FixtureCard
      fixture="golden_dashboard_live_flow"
      title="Live Flow Composite"
      subtitle="Composed area + bar + line chart"
      height={420}
    />
  ),
};

export const DwellWithNullBuckets = {
  render: () => (
    <FixtureCard
      fixture="golden_dwell_by_camera"
      title="Dwell Mean + P90"
      subtitle="Null bucket and low coverage handling"
      transform={withDwellNulls}
      height={360}
    />
  ),
};

export const RetentionHeatmapLowCoverage = {
  render: () => (
    <FixtureCard
      fixture="golden_retention_heatmap"
      title="Retention Heatmap"
      subtitle="Small cohorts flagged as low confidence"
      transform={withRetentionCoverage}
      height={420}
    />
  ),
};

export const DemographicSplitBars = {
  render: () => (
    <FixtureCard
      fixture="golden_demographics_by_age"
      title="Demographic Split"
      subtitle="Categorical bar chart with legend toggles"
      height={360}
    />
  ),
};

export const LowCoverageScenario = {
  render: () => (
    <FixtureCard
      fixture="chartresult_phase2_example"
      title="Low Coverage Warning"
      subtitle="Occupancy coverage < 0.5 rendered as low confidence"
      transform={withLowCoverage}
      height={360}
    />
  ),
};

const KPI_RESULTS: ChartResult[] = [
  {
    chartType: "single_value",
    xDimension: { id: "metric", type: "index" },
    series: [
      {
        id: "occupancy_kpi",
        label: "Live occupancy",
        geometry: "metric",
        unit: "people",
        color: "#2685FF",
        data: [{ x: "now", value: 325, coverage: 1, rawCount: 325 }],
        summary: { delta: 0.18 },
      },
    ],
    meta: { timezone: "UTC" },
  },
  {
    chartType: "single_value",
    xDimension: { id: "metric", type: "index" },
    series: [
      {
        id: "throughput_kpi",
        label: "Average throughput",
        geometry: "metric",
        unit: "events/min",
        color: "#8A5BE8",
        data: [{ x: "now", value: 12.4, coverage: 0.92, rawCount: 58 }],
        summary: { delta: -0.12 },
      },
    ],
    meta: { timezone: "UTC" },
  },
  {
    chartType: "single_value",
    xDimension: { id: "metric", type: "index" },
    series: [
      {
        id: "dwell_mean_kpi",
        label: "Mean dwell",
        geometry: "metric",
        unit: "minutes",
        color: "#F6A609",
        data: [{ x: "now", value: null, coverage: 1, rawCount: 0 }],
        summary: { delta: null },
      },
    ],
    meta: { timezone: "UTC" },
  },
  {
    chartType: "single_value",
    xDimension: { id: "metric", type: "index" },
    series: [
      {
        id: "occupancy_low_confidence",
        label: "Occupancy (partial)",
        geometry: "metric",
        unit: "people",
        color: "#FF5964",
        data: [{ x: "now", value: 92, coverage: 0.38, rawCount: 35 }],
        summary: { delta: 0.03 },
      },
    ],
    meta: { timezone: "UTC" },
  },
];

export const KpiTileVariants = {
  render: () => (
    <div
      style={{
        display: "grid",
        gap: "1.5rem",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      }}
    >
      {KPI_RESULTS.map((result, index) => (
        <Card
          key={result.series[0]?.id ?? `kpi-${index}`}
          title={result.series[0]?.label ?? "KPI"}
          subtitle="Single value tile"
          onExport={() => triggerExport({ result, spec: null, specHash: null })}
        >
          <ChartRenderer result={result} height={220} />
        </Card>
      ))}
    </div>
  ),
};

const EMPTY_RESULT: ChartResult = {
  chartType: "composed_time",
  xDimension: { id: "time", type: "time", bucket: "HOUR", timezone: "UTC" },
  series: [
    {
      id: "occupancy",
      label: "Occupancy",
      geometry: "area",
      unit: "people",
      data: [],
    },
  ],
  meta: { timezone: "UTC" },
};

const INVALID_RESULT: ChartResult = {
  chartType: "composed_time",
  xDimension: { id: "time", type: "time", bucket: "HOUR", timezone: "UTC" },
  series: [
    {
      id: "bad_series",
      label: "Invalid",
      geometry: "line",
      unit: "unknown_unit",
      data: [
        { x: "2024-01-01T00:00:00Z", y: 10, coverage: 1.2 },
        { x: null as unknown as string, y: NaN },
      ],
    },
  ],
  meta: { timezone: "UTC" },
};

export const EmptyState = {
  render: () => (
    <Card
      title="Empty State"
      subtitle="0 buckets returned from backend"
      onExport={() => triggerExport({ result: EMPTY_RESULT, spec: null, specHash: null })}
    >
      <ChartRenderer result={EMPTY_RESULT} height={280} />
    </Card>
  ),
};

export const ContractViolationState = {
  render: () => (
    <Card
      title="Invalid Payload"
      subtitle="Renderer surfaces contract violations"
      onExport={() => triggerExport({ result: INVALID_RESULT, spec: null, specHash: null })}
    >
      <ChartRenderer result={INVALID_RESULT} height={280} />
    </Card>
  ),
};
