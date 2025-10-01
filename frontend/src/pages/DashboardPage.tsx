import React, { useState, useEffect, useCallback } from 'react';
import ConfigurableChart from '../components/ConfigurableChart';
import { API_ENDPOINTS } from '../config';
import TimeFilterDropdown, { TimeFilterValue } from '../components/TimeFilterDropdown';
import { calculateAverageDwellTime, formatDuration, filterDataByTime, calculateCurrentOccupancy } from '../utils/dataProcessing';

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
  intelligence: {
    total_records: number;
    date_span_days: number;
    latest_timestamp: string | null;
    optimal_granularity: string;
    peak_hours: number[];
    demographics_breakdown: any;
    temporal_patterns: any;
  };
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

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      const urlParams = new URLSearchParams(window.location.search);
      const viewToken = urlParams.get('view_token');
      const clientId = urlParams.get('client_id');
      
      let apiUrl = API_ENDPOINTS.CHART_DATA;
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      
      if (viewToken) {
        apiUrl += `?view_token=${encodeURIComponent(viewToken)}`;
      } else {
        const auth = btoa(`${credentials.username}:${credentials.password}`);
        headers['Authorization'] = `Basic ${auth}`;
        
        if (clientId) {
          apiUrl += `?client_id=${encodeURIComponent(clientId)}`;
        }
      }
      
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

  if (!data) {
    return null;
  }

  // Filter data independently for KPIs and chart
  const kpiFilteredData = filterDataByTime(data.data, kpiTimeFilter);
  const chartFilteredData = filterDataByTime(data.data, chartTimeFilter);
  
  // Calculate KPI metrics from KPI filtered data
  const liveOccupancy = calculateCurrentOccupancy(kpiFilteredData);
  const totalTraffic = kpiFilteredData.length;

  // Calculate peak activity time from KPI filtered data
  const hourlyActivity = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  kpiFilteredData.forEach(item => {
    if (item.hour >= 0 && item.hour < 24) {
      hourlyActivity[item.hour].count++;
    }
  });
  const peakHour = hourlyActivity.reduce((max, current) => 
    current.count > max.count ? current : max
  ).hour;

  // Calculate average dwell time from KPI filtered data
  const avgDwellTime = calculateAverageDwellTime(kpiFilteredData);

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
              {peakHour !== undefined ? `${peakHour.toString().padStart(2, '0')}:00` : 'N/A'}
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
        <ConfigurableChart data={chartFilteredData} intelligence={data.intelligence} />
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