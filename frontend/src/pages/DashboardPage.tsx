import React, { useState, useEffect, useCallback } from 'react';
import { LiveOccupancyChart, TrafficTimeChart, AgeDistributionChart, EntryExitChart } from '../components/ProfessionalCharts';
import { API_ENDPOINTS } from '../config';

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

  // Calculate live occupancy
  const entriesCount = data.data.filter(d => d.event === 'entry').length;
  const exitsCount = data.data.filter(d => d.event === 'exit').length;
  const liveOccupancy = Math.max(0, entriesCount - exitsCount);

  return (
    <div>
      {/* Page Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ color: 'var(--vrm-text-primary)', fontSize: '24px', fontWeight: '600', marginBottom: '8px' }}>
          System Overview
        </h1>
        <div className="vrm-breadcrumb">
          <span>Dashboard</span>
          <span>›</span>
          <span>Overview</span>
        </div>
      </div>

      {/* Summary Cards Grid */}
      <div className="vrm-grid vrm-grid-4" style={{ marginBottom: '24px' }}>
        {/* Live Occupancy */}
        <div className="vrm-card">
          <div className="vrm-card-header">
            <h3 className="vrm-card-title">Live Occupancy</h3>
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
            <h3 className="vrm-card-title">Total Activity</h3>
          </div>
          <div className="vrm-card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', fontWeight: '700', color: 'var(--vrm-accent-teal)', marginBottom: '8px' }}>
              {data.summary.total_records.toLocaleString()}
            </div>
            <p style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>Events recorded</p>
          </div>
        </div>

        {/* Peak Hour */}
        <div className="vrm-card">
          <div className="vrm-card-header">
            <h3 className="vrm-card-title">Peak Activity</h3>
          </div>
          <div className="vrm-card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', fontWeight: '700', color: 'var(--vrm-accent-orange)', marginBottom: '8px' }}>
              {data.intelligence.peak_hours[0] || 'N/A'}h
            </div>
            <p style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>Busiest hour</p>
          </div>
        </div>

        {/* Data Span */}
        <div className="vrm-card">
          <div className="vrm-card-header">
            <h3 className="vrm-card-title">Data Coverage</h3>
          </div>
          <div className="vrm-card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', fontWeight: '700', color: 'var(--vrm-accent-purple)', marginBottom: '8px' }}>
              {data.intelligence.date_span_days}
            </div>
            <p style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>Days of data</p>
          </div>
        </div>
      </div>

      {/* Main Charts Grid */}
      <div className="vrm-grid vrm-grid-2" style={{ marginBottom: '24px' }}>
        {/* Live Occupancy Gauge */}
        <div className="vrm-card">
          <div className="vrm-card-header">
            <h3 className="vrm-card-title">Live Occupancy Status</h3>
            <div className="vrm-card-actions">
              <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">PNG</button>
              <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">CSV</button>
            </div>
          </div>
          <div className="vrm-card-body">
            <LiveOccupancyChart data={data.data} intelligence={data.intelligence} />
          </div>
        </div>

        {/* Traffic Over Time */}
        <div className="vrm-card">
          <div className="vrm-card-header">
            <h3 className="vrm-card-title">Activity Over Time</h3>
            <div className="vrm-card-actions">
              <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">PNG</button>
              <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">CSV</button>
            </div>
          </div>
          <div className="vrm-card-body">
            <TrafficTimeChart data={data.data} intelligence={data.intelligence} />
          </div>
        </div>

        {/* Age Distribution */}
        <div className="vrm-card">
          <div className="vrm-card-header">
            <h3 className="vrm-card-title">Demographics - Age</h3>
            <div className="vrm-card-actions">
              <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">PNG</button>
              <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">CSV</button>
            </div>
          </div>
          <div className="vrm-card-body">
            <AgeDistributionChart data={data.data} intelligence={data.intelligence} />
          </div>
        </div>

        {/* Entry/Exit Flow */}
        <div className="vrm-card">
          <div className="vrm-card-header">
            <h3 className="vrm-card-title">Entry/Exit Flow</h3>
            <div className="vrm-card-actions">
              <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">PNG</button>
              <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">CSV</button>
            </div>
          </div>
          <div className="vrm-card-body">
            <EntryExitChart data={data.data} intelligence={data.intelligence} />
          </div>
        </div>
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