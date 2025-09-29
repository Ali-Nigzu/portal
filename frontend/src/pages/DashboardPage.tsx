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
  const [timeFilter, setTimeFilter] = useState<TimeFilterValue>({ option: 'last7days' });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      const auth = btoa(`${credentials.username}:${credentials.password}`);
      
      const response = await fetch(API_ENDPOINTS.CHART_DATA, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      });

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

  // Filter data based on selected time period
  const filteredData = filterDataByTime(data.data, timeFilter);
  
  // Calculate live occupancy from filtered data
  const liveOccupancy = calculateCurrentOccupancy(filteredData);

  // Calculate traffic from filtered data (not just today)
  const totalTraffic = filteredData.length;

  // Calculate peak activity time from filtered data
  const hourlyActivity = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  filteredData.forEach(item => {
    if (item.hour >= 0 && item.hour < 24) {
      hourlyActivity[item.hour].count++;
    }
  });
  const peakHour = hourlyActivity.reduce((max, current) => 
    current.count > max.count ? current : max
  ).hour;

  // Calculate data coverage from filtered data efficiently (avoid spread operator with large arrays)
  const dateCoverage = filteredData.length > 0 ? 
    (() => {
      let minTime = Infinity;
      let maxTime = -Infinity;
      
      filteredData.forEach(d => {
        const time = new Date(d.timestamp).getTime();
        if (time < minTime) minTime = time;
        if (time > maxTime) maxTime = time;
      });
      
      return minTime !== Infinity && maxTime !== -Infinity ? 
        Math.ceil((maxTime - minTime) / (1000 * 60 * 60 * 24)) + 1 : 0;
    })()
    : 0;

  // Calculate average dwell time from filtered data
  const avgDwellTime = calculateAverageDwellTime(filteredData);

  return (
    <div>
      {/* Page Header with Time Filter */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>Time Period:</span>
          <TimeFilterDropdown 
            value={timeFilter} 
            onChange={setTimeFilter}
          />
        </div>
      </div>

      {/* Summary Cards Grid */}
      <div className="vrm-grid vrm-grid-4" style={{ marginBottom: '24px' }}>
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

      {/* Main Configurable Chart */}
      <div style={{ marginBottom: '24px' }}>
        <ConfigurableChart data={filteredData} intelligence={data.intelligence} />
      </div>

      {/* Smart Insights Panel */}
      <div className="vrm-card">
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">Smart Insights</h3>
        </div>
        <div className="vrm-card-body">
          <div className="vrm-grid vrm-grid-3">
            <div style={{ padding: '16px', backgroundColor: 'var(--vrm-bg-tertiary)', borderRadius: '6px', borderLeft: '4px solid var(--vrm-accent-blue)' }}>
              <strong style={{ color: 'var(--vrm-text-primary)' }}>Optimal Viewing:</strong>
              <p style={{ color: 'var(--vrm-text-secondary)', marginTop: '4px', fontSize: '14px' }}>
                {data.intelligence.optimal_granularity} granularity recommended for {data.intelligence.date_span_days}-day span
              </p>
            </div>
            
            <div style={{ padding: '16px', backgroundColor: 'var(--vrm-bg-tertiary)', borderRadius: '6px', borderLeft: '4px solid var(--vrm-accent-teal)' }}>
              <strong style={{ color: 'var(--vrm-text-primary)' }}>Peak Activity:</strong>
              <p style={{ color: 'var(--vrm-text-secondary)', marginTop: '4px', fontSize: '14px' }}>
                Hour {data.intelligence.temporal_patterns.peak_times?.hour || 'N/A'} 
                with {data.intelligence.temporal_patterns.peak_times?.count || 0} records
              </p>
            </div>
            
            <div style={{ padding: '16px', backgroundColor: 'var(--vrm-bg-tertiary)', borderRadius: '6px', borderLeft: '4px solid var(--vrm-accent-purple)' }}>
              <strong style={{ color: 'var(--vrm-text-primary)' }}>Latest Reference:</strong>
              <p style={{ color: 'var(--vrm-text-secondary)', marginTop: '4px', fontSize: '14px' }}>
                {data.intelligence.latest_timestamp 
                  ? new Date(data.intelligence.latest_timestamp).toLocaleString() 
                  : 'No timestamp'} as "current time"
              </p>
            </div>
          </div>
        </div>
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