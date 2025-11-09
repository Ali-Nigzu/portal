import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import CardControlHeader from '../CardControlHeader';
import { useCardControls } from '../../hooks/useCardControls';
import { useSeriesVisibility } from '../../hooks/useSeriesVisibility';
import { filterDataByControls } from '../../utils/rangeUtils';
import { computeChartSeries } from '../../hooks/useChartData';
import { ChartData } from '../../utils/dataProcessing';
import { IntelligencePayload } from '../../types/analytics';
import { exportChartAsPNG, exportDataAsCSV, generateChartId } from '../../utils/exportUtils';

interface TurnoverOccupancyCardProps {
  data: ChartData[];
  intelligence?: IntelligencePayload | null;
}

const TurnoverOccupancyCard: React.FC<TurnoverOccupancyCardProps> = ({ data, intelligence }) => {
  const cardId = 'dashboard-turnover';
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

  const { visibility, toggleSeries } = useSeriesVisibility(routeKey, cardId, [
    { key: 'occupancy' },
    { key: 'turnover' },
  ]);

  const filtered = useMemo(() => filterDataByControls(data, controls), [data, controls]);
  const chartData = useMemo(
    () => computeChartSeries(filtered, controls.granularity, intelligence),
    [filtered, controls.granularity, intelligence],
  );

  const decoratedSeries = useMemo(
    () =>
      chartData.series.map(point => ({
        ...point,
        turnover: point.occupancy > 0 ? point.exits / Math.max(1, point.occupancy) : 0,
      })),
    [chartData.series],
  );

  const chartDomId = useMemo(() => generateChartId(`${cardId}-combo`), []);

  const exportCsv = () => {
    const rows = decoratedSeries.map(point => ({
      timestamp: point.bucketStart,
      occupancy: point.occupancy,
      exits: point.exits,
      turnover_rate: Number(point.turnover.toFixed(3)),
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
        title="Turnover vs occupancy"
        subtitle="Exit rate relative to occupancy per bucket"
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
        exportDisabled={!decoratedSeries.length}
        disablePerCamera
        seriesConfig={[
          { key: 'occupancy', label: 'Occupancy', color: 'var(--vrm-color-accent-occupancy)' },
          { key: 'turnover', label: 'Turnover', color: 'var(--vrm-color-accent-exits)' },
        ]}
        visibleSeries={visibility}
        onToggleSeries={toggleSeries}
      />
      <div className="vrm-card-body">
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={decoratedSeries} margin={{ top: 16, right: 32, bottom: 8, left: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--vrm-border)" />
            <XAxis dataKey="label" stroke="var(--vrm-text-muted)" tickLine={false} axisLine={false} />
            <YAxis
              yAxisId="occupancy"
              stroke="var(--vrm-text-muted)"
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <YAxis
              yAxisId="turnover"
              orientation="right"
              stroke="var(--vrm-text-muted)"
              tickLine={false}
              axisLine={false}
              tickFormatter={value => `${(value as number * 100).toFixed(0)}%`}
            />
            <Tooltip
              cursor={{ fill: 'rgba(255, 255, 255, 0.04)' }}
              formatter={(value: number, key: string) => {
                if (key === 'turnover') {
                  return [`${(value * 100).toFixed(1)}%`, 'Turnover rate'];
                }
                return [value.toLocaleString(), 'Occupancy'];
              }}
            />
            {visibility.occupancy && (
              <Area
                yAxisId="occupancy"
                dataKey="occupancy"
                type="monotone"
                stroke="var(--vrm-color-accent-occupancy)"
                fill="var(--vrm-color-accent-occupancy)"
                fillOpacity={0.1}
                strokeWidth={2}
              />
            )}
            {visibility.turnover && (
              <Line
                yAxisId="turnover"
                dataKey="turnover"
                type="monotone"
                stroke="var(--vrm-color-accent-exits)"
                strokeWidth={2}
                dot={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default TurnoverOccupancyCard;
