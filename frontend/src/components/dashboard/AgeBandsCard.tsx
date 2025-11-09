import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import CardControlHeader from '../CardControlHeader';
import { useCardControls } from '../../hooks/useCardControls';
import { filterDataByControls } from '../../utils/rangeUtils';
import { ChartData } from '../../utils/dataProcessing';
import { IntelligencePayload } from '../../types/analytics';
import { exportChartAsPNG, exportDataAsCSV, generateChartId } from '../../utils/exportUtils';

interface AgeBandsCardProps {
  data: ChartData[];
  intelligence?: IntelligencePayload | null;
}

const AGE_BANDS = [
  { key: '0-4', label: '0-4' },
  { key: '5-13', label: '5-13' },
  { key: '14-25', label: '14-25' },
  { key: '26-45', label: '26-45' },
  { key: '46-65', label: '46-65' },
  { key: '66+', label: '66+' },
];

const normalizeBand = (value: string | undefined): string => {
  if (!value) {
    return 'Unknown';
  }
  const normalized = value.replace('years', '').replace(' ', '');
  const match = AGE_BANDS.find(band => normalized.startsWith(band.key));
  return match ? match.label : 'Unknown';
};

const AgeBandsCard: React.FC<AgeBandsCardProps> = ({ data, intelligence: _intelligence }) => {
  const cardId = 'dashboard-age';
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
    const counts: Record<string, number> = {};
    AGE_BANDS.forEach(band => {
      counts[band.label] = 0;
    });
    counts.Unknown = 0;

    filtered.forEach(item => {
      const band = normalizeBand(item.age_estimate);
      counts[band] = (counts[band] ?? 0) + 1;
    });

    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    return { counts, total };
  }, [filtered]);

  const chartDomId = useMemo(() => generateChartId(`${cardId}-bars`), []);

  const dataPoints = useMemo(
    () =>
      AGE_BANDS.map(band => ({
        key: band.label,
        value: summary.counts[band.label] ?? 0,
        percent: summary.total ? (summary.counts[band.label] ?? 0) / summary.total : 0,
      })),
    [summary],
  );

  const exportCsv = () => {
    const rows = dataPoints.map(point => ({
      age_band: point.key,
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
        title="Age bands"
        subtitle="Entry events by estimated age"
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
      <div className="vrm-card-body">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={dataPoints} margin={{ top: 16, right: 16, bottom: 8, left: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--vrm-border)" />
            <XAxis dataKey="key" stroke="var(--vrm-text-muted)" tickLine={false} axisLine={false} />
            <YAxis
              stroke="var(--vrm-text-muted)"
              tickLine={false}
              axisLine={false}
              tickFormatter={value =>
                mode === 'percent' ? `${(value as number * 100).toFixed(0)}%` : Number(value).toLocaleString()
              }
            />
            <Tooltip
              cursor={{ fill: 'rgba(255, 255, 255, 0.04)' }}
              formatter={(value: number, label: string) => [
                mode === 'percent' ? `${(value * 100).toFixed(1)}%` : value.toLocaleString(),
                label,
              ]}
            />
            <Bar
              dataKey={mode === 'percent' ? 'percent' : 'value'}
              fill="var(--vrm-color-accent-occupancy)"
              radius={[6, 6, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default AgeBandsCard;
