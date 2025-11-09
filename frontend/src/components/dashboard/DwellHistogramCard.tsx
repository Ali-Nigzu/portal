import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import CardControlHeader from '../CardControlHeader';
import { useCardControls } from '../../hooks/useCardControls';
import { filterDataByControls } from '../../utils/rangeUtils';
import { ChartData, calculateDwellDurations } from '../../utils/dataProcessing';
import { IntelligencePayload } from '../../types/analytics';
import { exportChartAsPNG, exportDataAsCSV, generateChartId } from '../../utils/exportUtils';

interface DwellHistogramCardProps {
  data: ChartData[];
  intelligence?: IntelligencePayload | null;
}

const BINS = [
  { label: '0-5', min: 0, max: 5 },
  { label: '5-10', min: 5, max: 10 },
  { label: '10-15', min: 10, max: 15 },
  { label: '15-20', min: 15, max: 20 },
  { label: '20-30', min: 20, max: 30 },
  { label: '30-45', min: 30, max: 45 },
  { label: '45-60', min: 45, max: 60 },
  { label: '60+', min: 60, max: Infinity },
];

const findLabelForValue = (value: number): string | undefined => {
  if (value <= 0) {
    return undefined;
  }
  const match = BINS.find(bin => value >= bin.min && value < bin.max);
  return match?.label ?? BINS[BINS.length - 1].label;
};

const calculatePercentile = (values: number[], percentile: number): number => {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.round((percentile / 100) * (sorted.length - 1)),
  );
  return sorted[index];
};

const DwellHistogramCard: React.FC<DwellHistogramCardProps> = ({ data, intelligence: _intelligence }) => {
  const cardId = 'dashboard-dwell';
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

  const [showMean, setShowMean] = useState(true);
  const [showMedian, setShowMedian] = useState(true);

  const filtered = useMemo(() => filterDataByControls(data, controls), [data, controls]);

  const dwellDurations = useMemo(() => calculateDwellDurations(filtered), [filtered]);

  const stats = useMemo(() => {
    if (!dwellDurations.length) {
      return { mean: 0, median: 0, p90: 0 };
    }
    const mean = dwellDurations.reduce((sum, value) => sum + value, 0) / dwellDurations.length;
    const median = calculatePercentile(dwellDurations, 50);
    const p90 = calculatePercentile(dwellDurations, 90);
    return { mean, median, p90 };
  }, [dwellDurations]);

  const histogramData = useMemo(() => {
    const counts = BINS.map(bin => ({
      label: bin.label,
      count: 0,
    }));

    dwellDurations.forEach(duration => {
      const binIndex = BINS.findIndex(bin => duration >= bin.min && duration < bin.max);
      const index = binIndex === -1 ? BINS.length - 1 : binIndex;
      counts[index].count += 1;
    });

    return counts;
  }, [dwellDurations]);

  const chartDomId = useMemo(() => generateChartId(`${cardId}-histogram`), []);

  const exportCsv = () => {
    const rows = histogramData.map(row => ({
      dwell_range: row.label,
      sessions: row.count,
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
        title="Dwell distribution"
        subtitle="Session durations for matched tracks"
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
        exportDisabled={!dwellDurations.length}
        disablePerCamera
        actions={
          <div className="vrm-toggle-group" role="group" aria-label="Highlight lines">
            <label className="vrm-toggle-checkbox">
              <input
                type="checkbox"
                checked={showMean}
                onChange={() => setShowMean(value => !value)}
              />
              Mean
            </label>
            <label className="vrm-toggle-checkbox">
              <input
                type="checkbox"
                checked={showMedian}
                onChange={() => setShowMedian(value => !value)}
              />
              Median
            </label>
          </div>
        }
      />
      <div className="vrm-card-body">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={histogramData} margin={{ top: 16, right: 16, bottom: 8, left: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--vrm-border)" />
            <XAxis dataKey="label" stroke="var(--vrm-text-muted)" tickLine={false} axisLine={false} />
            <YAxis stroke="var(--vrm-text-muted)" tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: 'rgba(255, 255, 255, 0.04)' }}
              formatter={(value: number, label: string) => [value.toLocaleString(), label]}
            />
            <Bar dataKey="count" fill="var(--vrm-color-accent-dwell)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
            {showMean && stats.mean > 0 && (
              <ReferenceLine
                x={findLabelForValue(stats.mean)}
                stroke="var(--vrm-color-accent-entrances)"
                strokeDasharray="4 2"
                label={{ value: `Mean ${stats.mean.toFixed(1)}m`, position: 'top', fill: 'var(--vrm-color-accent-entrances)' }}
              />
            )}
            {showMedian && stats.median > 0 && (
              <ReferenceLine
                x={findLabelForValue(stats.median)}
                stroke="var(--vrm-color-accent-exits)"
                strokeDasharray="4 2"
                label={{ value: `Median ${stats.median.toFixed(1)}m`, position: 'top', fill: 'var(--vrm-color-accent-exits)' }}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
        {stats.p90 > 45 && (
          <div className="vrm-alert vrm-alert-warning">
            P90 dwell {stats.p90.toFixed(1)} minutes — investigate prolonged stays.
          </div>
        )}
      </div>
    </div>
  );
};

export default DwellHistogramCard;
