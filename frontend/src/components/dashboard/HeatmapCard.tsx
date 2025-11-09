import React, { useMemo, useState } from 'react';
import CardControlHeader from '../CardControlHeader';
import { useCardControls } from '../../hooks/useCardControls';
import { filterDataByControls } from '../../utils/rangeUtils';
import { computeChartSeries } from '../../hooks/useChartData';
import { ChartData } from '../../utils/dataProcessing';
import { IntelligencePayload } from '../../types/analytics';
import { exportChartAsPNG, exportDataAsCSV, generateChartId } from '../../utils/exportUtils';
import { useGlobalControls } from '../../context/GlobalControlsContext';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface HeatmapCell {
  weekday: number;
  hour: number;
  total: number;
  samples: number;
  average: number;
  representativeStart?: string;
  peakActivity: number;
  bucketMinutes: number;
}

interface HeatmapCardProps {
  data: ChartData[];
  intelligence?: IntelligencePayload | null;
}

const formatHour = (hour: number) => `${hour.toString().padStart(2, '0')}:00`;

const HeatmapCard: React.FC<HeatmapCardProps> = ({ data, intelligence }) => {
  const cardId = 'analytics-heatmap';
  const routeKey = 'analytics';
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
  } = useCardControls(routeKey, cardId);

  const filtered = useMemo(() => filterDataByControls(data, controls), [data, controls]);
  const { series } = useMemo(
    () => computeChartSeries(filtered, controls.granularity, intelligence),
    [filtered, controls.granularity, intelligence],
  );

  const cells = useMemo(() => {
    const base: HeatmapCell[] = [];
    for (let weekday = 0; weekday < 7; weekday += 1) {
      for (let hour = 0; hour < 24; hour += 1) {
        base.push({
          weekday,
          hour,
          total: 0,
          samples: 0,
          average: 0,
          representativeStart: undefined,
          peakActivity: 0,
          bucketMinutes: 60,
        });
      }
    }

    const buckets = [...base];

    series.forEach(point => {
      const start = new Date(point.bucketStart);
      if (Number.isNaN(start.getTime())) {
        return;
      }

      const weekday = (start.getDay() + 6) % 7;
      const hour = start.getHours();
      const index = weekday * 24 + hour;
      const cell = buckets[index];
      if (!cell) {
        return;
      }

      cell.total += point.activity;
      cell.samples += 1;
      cell.bucketMinutes = point.bucketMinutes;
      if (!cell.representativeStart || point.activity > cell.peakActivity) {
        cell.representativeStart = point.bucketStart;
        cell.peakActivity = point.activity;
      }
    });

    return buckets.map(cell => ({
      ...cell,
      average: cell.samples ? cell.total / cell.samples : 0,
    }));
  }, [series]);

  const maxValue = useMemo(() => Math.max(...cells.map(cell => cell.average), 0.0001), [cells]);
  const [selected, setSelected] = useState<HeatmapCell | null>(null);

  const chartDomId = useMemo(() => generateChartId(`${cardId}-heatmap`), []);
  const hasCameraData = useMemo(() => data.some(item => item.camera_id != null), [data]);

  const exportCsv = () => {
    const rows = cells.map(cell => ({
      weekday: WEEKDAYS[cell.weekday],
      hour: formatHour(cell.hour),
      average_activity: Number(cell.average.toFixed(2)),
      samples: cell.samples,
    }));
    exportDataAsCSV(rows, `${routeKey}_${cardId}_${controls.rangePreset}_${controls.granularity}`);
  };

  const exportPng = () => {
    exportChartAsPNG(chartDomId, `${routeKey}_${cardId}_${controls.rangePreset}_${controls.granularity}`);
  };

  const applySelection = (cell: HeatmapCell) => {
    if (!cell.representativeStart) {
      return;
    }
    const start = new Date(cell.representativeStart);
    if (Number.isNaN(start.getTime())) {
      return;
    }
    const end = new Date(start.getTime() + cell.bucketMinutes * 60 * 1000);
    const fromIso = start.toISOString();
    const toIso = end.toISOString();
    setCustomRange({ from: fromIso, to: toIso });
    setSelected(cell);
  };

  const applySelectionToAll = () => {
    if (!selected?.representativeStart) {
      return;
    }
    const start = new Date(selected.representativeStart);
    const end = new Date(start.getTime() + selected.bucketMinutes * 60 * 1000);
    const fromIso = start.toISOString();
    const toIso = end.toISOString();
    globalControls.setRangePreset('custom');
    globalControls.setCustomRange({ from: fromIso, to: toIso });
  };

  return (
    <div className="vrm-card" id={chartDomId}>
      <CardControlHeader
        cardId={cardId}
        title="Activity by hour"
        subtitle="Average activity across hours and weekdays"
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
        exportDisabled={!cells.some(cell => cell.samples > 0)}
        disablePerCamera={!hasCameraData}
        showGranularity={false}
        showSegments={false}
        showSeries={false}
        showScope={hasCameraData}
      />
      <div className="vrm-card-body vrm-card-body--stacked">
        <div className="vrm-heatmap">
          <div className="vrm-heatmap-header">
            <span className="vrm-heatmap-corner">Weekday / Hour</span>
            {Array.from({ length: 24 }).map((_, hour) => (
              <span key={hour} className="vrm-heatmap-hour">
                {hour % 3 === 0 ? formatHour(hour) : ''}
              </span>
            ))}
          </div>
          {WEEKDAYS.map((weekdayLabel, weekday) => (
            <div key={weekdayLabel} className="vrm-heatmap-row">
              <span className="vrm-heatmap-weekday">{weekdayLabel}</span>
              {Array.from({ length: 24 }).map((_, hour) => {
                const cell = cells[weekday * 24 + hour];
                const intensity = cell.average / maxValue;
                const active = selected?.weekday === weekday && selected?.hour === hour;
                const ariaLabel = `${weekdayLabel} ${formatHour(hour)} activity ${cell.average.toFixed(1)} events`;
                return (
                  <button
                    type="button"
                    key={`${weekday}-${hour}`}
                    className={`vrm-heatmap-cell ${active ? 'active' : ''}`}
                    style={{ background: `rgba(38, 133, 255, ${Math.max(0.08, intensity)})` }}
                    onClick={() => applySelection(cell)}
                    aria-label={ariaLabel}
                  >
                    {cell.average > 0 ? Math.round(cell.average) : ''}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        {selected && (
          <div className="vrm-heatmap-selection" role="status">
            <span>
              Focused on {WEEKDAYS[selected.weekday]} at {formatHour(selected.hour)} ·
              {' '}
              Avg activity {selected.average.toFixed(1)}
            </span>
            <div className="vrm-brush-buttons">
              <button
                type="button"
                className="vrm-btn vrm-btn-secondary vrm-btn-sm"
                onClick={applySelectionToAll}
              >
                Apply to all cards
              </button>
              <button
                type="button"
                className="vrm-btn vrm-btn-tertiary vrm-btn-sm"
                onClick={() => setSelected(null)}
              >
                Clear focus
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HeatmapCard;
