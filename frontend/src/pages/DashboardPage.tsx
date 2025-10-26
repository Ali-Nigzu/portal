import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ConfigurableChart from '../components/ConfigurableChart';
import { API_ENDPOINTS } from '../config';
import TimeFilterDropdown, { TimeFilterValue } from '../components/TimeFilterDropdown';
import { calculateAverageDwellTime, formatDuration, filterDataByTime, calculateCurrentOccupancy } from '../utils/dataProcessing';
import { useChartData, NormalizedChartPoint } from '../hooks/useChartData';
import { GranularityOption, IntelligencePayload } from '../types/analytics';
import InsightRail, { InsightItem } from '../components/InsightRail';

interface ChartData {
  index: number;
  track_number: number;
  event: string;
  timestamp: string;
  sex: string;
  age_estimate: string;
  hour: number;
  day_of_week: string;
  date: string;
}

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

const DashboardPage: React.FC<DashboardPageProps> = ({ credentials }) => {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Independent time filters for dashboard components
  const [kpiTimeFilter, setKpiTimeFilter] = useState<TimeFilterValue>({ option: 'last7days' });
  const [chartTimeFilter, setChartTimeFilter] = useState<TimeFilterValue>({ option: 'last7days' });
  const [granularitySelection, setGranularitySelection] = useState<GranularityOption>('auto');

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
      
      if (kpiTimeFilter.option !== 'alltime') {
        const now = new Date();
        let startDate: Date;
        let endDate: Date = now;

        switch (kpiTimeFilter.option) {
          case 'last24h':
            startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            break;
          case 'last7days':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case 'last30days':
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          case 'custom':
            if (kpiTimeFilter.startDate && kpiTimeFilter.endDate) {
              startDate = new Date(kpiTimeFilter.startDate);
              endDate = new Date(kpiTimeFilter.endDate + 'T23:59:59');
            } else {
              startDate = now;
            }
            break;
          default:
            startDate = now;
        }

        queryParams.append('kpi_start_date', startDate.toISOString().split('T')[0]);
        queryParams.append('kpi_end_date', endDate.toISOString().split('T')[0]);
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
  }, [credentials.username, credentials.password, kpiTimeFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const dataset = data?.data ?? [];
  const summary = data?.summary;
  const intelligence = data?.intelligence ?? null;

  // Filter data independently for KPIs and chart
  const kpiFilteredData = filterDataByTime(dataset, kpiTimeFilter);
  const chartFilteredData = filterDataByTime(dataset, chartTimeFilter);

  const {
    series: chartSeries,
    activeGranularity,
    recommendedGranularity,
    highlightBuckets,
    averageOccupancy,
    totalActivity: chartTotalActivity
  } = useChartData(chartFilteredData, granularitySelection, intelligence);

  const {
    series: kpiSeries,
    activeGranularity: kpiGranularity,
    totalActivity: kpiTotalActivity
  } = useChartData(kpiFilteredData, granularitySelection, intelligence);

  const liveOccupancy = kpiSeries.length
    ? kpiSeries[kpiSeries.length - 1].occupancy
    : calculateCurrentOccupancy(kpiFilteredData);

  const totalTraffic = summary?.total_records ?? kpiTotalActivity;

  const peakBucket = kpiSeries.reduce<NormalizedChartPoint | null>((max, current) => {
    if (!max || current.activity > max.activity) {
      return current;
    }
    return max;
  }, null);

  const peakDescriptor = peakBucket
    ? (() => {
        const bucketDate = new Date(peakBucket.bucketStart);
        if (!Number.isNaN(bucketDate.getTime())) {
          if (kpiGranularity === 'hourly') {
            return bucketDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
          }
          if (kpiGranularity === 'daily') {
            return bucketDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
          }
          if (kpiGranularity === 'weekly') {
            const weekEnd = new Date(bucketDate);
            weekEnd.setDate(weekEnd.getDate() + 6);
            return `${bucketDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
          }
        }
        return peakBucket.label;
      })()
    : intelligence?.temporal_patterns && typeof intelligence.temporal_patterns === 'object'
    ? (() => {
        const patterns = intelligence!.temporal_patterns as Record<string, any>;
        const peakTimes = patterns?.peak_times as { hour?: number } | undefined;
        if (peakTimes?.hour !== undefined) {
          return `${peakTimes.hour.toString().padStart(2, '0')}:00`;
        }
        return 'N/A';
      })()
    : 'N/A';

  const avgDwellTime: number = intelligence?.avg_dwell_minutes ?? calculateAverageDwellTime(kpiFilteredData);

  const insightItems: InsightItem[] = useMemo(() => {
    if (!intelligence) {
      return [];
    }

    const insights: InsightItem[] = [];
    const { peak_hours: peakHours, avg_dwell_minutes: avgDwell, date_span_days: spanDaysRaw } = intelligence;
    const spanDays = spanDaysRaw ?? 0;

    if (peakHours && peakHours.length > 0) {
      const formatted = peakHours
        .map(hour => `${hour.toString().padStart(2, '0')}:00`)
        .join(', ');
      insights.push({
        id: 'peak-hours',
        title: 'Peak Hours Identified',
        description: `Highest throughput observed around ${formatted}.`
      });
    }

    if (avgDwell && avgDwell > 0) {
      insights.push({
        id: 'avg-dwell',
        title: 'Average dwell time',
        description: `Visitors spend approximately ${formatDuration(avgDwell)} on-site.`,
        tone: avgDwell > 60 ? 'warning' : 'info'
      });
    }

    if (chartSeries.length > 0) {
      const maxOccupancyPoint = chartSeries.reduce((max, point) => (point.occupancy > max.occupancy ? point : max), chartSeries[0]);
      insights.push({
        id: 'max-occupancy',
        title: 'Occupancy apex',
        description: `Peak occupancy reached ${maxOccupancyPoint.occupancy.toLocaleString()} during ${maxOccupancyPoint.label}.`,
        tone: maxOccupancyPoint.occupancy > averageOccupancy * 1.5 ? 'warning' : 'info'
      });
    }

    if (spanDays > 0 || chartTotalActivity > 0) {
      insights.push({
        id: 'coverage-window',
        title: 'Coverage window',
        description: `Dataset spans ${spanDays} day${spanDays === 1 ? '' : 's'} with ${chartTotalActivity.toLocaleString()} recorded events.`,
        tone: spanDays >= 30 ? 'success' : 'info'
      });
    }

    return insights;
  }, [intelligence, chartSeries, averageOccupancy, chartTotalActivity]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '4px solid #333',
            borderTop: '4px solid #1976d2',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }}></div>
          <p style={{ color: 'var(--vrm-text-secondary)' }}>Loading system data...</p>
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
          <p style={{ color: 'var(--vrm-accent-red)', marginBottom: '16px' }}>{error}</p>
          <button className="vrm-btn" onClick={fetchData}>Retry Connection</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Page Header */}
      <div style={{ marginBottom: '24px' }}>
        <div>
          <h1 style={{ color: 'var(--vrm-text-primary)', fontSize: '24px', fontWeight: '600', marginBottom: '8px' }}>
            System Overview
          </h1>
          <div className="vrm-breadcrumb">
            <span>Dashboard</span>
            <span>›</span>
            <span>Overview</span>
          </div>
        </div>
      </div>

      {/* KPI Section with Independent Time Filter */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ color: 'var(--vrm-text-primary)', fontSize: '18px', fontWeight: '600', margin: 0 }}>Key Metrics</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>Time Period:</span>
            <TimeFilterDropdown 
              value={kpiTimeFilter} 
              onChange={setKpiTimeFilter}
            />
          </div>
        </div>
        <div className="vrm-grid vrm-grid-4">
        {/* Live Occupancy */}
        <div className="vrm-card">
          <div className="vrm-card-header">
            <h3 className="vrm-card-title">Current Occupancy</h3>
          </div>
          <div className="vrm-card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', fontWeight: '700', color: 'var(--vrm-accent-blue)', marginBottom: '8px' }}>
              {liveOccupancy}
            </div>
            <p style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>Current occupancy</p>
          </div>
        </div>

        {/* Total Activity */}
        <div className="vrm-card">
          <div className="vrm-card-header">
            <h3 className="vrm-card-title">Total Traffic</h3>
          </div>
          <div className="vrm-card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', fontWeight: '700', color: 'var(--vrm-accent-teal)', marginBottom: '8px' }}>
              {totalTraffic.toLocaleString()}
            </div>
            <p style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>Events in period</p>
          </div>
        </div>

        {/* Peak Hour */}
        <div className="vrm-card">
          <div className="vrm-card-header">
            <h3 className="vrm-card-title">Peak Activity Time</h3>
          </div>
          <div className="vrm-card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', fontWeight: '700', color: 'var(--vrm-accent-orange)', marginBottom: '8px' }}>
              {peakDescriptor}
            </div>
            <p style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>Peak time</p>
          </div>
        </div>

        {/* Average Dwell Time */}
        <div className="vrm-card">
          <div className="vrm-card-header">
            <h3 className="vrm-card-title">Avg. Dwell Time</h3>
          </div>
          <div className="vrm-card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '36px', fontWeight: '700', color: 'var(--vrm-accent-red)', marginBottom: '8px' }}>
              {formatDuration(avgDwellTime)}
            </div>
            <p style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>Average visit duration</p>
          </div>
        </div>
      </div>
      </div>

      {/* Chart Section with Independent Time Filter */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ color: 'var(--vrm-text-primary)', fontSize: '18px', fontWeight: '600', margin: 0 }}>Activity Chart</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>Time Period:</span>
            <TimeFilterDropdown 
              value={chartTimeFilter} 
              onChange={setChartTimeFilter}
            />
          </div>
        </div>
        <ConfigurableChart
          data={chartSeries}
          granularitySelection={granularitySelection}
          activeGranularity={activeGranularity}
          recommendedGranularity={recommendedGranularity}
          onGranularityChange={setGranularitySelection}
          highlightBuckets={highlightBuckets}
          averageOccupancy={averageOccupancy}
        />
      </div>

      {/* Insight Rail */}
      <div style={{ marginBottom: '24px' }}>
        <InsightRail insights={insightItems} />
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default DashboardPage;