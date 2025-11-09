import React, { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import CardControlHeader from '../CardControlHeader';
import { useCardControls } from '../../hooks/useCardControls';
import { filterDataByControls } from '../../utils/rangeUtils';
import { ChartData } from '../../utils/dataProcessing';
import { IntelligencePayload } from '../../types/analytics';
import { exportChartAsPNG, exportDataAsCSV, generateChartId } from '../../utils/exportUtils';

interface GenderBreakdownCardProps {
  data: ChartData[];
  intelligence?: IntelligencePayload | null;
}

const COLORS: Record<string, string> = {
  male: 'var(--vrm-color-accent-entrances)',
  female: 'var(--vrm-color-accent-dwell)',
  unknown: 'var(--vrm-color-accent-occupancy)',
};

const LABELS: Record<string, string> = {
  male: 'Male',
  female: 'Female',
  unknown: 'Unknown',
};

const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

const GenderBreakdownCard: React.FC<GenderBreakdownCardProps> = ({ data, intelligence: _intelligence }) => {
  const cardId = 'dashboard-gender';
  const routeKey = 'dashboard';
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
  } = useCardControls(routeKey, cardId);
  const [mode, setMode] = useState<'count' | 'percent'>('count');

  const filtered = useMemo(() => filterDataByControls(data, controls), [data, controls]);

  const summary = useMemo(() => {
    const buckets: Record<string, number> = { male: 0, female: 0, unknown: 0 };
    filtered.forEach(item => {
      const key = item.sex?.toLowerCase();
      if (key === 'male' || key === 'female') {
        buckets[key] += 1;
      } else {
        buckets.unknown += 1;
      }
    });
    const total = Object.values(buckets).reduce((sum, value) => sum + value, 0);
    return { buckets, total };
  }, [filtered]);

  const chartDomId = useMemo(() => generateChartId(`${cardId}-pie`), []);

  const dataPoints = useMemo(
    () =>
      Object.entries(summary.buckets).map(([key, value]) => ({
        key,
        value,
        percent: summary.total ? value / summary.total : 0,
      })),
    [summary],
  );

  const exportCsv = () => {
    const rows = dataPoints.map(point => ({
      segment: LABELS[point.key] ?? point.key,
      count: point.value,
      percent: Number((point.percent * 100).toFixed(2)),
    }));
    exportDataAsCSV(rows, `${routeKey}_${cardId}_${controls.rangePreset}_${controls.granularity}`);
  };

  const exportPng = () => {
    exportChartAsPNG(chartDomId, `${routeKey}_${cardId}_${controls.rangePreset}_${controls.granularity}`);
  };

  return (
    <div className="vrm-card" id={chartDomId}>
      <CardControlHeader
        cardId={cardId}
        title="Gender distribution"
        subtitle="Entry events by detected gender"
        controls={controls}
        isSynced={isSynced}
        setRangePreset={setRangePreset}
        setCustomRange={setCustomRange}
        setGranularity={setGranularity}
        setScope={setScope}
        toggleSegment={toggleSegment}
        setCompare={setCompare}
        resync={resync}
        onExportCSV={exportCsv}
        onExportPNG={exportPng}
        exportDisabled={!summary.total}
        disablePerCamera
        actions={
          <div className="vrm-toggle-group" role="group" aria-label="Display mode">
            <button
              type="button"
              className={`vrm-toggle ${mode === 'count' ? 'active' : ''}`}
              onClick={() => setMode('count')}
            >
              Counts
            </button>
            <button
              type="button"
              className={`vrm-toggle ${mode === 'percent' ? 'active' : ''}`}
              onClick={() => setMode('percent')}
            >
              Percent
            </button>
          </div>
        }
      />
      <div className="vrm-card-body vrm-card-body--centered">
        <div className="vrm-donut-chart">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={dataPoints} dataKey="value" nameKey="key" innerRadius={70} outerRadius={110}>
                {dataPoints.map(point => (
                  <Cell key={point.key} fill={COLORS[point.key] ?? 'var(--vrm-color-accent-occupancy)'} />
                ))}
              </Pie>
              <Tooltip
                cursor={{ fill: 'rgba(255, 255, 255, 0.04)' }}
                formatter={(value: number, key: string) => [
                  mode === 'percent' ? formatPercent(value / summary.total) : value.toLocaleString(),
                  LABELS[key] ?? key,
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="vrm-donut-center">
            <span className="vrm-donut-total">{summary.total.toLocaleString()}</span>
            <span className="vrm-donut-label">Total entries</span>
          </div>
        </div>
        <div className="vrm-donut-legend">
          {dataPoints.map(point => (
            <div key={point.key} className="vrm-donut-legend-item">
              <span
                className="vrm-donut-legend-swatch"
                style={{ backgroundColor: COLORS[point.key] ?? 'var(--vrm-color-accent-occupancy)' }}
              />
              <span className="vrm-donut-legend-label">{LABELS[point.key] ?? point.key}</span>
              <span className="vrm-donut-legend-value">
                {mode === 'percent'
                  ? formatPercent(point.percent)
                  : point.value.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default GenderBreakdownCard;
