import React, { useCallback, useMemo, useState } from 'react';
import {
  Area,
  Bar,
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TooltipProps } from 'recharts/types/component/Tooltip';
import { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import CardControlHeader from './CardControlHeader';
import { useCardControls, CardControlState } from '../hooks/useCardControls';
import { useSeriesVisibility } from '../hooks/useSeriesVisibility';
import { useInteractionContext } from '../context/InteractionContext';
import {
  filterDataByControls,
  getDateRangeFromPreset,
  deriveComparisonRange,
} from '../utils/rangeUtils';
import { useChartData, NormalizedChartPoint } from '../hooks/useChartData';
import { IntelligencePayload } from '../types/analytics';
import { ChartData } from '../utils/dataProcessing';
import { exportChartAsPNG, exportDataAsCSV, generateChartId } from '../utils/exportUtils';
import { useGlobalControls } from '../context/GlobalControlsContext';
import { CompareOption, RangePreset, SegmentOption } from '../styles/designTokens';

type AxisKey = 'people' | 'events' | 'throughput' | 'dwell';

interface SeriesDefinition {
  key: keyof NormalizedChartPoint | 'activity' | 'throughput';
  label: string;
  color: string;
  axis: AxisKey;
  type: 'area' | 'bar' | 'line';
  stackId?: string;
  defaultVisible?: boolean;
}

interface ConfigurableChartProps {
  cardId: string;
  routeKey: string;
  title: string;
  subtitle?: string;
  data: ChartData[];
  intelligence?: IntelligencePayload | null;
  onControlsChange?: (state: CardControlState) => void;
  isLoading?: boolean;
}

const SERIES_DEFINITIONS: SeriesDefinition[] = [
  {
    key: 'occupancy',
    label: 'Occupancy',
    color: 'var(--vrm-color-accent-occupancy)',
    axis: 'people',
    type: 'area',
  },
  {
    key: 'entries',
    label: 'Entrances',
    color: 'var(--vrm-color-accent-entrances)',
    axis: 'events',
    type: 'bar',
    stackId: 'flow',
  },
  {
    key: 'exits',
    label: 'Exits',
    color: 'var(--vrm-color-accent-exits)',
    axis: 'events',
    type: 'bar',
    stackId: 'flow',
  },
  {
    key: 'activity',
    label: 'Total activity',
    color: 'var(--vrm-color-accent-dwell)',
    axis: 'events',
    type: 'bar',
    defaultVisible: false,
  },
  {
    key: 'throughput',
    label: 'Throughput',
    color: 'var(--vrm-color-accent-entrances)',
    axis: 'throughput',
    type: 'line',
    defaultVisible: false,
  },
  {
    key: 'dwellMean',
    label: 'Avg dwell',
    color: 'var(--vrm-color-accent-dwell)',
    axis: 'dwell',
    type: 'line',
    defaultVisible: false,
  },
];

const SERIES_ORDER: (keyof NormalizedChartPoint | 'activity' | 'comparison_activity' | 'comparison_occupancy' | 'throughput')[] = [
  'entries',
  'exits',
  'activity',
  'occupancy',
  'throughput',
  'dwellMean',
  'comparison_activity',
  'comparison_occupancy',
];

const SEGMENT_SUBTITLE: Record<string, string> = {
  sex: 'Sex',
  age: 'Age bands',
};

const MAX_VISIBLE_POINTS = 2000;

const buildExportFilename = (
  routeKey: string,
  cardId: string,
  rangePreset: RangePreset,
  compare: CompareOption,
  segments: string[],
) => {
  const segmentPart = segments.length ? `_${segments.join('-')}` : '';
  return `${routeKey}_${cardId}_${rangePreset}_${compare}${segmentPart}`;
};

const formatTooltipValue = (value?: ValueType) => {
  if (typeof value === 'number') {
    return value.toLocaleString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return value ?? '';
};

const renderTooltip = (
  props: TooltipProps<ValueType, NameType>,
  segments: string[],
  granularity: string,
  axisMap: Record<string, AxisKey>,
) => {
  const extendedProps = props as TooltipProps<ValueType, NameType> & {
    label?: string | number;
    payload?: Array<{
      dataKey?: string | number;
      value?: ValueType;
      color?: string;
      name?: string | number;
    }>;
    active?: boolean;
  };
  const active = extendedProps.active;
  const payload = extendedProps.payload;
  const label = extendedProps.label;
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const ordered = [...payload].sort((a, b) => {
    const aKey = (a.dataKey as keyof NormalizedChartPoint) ?? 'activity';
    const bKey = (b.dataKey as keyof NormalizedChartPoint) ?? 'activity';
    return SERIES_ORDER.indexOf(aKey) - SERIES_ORDER.indexOf(bKey);
  });

  const subtitle = segments.length
    ? `Segments: ${segments.map(segment => SEGMENT_SUBTITLE[segment] ?? segment).join(', ')}`
    : undefined;

  const grouped = ordered.reduce<
    Record<AxisKey, { name: string; value: ValueType | undefined; color?: string }[]>
  >(
    (acc, item) => {
      const key = String(item.dataKey);
      const axisKey = axisMap[key] ?? 'events';
      if (!acc[axisKey]) {
        acc[axisKey] = [];
      }
      acc[axisKey].push({ name: String(item.name ?? item.dataKey), value: item.value, color: item.color });
      return acc;
    },
    { people: [], events: [], throughput: [], dwell: [] },
  );

  const sections: { key: AxisKey; label: string; unit: string }[] = [
    { key: 'people', label: 'Occupancy', unit: 'people' },
    { key: 'events', label: 'Events', unit: 'events' },
    { key: 'throughput', label: 'Throughput', unit: 'events/min' },
    { key: 'dwell', label: 'Dwell', unit: 'minutes' },
  ];

  return (
    <div className="vrm-tooltip">
      <div className="vrm-tooltip-header">
        <span className="vrm-tooltip-title">{String(label)}</span>
        <span className="vrm-tooltip-meta">{granularity === 'auto' ? 'Auto' : granularity}</span>
      </div>
      {subtitle && <div className="vrm-tooltip-subtitle">{subtitle}</div>}
      {sections
        .filter(section => grouped[section.key].length > 0)
        .map(section => (
          <div key={section.key} className="vrm-tooltip-section">
            <span className="vrm-tooltip-section-label">{section.label}</span>
            <ul className="vrm-tooltip-list">
              {grouped[section.key].map(item => (
                <li key={`${section.key}-${item.name}`} className="vrm-tooltip-item">
                  <span
                    className="vrm-tooltip-dot"
                    style={{ backgroundColor: item.color ?? 'var(--vrm-text-secondary)' }}
                  />
                  <span className="vrm-tooltip-label">{item.name}</span>
                  <span className="vrm-tooltip-value">
                    {typeof item.value === 'number'
                      ? section.key === 'dwell'
                        ? `${item.value.toFixed(1)} ${section.unit}`
                        : `${item.value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${section.unit}`
                      : formatTooltipValue(item.value)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
    </div>
  );
};

const ConfigurableChart: React.FC<ConfigurableChartProps> = ({
  cardId,
  routeKey,
  title,
  subtitle,
  data,
  intelligence,
  onControlsChange,
  isLoading = false,
}) => {
  const chartDomId = useMemo(() => generateChartId(`${cardId}-chart`), [cardId]);
  const { syncId } = useInteractionContext();
  const globalControls = useGlobalControls();
  const {
    state: controls,
    isSynced,
    setRangePreset,
    setCustomRange,
    setGranularity,
    setScope,
    toggleSegment,
    setCompare,
    resync,
  } = useCardControls(routeKey, cardId, onControlsChange);

  const { visibility, toggleSeries } = useSeriesVisibility(
    routeKey,
    cardId,
    SERIES_DEFINITIONS.map(series => ({ key: series.key, defaultVisible: series.defaultVisible !== false })),
  );

  const availableSegments = useMemo(() => {
    const segments: SegmentOption[] = [];
    const hasSex = data.some(item => {
      const value = item.sex?.toLowerCase();
      return value === 'male' || value === 'female';
    });
    if (hasSex) {
      segments.push('sex');
    }
    const hasAgeBands = data.some(item => {
      const estimate = item.age_estimate ?? '';
      return estimate && estimate !== 'unknown';
    });
    if (hasAgeBands) {
      segments.push('age');
    }
    return segments;
  }, [data]);

  const hasCameraData = useMemo(() => data.some(item => item.camera_id != null), [data]);

  const filteredData = useMemo(() => filterDataByControls(data, controls), [data, controls]);

  const baseChart = useChartData(filteredData, controls.granularity, intelligence);
  const { series, activeGranularity, highlightBuckets, averageOccupancy } = baseChart;

  const rangeForComparison = useMemo(() => {
    if (controls.compare === 'off') {
      return null;
    }
    const baseRange = getDateRangeFromPreset(controls.rangePreset, controls.customRange);
    return deriveComparisonRange(baseRange, controls.compare);
  }, [controls.compare, controls.rangePreset, controls.customRange]);

  const comparisonData = useMemo(() => {
    if (!rangeForComparison) {
      return [];
    }
    return filterDataByControls(data, controls, { rangeOverride: rangeForComparison });
  }, [data, controls, rangeForComparison]);

  const comparisonChart = useChartData(comparisonData, controls.granularity, intelligence);

  const [brushSelection, setBrushSelection] = useState<{ startIndex: number; endIndex: number } | null>(null);

  const decimationStep = useMemo(() => {
    if (series.length <= MAX_VISIBLE_POINTS) {
      return 1;
    }
    return Math.ceil(series.length / MAX_VISIBLE_POINTS);
  }, [series.length]);

  const decimatedSeries = useMemo(
    () => series.filter((_, index) => index % decimationStep === 0),
    [series, decimationStep],
  );

  const decimatedComparison = useMemo(
    () =>
      comparisonChart.series.filter((_, index) => index % decimationStep === 0),
    [comparisonChart.series, decimationStep],
  );

  const mergedSeries = useMemo(
    () =>
      decimatedSeries.map((point, index) => ({
        ...point,
        throughput: point.bucketMinutes > 0 ? point.activity / point.bucketMinutes : 0,
        comparison_entries: decimatedComparison[index]?.entries ?? null,
        comparison_exits: decimatedComparison[index]?.exits ?? null,
        comparison_activity: decimatedComparison[index]?.activity ?? null,
        comparison_occupancy: decimatedComparison[index]?.occupancy ?? null,
      })),
    [decimatedSeries, decimatedComparison],
  );

  const axisMap = useMemo(
    () =>
      SERIES_DEFINITIONS.reduce<Record<string, AxisKey>>((acc, item) => {
        acc[item.key] = item.axis;
        return acc;
      }, {
        comparison_activity: 'events',
        comparison_occupancy: 'people',
      }),
    [],
  );

  const visibleAxes = useMemo(
    () => ({
      people:
        !!visibility.occupancy || mergedSeries.some(point => point.comparison_occupancy != null),
      events:
        visibility.entries ||
        visibility.exits ||
        visibility.activity ||
        mergedSeries.some(point => point.comparison_activity != null),
      throughput: visibility.throughput,
      dwell: visibility.dwellMean,
    }),
    [visibility, mergedSeries],
  );

  const hasComparison = controls.compare !== 'off' && mergedSeries.some(point => point.comparison_activity !== null);

  const handleBrushChange = useCallback(
    (range: { startIndex?: number; endIndex?: number }) => {
      if (
        typeof range.startIndex === 'number' &&
        typeof range.endIndex === 'number' &&
        range.endIndex > range.startIndex
      ) {
        setBrushSelection({ startIndex: range.startIndex, endIndex: range.endIndex });
      } else {
        setBrushSelection(null);
      }
    },
    [],
  );

  const resolveSelectionRange = () => {
    if (!brushSelection) {
      return null;
    }
    const startPoint = mergedSeries[brushSelection.startIndex];
    const endPoint = mergedSeries[Math.min(brushSelection.endIndex, mergedSeries.length - 1)];
    if (!startPoint || !endPoint) {
      return null;
    }
    const fromDate = new Date(startPoint.bucketStart);
    const toDate = new Date(endPoint.bucketStart);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return null;
    }
    const inclusiveEnd = new Date(toDate.getTime() + (endPoint.bucketMinutes ?? 0) * 60 * 1000);
    return {
      from: fromDate.toISOString(),
      to: inclusiveEnd.toISOString(),
      label: `${startPoint.label} → ${endPoint.label}`,
    };
  };

  const selectionRange = resolveSelectionRange();

  const handleZoomToSelection = () => {
    if (!selectionRange) {
      return;
    }
    setCustomRange({ from: selectionRange.from, to: selectionRange.to });
    setBrushSelection(null);
  };

  const handleApplyToAll = () => {
    if (!selectionRange) {
      return;
    }
    globalControls.setRangePreset('custom');
    globalControls.setCustomRange({ from: selectionRange.from, to: selectionRange.to });
    setCustomRange({ from: selectionRange.from, to: selectionRange.to });
    setBrushSelection(null);
  };

  const filenameBase = useMemo(
    () => buildExportFilename(routeKey, cardId, controls.rangePreset, controls.compare, controls.segments),
    [routeKey, cardId, controls.rangePreset, controls.compare, controls.segments],
  );

  const exportPng = () => {
    exportChartAsPNG(chartDomId, filenameBase);
  };

  const exportCsv = () => {
    const rows = mergedSeries.map(point => {
      const bucketStart = new Date(point.bucketStart);
      const bucketEnd = new Date(bucketStart.getTime() + (point.bucketMinutes ?? 0) * 60 * 1000);
      return {
        bucket_start: bucketStart.toISOString(),
        bucket_end: bucketEnd.toISOString(),
        entrances: point.entries,
        exits: point.exits,
        total_activity: point.activity,
        occupancy: point.occupancy,
        throughput: Number.isFinite(point.throughput) ? Number(point.throughput.toFixed(4)) : null,
        dwell_mean: Number.isFinite(point.dwellMean) ? Number(point.dwellMean.toFixed(2)) : null,
        surge_flag: highlightBuckets.includes(point.label) ? 1 : 0,
        comparison_entrances: point.comparison_entries ?? undefined,
        comparison_exits: point.comparison_exits ?? undefined,
        comparison_activity: point.comparison_activity ?? undefined,
        comparison_occupancy: point.comparison_occupancy ?? undefined,
      };
    });
    exportDataAsCSV(rows, filenameBase);
  };

  const summaryText = useMemo(() => {
    const range = getDateRangeFromPreset(controls.rangePreset, controls.customRange);
    const bucketCount = mergedSeries.length;
    return `${bucketCount.toLocaleString()} buckets · ${range.from.toLocaleDateString()} – ${range.to.toLocaleDateString()}`;
  }, [controls.rangePreset, controls.customRange, mergedSeries]);

  return (
    <div className="vrm-card">
      <CardControlHeader
        cardId={cardId}
        title={title}
        subtitle={subtitle}
        controls={controls}
        isSynced={isSynced}
        setRangePreset={setRangePreset}
        setCustomRange={setCustomRange}
        setGranularity={setGranularity}
        setScope={setScope}
        toggleSegment={toggleSegment}
        setCompare={setCompare}
        resync={resync}
        onExportPNG={exportPng}
        onExportCSV={exportCsv}
        exportDisabled={!mergedSeries.length}
        seriesConfig={SERIES_DEFINITIONS.map(series => ({
          key: series.key,
          label: series.label,
          color: series.color,
        }))}
        visibleSeries={visibility}
        onToggleSeries={toggleSeries}
        disablePerCamera={!hasCameraData}
        showScope={hasCameraData}
        showSegments={availableSegments.length > 0}
        availableSegments={availableSegments}
        isLoading={isLoading}
      />
      <div className="vrm-card-body vrm-card-body--stacked">
        <div className="vrm-chart-wrapper">
          <ResponsiveContainer width="100%" height={420}>
            <ComposedChart data={mergedSeries} syncId={syncId} margin={{ top: 16, right: 24, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`${cardId}-occupancyGradient`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--vrm-color-accent-occupancy)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--vrm-color-accent-occupancy)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--vrm-border)" />
              <XAxis dataKey="label" stroke="var(--vrm-text-muted)" fontSize={12} minTickGap={12} />
              <YAxis
                yAxisId="people"
                stroke="var(--vrm-text-muted)"
                fontSize={12}
                allowDecimals={false}
                width={48}
                hide={!visibleAxes.people}
                tickFormatter={value => `${value}`}
                label={visibleAxes.people ? { value: 'Occupancy', angle: -90, position: 'insideLeft' } : undefined}
              />
              <YAxis
                yAxisId="events"
                orientation="right"
                stroke="var(--vrm-text-muted)"
                fontSize={12}
                allowDecimals={false}
                width={48}
                hide={!visibleAxes.events}
                tickFormatter={value => `${value}`}
                label={visibleAxes.events ? { value: 'Events', angle: 90, position: 'insideRight' } : undefined}
              />
              <YAxis
                yAxisId="throughput"
                orientation="right"
                stroke="var(--vrm-text-muted)"
                fontSize={12}
                width={48}
                hide={!visibleAxes.throughput}
                tickFormatter={value => `${Number(value).toFixed(2)}`}
                label={visibleAxes.throughput ? { value: 'Events/min', angle: 90, position: 'insideRight', offset: 24 } : undefined}
              />
              <YAxis
                yAxisId="dwell"
                orientation="right"
                stroke="var(--vrm-text-muted)"
                fontSize={12}
                width={48}
                hide={!visibleAxes.dwell}
                tickFormatter={value => `${Number(value).toFixed(1)}`}
                label={visibleAxes.dwell ? { value: 'Minutes', angle: 90, position: 'insideRight', offset: 48 } : undefined}
              />
              <Tooltip
                content={tooltipProps =>
                  renderTooltip(tooltipProps, controls.segments, activeGranularity, axisMap)
                }
              />
              {highlightBuckets.map(bucket => (
                <ReferenceArea
                  key={bucket}
                  x1={bucket}
                  x2={bucket}
                  strokeOpacity={0}
                  fill="var(--vrm-accent-orange)"
                  fillOpacity={0.1}
                />
              ))}
              {visibility.occupancy && (
                <Area
                  type="monotone"
                  dataKey="occupancy"
                  stroke="var(--vrm-color-accent-occupancy)"
                  fill={`url(#${cardId}-occupancyGradient)`}
                  strokeWidth={2}
                  name="Occupancy"
                  dot={false}
                  yAxisId="people"
                />
              )}
              {visibility.entries && (
                <Bar
                  dataKey="entries"
                  stackId="flow"
                  fill="var(--vrm-color-accent-entrances)"
                  name="Entrances"
                  radius={[4, 4, 0, 0]}
                  barSize={18}
                  yAxisId="events"
                />
              )}
              {visibility.exits && (
                <Bar
                  dataKey="exits"
                  stackId="flow"
                  fill="var(--vrm-color-accent-exits)"
                  name="Exits"
                  radius={[4, 4, 0, 0]}
                  barSize={18}
                  yAxisId="events"
                />
              )}
              {visibility.activity && (
                <Bar
                  dataKey="activity"
                  fill="var(--vrm-color-accent-dwell)"
                  name="Total activity"
                  barSize={6}
                  opacity={0.5}
                  yAxisId="events"
                />
              )}
              {visibility.throughput && (
                <Line
                  type="monotone"
                  dataKey="throughput"
                  stroke="var(--vrm-color-accent-entrances)"
                  strokeWidth={2}
                  dot={false}
                  name="Throughput"
                  yAxisId="throughput"
                />
              )}
              {visibility.dwellMean && (
                <Line
                  type="monotone"
                  dataKey="dwellMean"
                  stroke="var(--vrm-color-accent-dwell)"
                  strokeWidth={2}
                  dot={false}
                  name="Avg dwell"
                  yAxisId="dwell"
                />
              )}
              {hasComparison && (
                <Line
                  type="monotone"
                  dataKey="comparison_activity"
                  stroke="var(--vrm-color-accent-dwell)"
                  strokeDasharray="4 4"
                  name="Activity (comparison)"
                  dot={false}
                  yAxisId="events"
                />
              )}
              {hasComparison && (
                <Line
                  type="monotone"
                  dataKey="comparison_occupancy"
                  stroke="var(--vrm-color-accent-occupancy)"
                  strokeDasharray="4 4"
                  name="Occupancy (comparison)"
                  dot={false}
                  yAxisId="people"
                />
              )}
              {averageOccupancy > 0 && (
                <ReferenceLine
                  y={averageOccupancy}
                  stroke="var(--vrm-color-accent-entrances)"
                  strokeDasharray="4 2"
                  yAxisId="people"
                  label={{
                    value: `Mean occupancy ${Math.round(averageOccupancy)}`,
                    position: 'right',
                    fill: 'var(--vrm-color-accent-entrances)',
                    fontSize: 11,
                  }}
                />
              )}
              <ReferenceLine y={0} stroke="var(--vrm-border)" yAxisId="events" />
              <Brush dataKey="label" height={24} stroke="var(--vrm-color-accent-occupancy)" onChange={handleBrushChange} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="vrm-chart-footer">
          <span className="vrm-chart-summary">{summaryText}</span>
          <div className="vrm-chart-actions">
            <button type="button" className="vrm-btn vrm-btn-secondary vrm-btn-sm" onClick={exportPng} disabled={!decimatedSeries.length}>
              Export PNG
            </button>
            <button type="button" className="vrm-btn vrm-btn-secondary vrm-btn-sm" onClick={exportCsv} disabled={!decimatedSeries.length}>
              Export CSV
            </button>
          </div>
        </div>
        {selectionRange && (
          <div className="vrm-brush-actions" role="status">
            <span>{selectionRange.label}</span>
            <div className="vrm-brush-buttons">
              <button type="button" className="vrm-btn vrm-btn-secondary vrm-btn-sm" onClick={handleZoomToSelection}>
                Zoom to selection
              </button>
              <button type="button" className="vrm-btn vrm-btn-sm" onClick={handleApplyToAll}>
                Apply to all cards
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConfigurableChart;
