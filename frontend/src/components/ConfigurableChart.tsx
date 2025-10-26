import React, { useMemo, useRef, useState } from 'react';
import {
  Area,
  Bar,
  Brush,
  CartesianGrid,
  ComposedChart,
  Legend,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { TooltipProps } from 'recharts/types/component/Tooltip';
import { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import GranularityToggle from './GranularityToggle';
import { GranularityOption } from '../types/analytics';
import { NormalizedChartPoint } from '../hooks/useChartData';
import { exportChartAsPNG, exportDataAsCSV, generateChartId } from '../utils/exportUtils';

interface ConfigurableChartProps {
  data: NormalizedChartPoint[];
  granularitySelection: GranularityOption;
  activeGranularity: GranularityOption;
  recommendedGranularity: GranularityOption;
  onGranularityChange: (value: GranularityOption) => void;
  highlightBuckets?: string[];
  averageOccupancy: number;
}

type SeriesKey = 'activity' | 'entries' | 'exits' | 'occupancy';

const SERIES_CONFIG: Record<SeriesKey, { label: string; color: string; type: 'line' | 'bar' | 'area' }> = {
  activity: { label: 'Activity', color: '#673ab7', type: 'line' },
  entries: { label: 'Entrances', color: '#2e7d32', type: 'bar' },
  exits: { label: 'Exits', color: '#d32f2f', type: 'bar' },
  occupancy: { label: 'Occupancy', color: '#1976d2', type: 'area' }
};

const tooltipFormatter = (props: TooltipProps<ValueType, NameType>) => {
  const { active, payload, label } = props as TooltipProps<ValueType, NameType> & {
    payload?: Array<{ dataKey?: string | number; value?: ValueType; color?: string }>;
    label?: string | number;
  };

  if (!active || !payload?.length) {
    return null;
  }

  const labelText = typeof label === 'number' ? label.toString() : label ?? '';

  return (
    <div
      style={{
        backgroundColor: 'var(--vrm-bg-secondary)',
        border: '1px solid var(--vrm-border)',
        borderRadius: '8px',
        padding: '12px',
        minWidth: '180px'
      }}
    >
      <p style={{ margin: 0, marginBottom: '8px', color: 'var(--vrm-text-primary)', fontWeight: 600 }}>{labelText}</p>
      {payload.map((rawEntry, index) => {
        const entry = rawEntry as {
          dataKey?: string | number;
          value?: ValueType;
          color?: string;
          name?: string | number;
        };
        const identifier = String(entry.dataKey ?? entry.name ?? index);
        const seriesLabel = SERIES_CONFIG[String(entry.dataKey ?? entry.name ?? '') as SeriesKey]?.label ?? entry.name ?? entry.dataKey;

        return (
          <div key={identifier} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
            <span style={{ color: entry.color ?? 'var(--vrm-text-secondary)' }}>{seriesLabel}</span>
            <span style={{ color: 'var(--vrm-text-primary)', fontWeight: 600 }}>{entry.value as number}</span>
          </div>
        );
      })}
    </div>
  );
};

const ConfigurableChart: React.FC<ConfigurableChartProps> = ({
  data,
  granularitySelection,
  activeGranularity,
  recommendedGranularity,
  onGranularityChange,
  highlightBuckets = [],
  averageOccupancy
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartId = useMemo(() => generateChartId('configurable-chart'), []);
  const [visibleSeries, setVisibleSeries] = useState<Record<SeriesKey, boolean>>({
    activity: true,
    entries: true,
    exits: true,
    occupancy: true
  });

  const toggleSeries = (key: SeriesKey) => {
    setVisibleSeries(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const summaryText = useMemo(() => {
    const seriesLabel = activeGranularity.charAt(0).toUpperCase() + activeGranularity.slice(1);
    const pointCount = data.length;
    return `${seriesLabel} view · ${pointCount} buckets`;
  }, [activeGranularity, data.length]);

  return (
    <div className="vrm-card">
      <div className="vrm-card-header" style={{ gap: '12px' }}>
        <div>
          <h3 className="vrm-card-title" style={{ marginBottom: '4px' }}>Interactive Activity Board</h3>
          <p style={{ fontSize: '12px', color: 'var(--vrm-text-secondary)', margin: 0 }}>
            Explore entrances, exits, and live occupancy across the selected time window
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
          <GranularityToggle
            value={granularitySelection}
            activeGranularity={activeGranularity}
            recommendedGranularity={recommendedGranularity}
            onChange={onGranularityChange}
          />
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {(Object.keys(SERIES_CONFIG) as SeriesKey[]).map(key => {
              const config = SERIES_CONFIG[key];
              const isActive = visibleSeries[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleSeries(key)}
                  className="vrm-btn vrm-btn-secondary vrm-btn-sm"
                  style={{
                    backgroundColor: isActive ? config.color : 'var(--vrm-bg-secondary)',
                    color: isActive ? '#fff' : 'var(--vrm-text-primary)',
                    borderColor: isActive ? config.color : 'var(--vrm-border)',
                    fontWeight: 600
                  }}
                >
                  {config.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="vrm-card-body">
        <div id={chartId} ref={chartRef} style={{ width: '100%', height: '420px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} syncId="dashboard-series" margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
              <defs>
                <linearGradient id="occupancyGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SERIES_CONFIG.occupancy.color} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={SERIES_CONFIG.occupancy.color} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--vrm-border)" />
              <XAxis dataKey="label" stroke="var(--vrm-text-secondary)" fontSize={12} minTickGap={12} />
              <YAxis stroke="var(--vrm-text-secondary)" fontSize={12} allowDecimals={false} />
              <Tooltip content={tooltipFormatter} cursor={{ stroke: 'var(--vrm-accent-blue)', strokeWidth: 1, strokeDasharray: '4 2' }} />
              <Legend
                verticalAlign="top"
                height={32}
                formatter={(value, entry) => {
                  const key = (entry?.dataKey as SeriesKey) ?? (value as SeriesKey);
                  return SERIES_CONFIG[key]?.label ?? value;
                }}
                onClick={legendEntry => {
                  const key = legendEntry?.dataKey as SeriesKey | undefined;
                  if (key) {
                    toggleSeries(key);
                  }
                }}
              />
              {highlightBuckets.map(bucket => (
                <ReferenceArea
                  key={bucket}
                  x1={bucket}
                  x2={bucket}
                  strokeOpacity={0}
                  fill="var(--vrm-accent-orange)"
                  fillOpacity={0.12}
                />
              ))}
              {visibleSeries.occupancy && (
                <Area
                  type="monotone"
                  dataKey="occupancy"
                  name={SERIES_CONFIG.occupancy.label}
                  stroke={SERIES_CONFIG.occupancy.color}
                  fill="url(#occupancyGradient)"
                  strokeWidth={2}
                  dot={false}
                />
              )}
              {visibleSeries.activity && (
                <Bar dataKey="activity" name={SERIES_CONFIG.activity.label} barSize={24} fill={SERIES_CONFIG.activity.color} radius={[4, 4, 0, 0]} opacity={0.75} />
              )}
              {visibleSeries.entries && (
                <Bar dataKey="entries" name={SERIES_CONFIG.entries.label} barSize={12} fill={SERIES_CONFIG.entries.color} radius={[4, 4, 0, 0]} />
              )}
              {visibleSeries.exits && (
                <Bar dataKey="exits" name={SERIES_CONFIG.exits.label} barSize={12} fill={SERIES_CONFIG.exits.color} radius={[4, 4, 0, 0]} />
              )}
              {averageOccupancy > 0 && (
                <ReferenceLine y={averageOccupancy} stroke="var(--vrm-accent-teal)" strokeDasharray="4 2" label={{ value: `Avg Occupancy ${Math.round(averageOccupancy)}`, position: 'right', fill: 'var(--vrm-accent-teal)', fontSize: 11 }} />
              )}
              <Brush dataKey="label" height={24} travellerWidth={10} stroke="var(--vrm-accent-blue)" fill="var(--vrm-bg-secondary)" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div
          style={{
            marginTop: '16px',
            padding: '12px 16px',
            backgroundColor: 'var(--vrm-bg-tertiary)',
            borderRadius: '6px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div style={{ color: 'var(--vrm-text-secondary)', fontSize: '13px' }}>{summaryText}</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="vrm-btn vrm-btn-secondary vrm-btn-sm"
              onClick={() => exportChartAsPNG(chartId, `activity-board-${activeGranularity}`)}
              disabled={!data.length}
            >
              Export PNG
            </button>
            <button
              className="vrm-btn vrm-btn-secondary vrm-btn-sm"
              onClick={() => exportDataAsCSV(data, `activity-board-${activeGranularity}`)}
              disabled={!data.length}
            >
              Export CSV
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfigurableChart;
