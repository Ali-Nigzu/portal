import React, { useCallback, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Line,
  Bar,
  Brush,
  ReferenceLine,
  Area,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { TooltipProps } from 'recharts/types/component/Tooltip';
import { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { useInteractionContext } from '../../context/InteractionContext';
import {
  AnalyticsAxisKey,
  AnalyticsResult,
  AnalyticsSeriesDefinition,
} from '../../utils/analyticsBuilder';

const MAX_POINTS = 2000;
const HEATMAP_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const AXIS_LABELS: Record<AnalyticsAxisKey, { label: string; unit: string; orientation: 'left' | 'right'; offset?: number }>
  = {
    people: { label: 'Occupancy', unit: 'people', orientation: 'left' },
    events: { label: 'Events', unit: 'events', orientation: 'right' },
    throughput: { label: 'Events/min', unit: 'events/min', orientation: 'right', offset: 24 },
    dwell: { label: 'Minutes', unit: 'minutes', orientation: 'right', offset: 48 },
  };

const formatNumber = (value: ValueType | undefined, fraction = 2): string => {
  if (typeof value !== 'number') {
    return String(value ?? '');
  }
  if (Number.isInteger(value)) {
    return value.toLocaleString();
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: fraction });
};

interface AnalyticsChartProps {
  cardId: string;
  result: AnalyticsResult;
  series: AnalyticsSeriesDefinition[];
  visibility: Record<string, boolean>;
  isLoading?: boolean;
  onZoomToRange?: (from: string, to: string, label: string) => void;
}

const AnalyticsChart: React.FC<AnalyticsChartProps> = ({
  cardId,
  result,
  series,
  visibility,
  isLoading = false,
  onZoomToRange,
}) => {
  const { syncId } = useInteractionContext();

  const decimationStep = useMemo(() => {
    if (result.data.length <= MAX_POINTS || result.chartType === 'pie' || result.chartType === 'heatmap') {
      return 1;
    }
    return Math.ceil(result.data.length / MAX_POINTS);
  }, [result.data.length, result.chartType]);

  const chartData = useMemo(
    () => result.data.filter((_, index) => index % decimationStep === 0),
    [result.data, decimationStep],
  );

  const axisVisibility = useMemo(() => {
    const groups: Record<AnalyticsAxisKey, boolean> = {
      people: false,
      events: false,
      throughput: false,
      dwell: false,
    };
    if (result.chartType === 'pie' || result.chartType === 'heatmap') {
      return groups;
    }
    series.forEach(descriptor => {
      if (visibility[descriptor.key]) {
        groups[descriptor.axis] = true;
      }
    });
    return groups;
  }, [series, visibility, result.chartType]);

  const [brushSelection, setBrushSelection] = useState<{ startIndex: number; endIndex: number } | null>(null);

  const handleBrushChange = useCallback((range: { startIndex?: number; endIndex?: number }) => {
    if (
      typeof range.startIndex === 'number' &&
      typeof range.endIndex === 'number' &&
      range.endIndex > range.startIndex
    ) {
      setBrushSelection({ startIndex: range.startIndex, endIndex: range.endIndex });
    } else {
      setBrushSelection(null);
    }
  }, []);

  const selectionRange = useMemo(() => {
    if (!brushSelection || result.xType !== 'time' || !chartData.length) {
      return null;
    }
    const startPoint = chartData[brushSelection.startIndex];
    const endPoint = chartData[Math.min(brushSelection.endIndex, chartData.length - 1)];
    if (!startPoint || !endPoint || typeof startPoint.bucketStart !== 'string' || typeof endPoint.bucketStart !== 'string') {
      return null;
    }
    const startDate = new Date(startPoint.bucketStart);
    const endDate = new Date(endPoint.bucketStart);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return null;
    }
    const minutes = Number(endPoint.bucketMinutes ?? 0);
    const inclusiveEnd = new Date(endDate.getTime() + minutes * 60 * 1000);
    return {
      from: startDate.toISOString(),
      to: inclusiveEnd.toISOString(),
      label: `${startPoint.label ?? startPoint.bucketStart} → ${endPoint.label ?? endPoint.bucketStart}`,
    };
  }, [brushSelection, chartData, result.xType]);

  const tooltipRenderer = useCallback(
    (props: TooltipProps<ValueType, NameType>) => {
      const extended = props as TooltipProps<ValueType, NameType> & {
        payload?: Array<{ dataKey?: string | number; value?: ValueType; color?: string; name?: string | number }>;
        label?: string | number;
        active?: boolean;
      };
      const payload = extended.payload;
      const labelValue = extended.label;
      const active = extended.active;
      if (!active || !payload?.length) {
        return null;
      }

      const grouped = payload.reduce<Record<AnalyticsAxisKey, { label: string; value: ValueType; color?: string }[]>>(
        (acc, item) => {
          const key = String(item.dataKey ?? '');
          const descriptor = series.find(entry => entry.key === key);
          if (!descriptor) {
            return acc;
          }
          if (!acc[descriptor.axis]) {
            acc[descriptor.axis] = [];
          }
          acc[descriptor.axis].push({
            label: String(item.name ?? descriptor.label),
            value: item.value ?? 0,
            color: item.color ?? descriptor.color,
          });
          return acc;
        },
        { people: [], events: [], throughput: [], dwell: [] },
      );

      const sections = (Object.keys(grouped) as AnalyticsAxisKey[]).filter(axis => grouped[axis].length > 0);

      return (
        <div className="vrm-tooltip">
          <div className="vrm-tooltip-header">
            <span className="vrm-tooltip-title">{labelValue != null ? String(labelValue) : '—'}</span>
            <span className="vrm-tooltip-meta">{result.xType === 'time' ? 'Time' : 'Category'}</span>
          </div>
          {sections.map(axis => (
            <div key={axis} className="vrm-tooltip-section">
              <span className="vrm-tooltip-section-label">{AXIS_LABELS[axis].label}</span>
              <ul className="vrm-tooltip-list">
                {grouped[axis].map(item => (
                  <li key={`${axis}-${item.label}`} className="vrm-tooltip-item">
                    <span className="vrm-tooltip-dot" style={{ backgroundColor: item.color ?? 'var(--vrm-text-secondary)' }} />
                    <span className="vrm-tooltip-label">{item.label}</span>
                    <span className="vrm-tooltip-value">
                      {formatNumber(item.value, axis === 'dwell' ? 1 : 2)} {AXIS_LABELS[axis].unit}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      );
    },
    [series, result.xType],
  );

  if (isLoading) {
    return (
      <div className="vrm-card-body vrm-card-body--centered">
        <div className="vrm-loading-spinner" />
        <p className="vrm-text-secondary">Generating analytics…</p>
      </div>
    );
  }

  if (result.chartType === 'pie') {
    const segments = result.pie?.segments ?? [];
    if (!segments.length) {
      return (
        <div className="vrm-card-body vrm-card-body--centered">
          <p className="vrm-text-secondary">No data for this configuration.</p>
        </div>
      );
    }
    return (
      <div className="vrm-card-body vrm-card-body--centered">
        <ResponsiveContainer width="100%" height={360}>
          <PieChart>
            <Tooltip formatter={(value: ValueType) => formatNumber(value, 2)} />
            <Pie
              data={segments as unknown as Array<Record<string, number | string>>}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={80}
              outerRadius={140}
              paddingAngle={4}
            >
              {segments.map(segment => (
                <Cell key={segment.id} fill={segment.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="vrm-chart-footer">
          <span className="vrm-chart-summary">
            {`${result.pie?.metric ?? ''} · Total ${formatNumber(result.pie?.total ?? 0, 2)}`}
          </span>
        </div>
      </div>
    );
  }

  if (result.chartType === 'heatmap') {
    const cells = result.heatmap?.cells ?? [];
    const maxValue = result.heatmap?.maxValue ?? 0;
    if (!cells.length) {
      return (
        <div className="vrm-card-body vrm-card-body--centered">
          <p className="vrm-text-secondary">No heatmap data for this configuration.</p>
        </div>
      );
    }
    return (
      <div className="vrm-card-body">
        <div className="vrm-heatmap-grid">
          <div className="vrm-heatmap-header">
            <span />
            {Array.from({ length: 24 }, (_, hour) => (
              <span key={`heatmap-hour-${hour}`} className="vrm-heatmap-hour">
                {hour}
              </span>
            ))}
          </div>
          {HEATMAP_WEEKDAYS.map(weekday => (
            <div key={weekday} className="vrm-heatmap-row">
              <span className="vrm-heatmap-weekday">{weekday}</span>
              {Array.from({ length: 24 }, (_, hour) => {
                const match = cells.find(cell => cell.weekday === weekday && cell.hour === hour);
                const value = match ? match.value : 0;
                const intensity = maxValue > 0 ? value / maxValue : 0;
                return (
                  <div
                    key={`${weekday}-${hour}`}
                    className="vrm-heatmap-cell"
                    style={{ backgroundColor: `rgba(0, 158, 247, ${Math.min(1, Math.max(0.1, intensity))})` }}
                    title={`${weekday} · ${hour}:00 – ${formatNumber(value, 2)}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div className="vrm-chart-footer">
          <span className="vrm-chart-summary">{`${result.heatmap?.metric ?? ''} · Max ${formatNumber(maxValue, 2)}`}</span>
        </div>
      </div>
    );
  }

  if (!chartData.length) {
    return (
      <div className="vrm-card-body vrm-card-body--centered">
        <p className="vrm-text-secondary">No data available for this configuration.</p>
      </div>
    );
  }

  return (
    <div id={cardId} className="vrm-card-body vrm-card-body--stacked">
      <div className="vrm-chart-wrapper">
        <ResponsiveContainer width="100%" height={420}>
          <ComposedChart
            data={chartData}
            syncId={syncId}
            layout={result.chartType === 'horizontal_bar' ? 'vertical' : 'horizontal'}
            margin={{ top: 16, right: 24, bottom: 0, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--vrm-border)" />
            <XAxis
              type={result.chartType === 'horizontal_bar' ? 'number' : 'category'}
              dataKey={result.chartType === 'horizontal_bar' ? undefined : result.xKey}
              stroke="var(--vrm-text-muted)"
              fontSize={12}
              minTickGap={12}
            />
            <YAxis
              type={result.chartType === 'horizontal_bar' ? 'category' : 'number'}
              dataKey={result.chartType === 'horizontal_bar' ? result.xKey : undefined}
              stroke="var(--vrm-text-muted)"
              fontSize={12}
              hide={result.chartType !== 'horizontal_bar'}
            />
            {(['people', 'events', 'throughput', 'dwell'] as AnalyticsAxisKey[]).map(axisKey => {
              const axis = AXIS_LABELS[axisKey];
              const orientation = axis.orientation;
              const width = axisKey === 'people' ? 48 : 56;
              const hideAxis = result.chartType === 'horizontal_bar';
              return (
                <YAxis
                  key={axisKey}
                  yAxisId={axisKey}
                  orientation={orientation}
                  stroke="var(--vrm-text-muted)"
                  fontSize={12}
                  width={width}
                  hide={hideAxis || !axisVisibility[axisKey]}
                  label={
                    axisVisibility[axisKey]
                      ? {
                          value: axis.label,
                          angle: orientation === 'left' ? -90 : 90,
                          position: orientation === 'left' ? 'insideLeft' : 'insideRight',
                          offset: axis.offset ?? 0,
                        }
                      : undefined
                  }
                  tickFormatter={value => formatNumber(value, axisKey === 'dwell' ? 1 : 0)}
                />
              );
            })}
            <Tooltip content={tooltipRenderer} />
            {result.xType === 'time' && (
              <ReferenceLine y={0} stroke="var(--vrm-border)" yAxisId="events" />
            )}
            {series.map(descriptor => {
              if (!visibility[descriptor.key]) {
                return null;
              }
              if (descriptor.geometry === 'bar') {
                return (
                  <Bar
                    key={descriptor.key}
                    dataKey={descriptor.key}
                    fill={descriptor.color}
                    barSize={24}
                    radius={[4, 4, 0, 0]}
                    yAxisId={descriptor.axis}
                    opacity={descriptor.isComparison ? 0.4 : 1}
                    stackId={descriptor.stackId}
                  />
                );
              }
              if (descriptor.geometry === 'area') {
                return (
                  <Area
                    key={descriptor.key}
                    type="monotone"
                    dataKey={descriptor.key}
                    stroke={descriptor.color}
                    fill={descriptor.color}
                    fillOpacity={0.2}
                    strokeWidth={2}
                    yAxisId={descriptor.axis}
                    strokeDasharray={descriptor.isComparison ? '4 4' : undefined}
                  />
                );
              }
              return (
                <Line
                  key={descriptor.key}
                  type="monotone"
                  dataKey={descriptor.key}
                  stroke={descriptor.color}
                  strokeWidth={2}
                  dot={false}
                  yAxisId={descriptor.axis}
                  strokeDasharray={descriptor.isComparison ? '4 4' : undefined}
                />
              );
            })}
            {result.xType === 'time' && (
              <Brush
                dataKey={result.xKey}
                height={24}
                stroke="var(--vrm-color-accent-occupancy)"
                onChange={handleBrushChange}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {selectionRange && onZoomToRange && (
        <div className="vrm-brush-actions" role="status">
          <span>{selectionRange.label}</span>
          <div className="vrm-brush-buttons">
            <button
              type="button"
              className="vrm-btn vrm-btn-secondary vrm-btn-sm"
              onClick={() => onZoomToRange(selectionRange.from, selectionRange.to, selectionRange.label)}
            >
              Zoom to selection
            </button>
          </div>
        </div>
      )}
      <div className="vrm-chart-footer">
        <span className="vrm-chart-summary">
          {`${result.summary.bucketCount.toLocaleString()} ${result.xType === 'time' ? 'buckets' : 'groups'} · ${result.summary.from.toLocaleDateString()} – ${result.summary.to.toLocaleDateString()}`}
        </span>
      </div>
    </div>
  );
};

export default AnalyticsChart;
