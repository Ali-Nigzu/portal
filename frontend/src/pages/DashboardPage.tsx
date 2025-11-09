import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import ConfigurableChart from '../components/ConfigurableChart';
import KPITile from '../components/KPITile';
import InsightRail, { InsightItem } from '../components/InsightRail';
import { API_ENDPOINTS } from '../config';
import {
  ChartData,
  calculateAverageDwellTime,
  calculateCurrentOccupancy,
  calculateDwellDurations,
  formatDuration,
} from '../utils/dataProcessing';
import { computeChartSeries } from '../hooks/useChartData';
import { IntelligencePayload } from '../types/analytics';
import { useGlobalControls } from '../context/GlobalControlsContext';
import { filterDataByControls, getDateRangeFromPreset, deriveComparisonRange } from '../utils/rangeUtils';
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

const percentile = (values: number[], ratio: number) => {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.round(ratio * (sorted.length - 1)));
  return sorted[index];
};

const DashboardPage: React.FC<DashboardPageProps> = ({ credentials }) => {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flowControlsState, setFlowControlsState] = useState<CardControlState | null>(null);
  const globalControls = useGlobalControls();
  const navigate = useNavigate();

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

  const globalDefaults = useMemo(() => buildGlobalCardState(globalControls), [globalControls]);
  const activeFlowControls = flowControlsState ?? globalDefaults;

  const flowFiltered = useMemo(
    () => filterDataByControls(dataset, activeFlowControls),
    [dataset, activeFlowControls],
  );

  const flowSeriesData = useMemo(
    () => computeChartSeries(flowFiltered, activeFlowControls.granularity, intelligence),
    [flowFiltered, activeFlowControls.granularity, intelligence],
  );

  const range = useMemo(
    () => getDateRangeFromPreset(activeFlowControls.rangePreset, activeFlowControls.customRange),
    [activeFlowControls.rangePreset, activeFlowControls.customRange],
  );

  const comparisonRange = useMemo(
    () => deriveComparisonRange(range, 'previous_period'),
    [range],
  );

  const previousFiltered = useMemo(
    () => (comparisonRange ? filterDataByControls(dataset, activeFlowControls, { rangeOverride: comparisonRange }) : []),
    [dataset, activeFlowControls, comparisonRange],
  );

  const previousSeriesData = useMemo(
    () => computeChartSeries(previousFiltered, activeFlowControls.granularity, intelligence),
    [previousFiltered, activeFlowControls.granularity, intelligence],
  );

  const bucketMinutes = flowSeriesData.series[0]?.bucketMinutes ?? 60;
  const throughputSeries = flowSeriesData.series.map(point =>
    point.bucketMinutes > 0 ? point.activity / point.bucketMinutes : 0,
  );
  const previousThroughputSeries = previousSeriesData.series.map(point =>
    point.bucketMinutes > 0 ? point.activity / point.bucketMinutes : 0,
  );
  const throughput95th = percentile(throughputSeries, 0.95);

  const latestPoint = flowSeriesData.series[flowSeriesData.series.length - 1];
  const previousPoint = flowSeriesData.series[flowSeriesData.series.length - 2];

  const liveOccupancy = latestPoint
    ? latestPoint.occupancy
    : calculateCurrentOccupancy(flowFiltered);
  const previousOccupancy = previousPoint?.occupancy ?? liveOccupancy;

  const throughput = latestPoint ? throughputSeries[throughputSeries.length - 1] : 0;
  const previousThroughput = previousThroughputSeries.length
    ? previousThroughputSeries[previousThroughputSeries.length - 1]
    : throughputSeries.length > 1
    ? throughputSeries[throughputSeries.length - 2]
    : throughput;

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const avgDwellMinutes = calculateAverageDwellTime(flowFiltered);
  const previousAvgDwellMinutes = calculateAverageDwellTime(previousFiltered);
  const dwellDurations = useMemo(() => calculateDwellDurations(flowFiltered), [flowFiltered]);
  const previousDwellDurations = useMemo(() => calculateDwellDurations(previousFiltered), [previousFiltered]);
  const dwellP90 = percentile(dwellDurations, 0.9);
  const previousP90 = percentile(previousDwellDurations, 0.9);
  const dwellDisplay = avgDwellMinutes > 0 ? formatDuration(avgDwellMinutes) : '—';

  const latestEventTimestamp = summary?.latest_timestamp
    ? new Date(summary.latest_timestamp)
    : flowFiltered.length
    ? new Date(flowFiltered[flowFiltered.length - 1].timestamp)
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

  const rangeMinutes = Math.max(1, (range.to.getTime() - range.from.getTime()) / (1000 * 60));
  const expectedBuckets = Math.max(1, Math.round(rangeMinutes / bucketMinutes));
  const coveragePercent = Math.min(100, (flowSeriesData.series.length / expectedBuckets) * 100);

  const surgeBuckets = flowSeriesData.series.filter(point => flowSeriesData.highlightBuckets.includes(point.label));
  const topBuckets = [...surgeBuckets]
    .sort((a, b) => b.activity - a.activity)
    .slice(0, 3);

  const busiestBucket = flowSeriesData.series.reduce(
    (max, point) => (point.occupancy > max.occupancy ? point : max),
    flowSeriesData.series[0] ?? { occupancy: 0, label: '', bucketStart: '', bucketMinutes },
  );

  const todayStartTime = todayStart.getTime();
  const nowTime = now.getTime();
  const todayFiltered = useMemo(() => {
    const rangeOverride = { from: new Date(todayStartTime), to: new Date(nowTime) };
    return filterDataByControls(dataset, activeFlowControls, { rangeOverride });
  }, [dataset, activeFlowControls, todayStartTime, nowTime]);

  const previousDayFiltered = useMemo(() => {
    const start = new Date(todayStartTime - 24 * 60 * 60 * 1000);
    const end = new Date(todayStartTime - 1);
    return filterDataByControls(dataset, activeFlowControls, { rangeOverride: { from: start, to: end } });
  }, [dataset, activeFlowControls, todayStartTime]);

  const todayEntries = todayFiltered.filter(item => item.event === 'entry').length;
  const todayExits = todayFiltered.filter(item => item.event === 'exit').length;
  const previousDayEntries = previousDayFiltered.filter(item => item.event === 'entry').length;
  const previousDayExits = previousDayFiltered.filter(item => item.event === 'exit').length;

  const applyRangeToAll = useCallback(
    (bucketStart: string, bucketDuration: number) => {
      const startDate = new Date(bucketStart);
      if (Number.isNaN(startDate.getTime())) {
        return;
      }
      const endDate = new Date(startDate.getTime() + bucketDuration * 60 * 1000);
      const newRange = { from: startDate.toISOString(), to: endDate.toISOString() };
      globalControls.setRangePreset('custom');
      globalControls.setCustomRange(newRange);
      setFlowControlsState(prev => ({
        ...(prev ?? globalDefaults),
        rangePreset: 'custom',
        customRange: newRange,
      }));
    },
    [globalControls, globalDefaults],
  );

  const insightItems: InsightItem[] = useMemo(() => {
    const items: InsightItem[] = [];

    if (topBuckets.length) {
      items.push({
        id: 'peak-windows',
        title: 'Peak windows detected',
        description: topBuckets
          .map(bucket => `${bucket.label} · ${bucket.activity.toLocaleString()} events`)
          .join(' \u2022 '),
        tone: 'info',
        action: topBuckets.length
          ? {
              label: 'Zoom',
              onClick: () => applyRangeToAll(topBuckets[0].bucketStart, topBuckets[0].bucketMinutes),
            }
          : undefined,
      });
    }

    const rangeQuery = new URLSearchParams({ from: range.from.toISOString(), to: range.to.toISOString() }).toString();

    items.push({
      id: 'coverage',
      title: 'Coverage quality',
      description: `Data covers ${coveragePercent.toFixed(1)}% of the expected window`,
      tone: coveragePercent < 80 ? 'warning' : 'success',
      action: {
        label: 'Open device list',
        href: `/device-list?${rangeQuery}`,
      },
    });

    items.push({
      id: 'dwell-anomaly',
      title: 'Dwell anomaly',
      description:
        dwellDurations.length > 0
          ? `P90 dwell ${dwellP90.toFixed(1)}m (${(dwellP90 - previousP90).toFixed(1)}m vs prior)`
          : 'Not enough matched sessions',
      tone: dwellDurations.length > 0 && dwellP90 - previousP90 > 10 ? 'warning' : 'info',
      action: {
        label: 'Open event logs',
        href: `/event-logs?${rangeQuery}`,
      },
    });

    items.push({
      id: 'staffing-hint',
      title: 'Staffing hint',
      description:
        busiestBucket && busiestBucket.label
          ? `Forecast occupancy ${Math.round(busiestBucket.occupancy)} near ${busiestBucket.label}`
          : 'Insufficient data for staffing guidance',
      tone: busiestBucket.occupancy > 120 ? 'warning' : 'info',
      action: {
        label: 'Create alarm rule',
        href: `/alarm-logs?${rangeQuery}`,
      },
    });

    return items;
  }, [
    topBuckets,
    coveragePercent,
    dwellDurations.length,
    dwellP90,
    previousP90,
    busiestBucket,
    applyRangeToAll,
    range.from,
    range.to,
  ]);

  const totalTraffic = flowSeriesData.totalActivity;
  const previousTotalTraffic = previousSeriesData.totalActivity;

  const kpiTiles = [
    {
      key: 'live-occupancy',
      title: 'Live occupancy',
      value: liveOccupancy.toLocaleString(),
      delta: formatDelta(liveOccupancy, previousOccupancy),
      color: 'var(--vrm-color-accent-occupancy)',
      caption: `${flowSeriesData.series.length.toLocaleString()} buckets in range`,
    },
    {
      key: 'throughput',
      title: 'Throughput',
      value: throughput.toFixed(1),
      unit: 'events/min',
      delta: formatDelta(throughput, previousThroughput),
      color: 'var(--vrm-color-accent-entrances)',
      caption: `Total traffic ${flowSeriesData.totalActivity.toLocaleString()}`,
      badgeLabel: throughput > throughput95th ? 'Surge' : undefined,
      badgeTone: throughput > throughput95th ? ('warning' as const) : undefined,
    },
    {
      key: 'entrances',
      title: 'Entrances today',
      value: todayEntries.toLocaleString(),
      delta: formatDelta(todayEntries, previousDayEntries),
      color: 'var(--vrm-color-accent-entrances)',
      caption: 'Updates with local midnight',
    },
    {
      key: 'exits',
      title: 'Exits today',
      value: todayExits.toLocaleString(),
      delta: formatDelta(todayExits, previousDayExits),
      color: 'var(--vrm-color-accent-exits)',
      caption: 'Updates with local midnight',
    },
    {
      key: 'total-traffic',
      title: 'Total traffic',
      value: totalTraffic.toLocaleString(),
      delta: formatDelta(totalTraffic, previousTotalTraffic),
      color: 'var(--vrm-color-accent-entrances)',
      caption: 'Entrances + exits in view',
    },
    {
      key: 'avg-dwell',
      title: 'Avg dwell time',
      value: dwellDisplay,
      delta: formatDelta(avgDwellMinutes, previousAvgDwellMinutes),
      color: 'var(--vrm-color-accent-dwell)',
      caption: dwellDurations.length ? `P90 ${dwellP90.toFixed(1)}m` : 'No matched sessions',
    },
    {
      key: 'freshness',
      title: 'Data freshness',
      value: freshnessStatus === 'ok' ? 'OK' : freshnessStatus === 'warning' ? 'Warning' : 'Stale',
      delta: { label: freshnessCaption, trend: 'neutral' as const },
      color:
        freshnessStatus === 'stale'
          ? 'var(--vrm-color-accent-exits)'
          : freshnessStatus === 'warning'
          ? 'var(--vrm-color-accent-dwell)'
          : 'var(--vrm-color-accent-entrances)',
      caption: summary?.latest_timestamp
        ? new Date(summary.latest_timestamp).toLocaleString()
        : 'No recent events',
    },
    {
      key: 'alarms',
      title: 'Active alarms',
      value: '0',
      delta: { label: 'High/Med/Low: 0 / 0 / 0', trend: 'neutral' as const },
      color: 'var(--vrm-color-accent-exits)',
      caption: 'Tap to review alarm rules',
      onClick: () => navigate('/alarm-logs'),
    },
  ];

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
          <div className="vrm-kpi-grid">
            {kpiTiles.map(tile => (
              <KPITile
                key={tile.key}
                title={tile.title}
                value={tile.value}
                unit={tile.unit}
                deltaLabel={tile.delta.label}
                trend={tile.delta.trend}
                color={tile.color}
                caption={tile.caption}
                badgeLabel={tile.badgeLabel}
                badgeTone={tile.badgeTone}
                onClick={tile.onClick}
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
            onControlsChange={setFlowControlsState}
            isLoading={loading}
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
