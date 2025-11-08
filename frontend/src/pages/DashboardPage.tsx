import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ConfigurableChart from '../components/ConfigurableChart';
import KPITile from '../components/KPITile';
import { API_ENDPOINTS } from '../config';
import {
  calculateAverageDwellTime,
  calculateCurrentOccupancy,
  ChartData,
  formatDuration,
} from '../utils/dataProcessing';
import { useChartData } from '../hooks/useChartData';
import { IntelligencePayload } from '../types/analytics';
import InsightRail, { InsightItem } from '../components/InsightRail';
import { useGlobalControls } from '../context/GlobalControlsContext';
import { filterDataByControls } from '../utils/rangeUtils';
import { CardControlState } from '../hooks/useCardControls';
import { InteractionProvider } from '../context/InteractionContext';

interface ApiResponse {
  data: ChartData[];
  summary: {
    total_records: number;
    filtered_from: number;
    date_range: {
      start: string | null;
      end: string | null;
    };
    latest_timestamp: string | null;
  };
  intelligence: IntelligencePayload | null;
}

interface DashboardPageProps {
  credentials: { username: string; password: string };
}

const GRANULARITY_MINUTES: Record<string, number> = {
  '5m': 5,
  '15m': 15,
  hour: 60,
  day: 60 * 24,
  week: 60 * 24 * 7,
};

const buildGlobalCardState = (global: ReturnType<typeof useGlobalControls>): CardControlState => ({
  rangePreset: global.rangePreset,
  customRange: global.customRange,
  granularity: global.granularity,
  scope: global.scope,
  segments: global.segments,
  compare: global.compare,
});

const formatDelta = (current: number, previous: number) => {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return { label: '—', trend: 'neutral' as const };
  }
  const change = current - previous;
  const percentage = (change / Math.abs(previous)) * 100;
  const rounded = `${change >= 0 ? '+' : '−'}${Math.abs(percentage).toFixed(1)}%`;
  if (Math.abs(percentage) < 0.1) {
    return { label: '0.0%', trend: 'neutral' as const };
  }
  return {
    label: rounded,
    trend: change > 0 ? ('up' as const) : ('down' as const),
  };
};

const DashboardPage: React.FC<DashboardPageProps> = ({ credentials }) => {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const globalControls = useGlobalControls();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      const urlParams = new URLSearchParams(window.location.search);
      const viewToken = urlParams.get('view_token');
      const clientId = urlParams.get('client_id');

      const queryParams = new URLSearchParams();
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      if (viewToken) {
        queryParams.append('view_token', viewToken);
      } else {
        const auth = btoa(`${credentials.username}:${credentials.password}`);
        headers['Authorization'] = `Basic ${auth}`;

        if (clientId) {
          queryParams.append('client_id', clientId);
        }
      }

      const apiUrl = `${API_ENDPOINTS.CHART_DATA}?${queryParams.toString()}`;
      const response = await fetch(apiUrl, { headers });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: ApiResponse = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(`Failed to fetch data: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [credentials.username, credentials.password]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const dataset = useMemo(() => data?.data ?? [], [data]);
  const intelligence = data?.intelligence ?? null;
  const summary = data?.summary;

  const globalCardState = useMemo(() => buildGlobalCardState(globalControls), [globalControls]);
  const filteredForKpis = useMemo(
    () => filterDataByControls(dataset, globalCardState),
    [dataset, globalCardState],
  );

  const {
    series: kpiSeries,
    activeGranularity: kpiGranularity,
    totalActivity: totalActivityInRange,
  } = useChartData(filteredForKpis, globalControls.granularity, intelligence);

  const latestOccupancyPoint = kpiSeries[kpiSeries.length - 1];
  const previousOccupancyPoint = kpiSeries[kpiSeries.length - 2];

  const liveOccupancy = latestOccupancyPoint
    ? latestOccupancyPoint.occupancy
    : calculateCurrentOccupancy(filteredForKpis);
  const previousOccupancy = previousOccupancyPoint?.occupancy ?? liveOccupancy;

  const minutesPerBucket = GRANULARITY_MINUTES[kpiGranularity] ?? 60;
  const throughput = latestOccupancyPoint ? latestOccupancyPoint.activity / minutesPerBucket : 0;
  const previousThroughput = previousOccupancyPoint
    ? previousOccupancyPoint.activity / minutesPerBucket
    : throughput;

  const throughputSparkline = kpiSeries.map(point => point.activity / minutesPerBucket);
  const occupancySparkline = kpiSeries.map(point => point.occupancy);

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const todayEntries = filteredForKpis.filter(item => {
    const timestamp = new Date(item.timestamp);
    return timestamp >= todayStart && timestamp <= now && item.event === 'entry';
  }).length;

  const todayExits = filteredForKpis.filter(item => {
    const timestamp = new Date(item.timestamp);
    return timestamp >= todayStart && timestamp <= now && item.event === 'exit';
  }).length;

  const avgDwellMinutes = intelligence?.avg_dwell_minutes ?? calculateAverageDwellTime(filteredForKpis);
  const dwellDisplay = avgDwellMinutes > 0 ? formatDuration(avgDwellMinutes) : '—';

  const latestEventTimestamp = summary?.latest_timestamp
    ? new Date(summary.latest_timestamp)
    : filteredForKpis.length
    ? new Date(filteredForKpis[filteredForKpis.length - 1].timestamp)
    : null;
  const freshnessMinutes = latestEventTimestamp
    ? Math.max(0, (now.getTime() - latestEventTimestamp.getTime()) / (1000 * 60))
    : Infinity;

  let freshnessStatus: 'ok' | 'warning' | 'stale' = 'ok';
  if (freshnessMinutes > 10) {
    freshnessStatus = 'stale';
  } else if (freshnessMinutes > 2) {
    freshnessStatus = 'warning';
  }

  const freshnessCaption = latestEventTimestamp
    ? `Updated ${freshnessMinutes < 1 ? '<1' : Math.round(freshnessMinutes)}m ago`
    : 'No events in range';

  const kpiTiles = [
    {
      title: 'Live occupancy',
      value: liveOccupancy.toLocaleString(),
      delta: formatDelta(liveOccupancy, previousOccupancy),
      sparkline: occupancySparkline,
      color: 'var(--vrm-color-accent-occupancy)',
      caption: `${occupancySparkline.length} buckets in view`,
    },
    {
      title: 'Throughput',
      value: throughput.toFixed(1),
      unit: 'events/min',
      delta: formatDelta(throughput, previousThroughput),
      sparkline: throughputSparkline,
      color: 'var(--vrm-color-accent-entrances)',
      caption: `${totalActivityInRange.toLocaleString()} events in range`,
    },
    {
      title: 'Entrances today',
      value: todayEntries.toLocaleString(),
      delta: { label: 'Daily total', trend: 'neutral' as const },
      sparkline: kpiSeries.map(point => point.entries),
      color: 'var(--vrm-color-accent-entrances)',
      caption: 'Local day window',
    },
    {
      title: 'Exits today',
      value: todayExits.toLocaleString(),
      delta: { label: 'Daily total', trend: 'neutral' as const },
      sparkline: kpiSeries.map(point => point.exits),
      color: 'var(--vrm-color-accent-exits)',
      caption: 'Local day window',
    },
    {
      title: 'Avg dwell time',
      value: dwellDisplay,
      delta: { label: 'vs. previous bucket', trend: 'neutral' as const },
      sparkline: throughputSparkline,
      color: 'var(--vrm-color-accent-dwell)',
      caption: 'Visitor stay duration',
    },
    {
      title: 'Data freshness',
      value:
        freshnessStatus === 'ok'
          ? 'OK'
          : freshnessStatus === 'warning'
          ? 'Warning'
          : 'Stale',
      delta: { label: freshnessCaption, trend: 'neutral' as const },
      sparkline: [],
      color: freshnessStatus === 'stale'
        ? 'var(--vrm-color-accent-exits)'
        : freshnessStatus === 'warning'
        ? 'var(--vrm-color-accent-dwell)'
        : 'var(--vrm-color-accent-entrances)',
      caption: summary?.latest_timestamp ? new Date(summary.latest_timestamp).toLocaleString() : 'No recent events',
    },
    {
      title: 'Active alarms',
      value: '0',
      delta: { label: 'No active alerts', trend: 'neutral' as const },
      sparkline: [],
      color: 'var(--vrm-color-accent-exits)',
      caption: 'Alarm integration pending',
    },
  ];

  const insightItems: InsightItem[] = useMemo(() => {
    if (!intelligence || !kpiSeries.length) {
      return [];
    }

    const insights: InsightItem[] = [];
    const maxOccupancyPoint = kpiSeries.reduce((max, point) =>
      point.occupancy > max.occupancy ? point : max,
    kpiSeries[0]);

    insights.push({
      id: 'max-occupancy',
      title: 'Occupancy apex',
      description: `Peak occupancy reached ${maxOccupancyPoint.occupancy.toLocaleString()} during ${maxOccupancyPoint.label}.`,
      tone: maxOccupancyPoint.occupancy > liveOccupancy * 1.5 ? 'warning' : 'info',
    });

    if (intelligence.peak_hours && intelligence.peak_hours.length) {
      const formatted = intelligence.peak_hours
        .map(hour => `${hour.toString().padStart(2, '0')}:00`)
        .join(', ');
      insights.push({
        id: 'peak-hours',
        title: 'Peak hours identified',
        description: `Highest throughput observed around ${formatted}.`,
      });
    }

    if (avgDwellMinutes > 0) {
      insights.push({
        id: 'avg-dwell',
        title: 'Average dwell time',
        description: `Visitors spend approximately ${avgDwellMinutes.toFixed(1)} minutes on-site.`,
        tone: avgDwellMinutes > 60 ? 'warning' : 'info',
      });
    }

    const spanDays = intelligence.date_span_days ?? 0;
    if (spanDays > 0 || totalActivityInRange > 0) {
      insights.push({
        id: 'coverage-window',
        title: 'Coverage window',
        description: `Dataset spans ${spanDays} day${spanDays === 1 ? '' : 's'} with ${totalActivityInRange.toLocaleString()} events.`,
        tone: spanDays >= 30 ? 'success' : 'info',
      });
    }

    return insights;
  }, [intelligence, kpiSeries, liveOccupancy, avgDwellMinutes, totalActivityInRange]);

  if (loading) {
    return (
      <div className="vrm-loading-viewport">
        <div className="vrm-card-body--centered">
          <div className="vrm-loading-spinner" />
          <p className="vrm-text-secondary">Loading system data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="vrm-card">
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">⚠️ Connection Error</h3>
        </div>
        <div className="vrm-card-body">
          <p className="vrm-text-danger vrm-mb-4">{error}</p>
          <button className="vrm-btn" onClick={fetchData}>Retry Connection</button>
        </div>
      </div>
    );
  }

  return (
    <InteractionProvider pageKey="dashboard">
      <div>
        <div className="vrm-section">
          <div>
            <h1 className="vrm-page-title">System Overview</h1>
            <div className="vrm-breadcrumb">
              <span>Dashboard</span>
              <span>›</span>
              <span>Overview</span>
            </div>
          </div>
        </div>

        <section className="vrm-section">
          <div className="vrm-grid vrm-grid-4">
            {kpiTiles.map(tile => (
              <KPITile
                key={tile.title}
                title={tile.title}
                value={tile.value}
                unit={tile.unit}
                deltaLabel={tile.delta.label}
                trend={tile.delta.trend}
                sparklineData={tile.sparkline}
                color={tile.color}
                caption={tile.caption}
              />
            ))}
          </div>
        </section>

        <section className="vrm-section">
          <ConfigurableChart
            cardId="dashboard-flow"
            routeKey="dashboard"
            title="Interactive activity flow"
            subtitle="Occupancy, entrances, and exits across the selected window"
            data={dataset}
            intelligence={intelligence}
          />
        </section>

        <section className="vrm-section">
          <InsightRail insights={insightItems} />
        </section>
      </div>
    </InteractionProvider>
  );
};

export default DashboardPage;
