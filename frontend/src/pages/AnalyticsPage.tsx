import React, { useState, useEffect, useCallback } from 'react';
import { 
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
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

interface AnalyticsPageProps {
  credentials: { username: string; password: string };
}

const COLORS = ['#1976d2', '#2e7d32', '#d32f2f', '#f57c00', '#7b1fa2', '#c2185b', '#00796b', '#5d4037'];

const AnalyticsPage: React.FC<AnalyticsPageProps> = ({ credentials }) => {
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

  const processGenderData = () => {
    if (!data) return [];
    const genderCounts = data.data.reduce((acc, item) => {
      acc[item.sex] = (acc[item.sex] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(genderCounts).map(([gender, count]) => ({
      name: gender === 'M' ? 'Male' : gender === 'F' ? 'Female' : 'Unknown',
      value: count,
      percentage: ((count / data.data.length) * 100).toFixed(1)
    }));
  };

  const processAgeData = () => {
    if (!data) return [];
    const ageCounts = data.data.reduce((acc, item) => {
      acc[item.age_estimate] = (acc[item.age_estimate] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(ageCounts).map(([age, count]) => ({
      age,
      visitors: count
    })).sort((a, b) => a.age.localeCompare(b.age));
  };

  const processHourlyActivity = () => {
    if (!data) return [];
    const hourlyData = Array.from({ length: 24 }, (_, hour) => ({
      hour: `${hour.toString().padStart(2, '0')}:00`,
      activity: 0,
      entrances: 0,
      exits: 0
    }));

    data.data.forEach(item => {
      const hour = item.hour;
      if (hour >= 0 && hour < 24) {
        hourlyData[hour].activity++;
        if (item.event === 'entry') hourlyData[hour].entrances++;
        if (item.event === 'exit') hourlyData[hour].exits++;
      }
    });

    return hourlyData;
  };

  const processDailyTrends = () => {
    if (!data) return [];
    const dailyData = data.data.reduce((acc, item) => {
      const date = new Date(item.timestamp).toLocaleDateString();
      if (!acc[date]) {
        acc[date] = { date, activity: 0, entrances: 0, exits: 0 };
      }
      acc[date].activity++;
      if (item.event === 'entry') acc[date].entrances++;
      if (item.event === 'exit') acc[date].exits++;
      return acc;
    }, {} as Record<string, any>);

    return Object.values(dailyData).sort((a: any, b: any) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  };

  const processWeeklyPatterns = () => {
    if (!data) return [];
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const weeklyData = weekdays.map(day => ({
      day,
      activity: 0,
      entrances: 0,
      exits: 0
    }));

    data.data.forEach(item => {
      const dayIndex = new Date(item.timestamp).getDay();
      weeklyData[dayIndex].activity++;
      if (item.event === 'entry') weeklyData[dayIndex].entrances++;
      if (item.event === 'exit') weeklyData[dayIndex].exits++;
    });

    return weeklyData;
  };

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
          <p style={{ color: 'var(--vrm-text-secondary)' }}>Loading analytics data...</p>
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

  if (!data) return null;

  return (
    <div>
      {/* Page Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ color: 'var(--vrm-text-primary)', fontSize: '24px', fontWeight: '600', marginBottom: '8px' }}>
          Advanced Analytics
        </h1>
        <div className="vrm-breadcrumb">
          <span>Dashboard</span>
          <span>›</span>
          <span>Analytics</span>
        </div>
      </div>

      {/* Top Row - Demographics */}
      <div className="vrm-grid vrm-grid-2" style={{ marginBottom: '24px' }}>
        {/* Gender Distribution Pie Chart */}
        <div className="vrm-card">
          <div className="vrm-card-header">
            <h3 className="vrm-card-title">Gender Distribution</h3>
            <div className="vrm-card-actions">
              <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">PNG</button>
              <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">CSV</button>
            </div>
          </div>
          <div className="vrm-card-body">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={processGenderData()}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  label={({ name, percentage }) => `${name} ${percentage}%`}
                >
                  {processGenderData().map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Age Distribution Bar Chart */}
        <div className="vrm-card">
          <div className="vrm-card-header">
            <h3 className="vrm-card-title">Age Distribution</h3>
            <div className="vrm-card-actions">
              <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">PNG</button>
              <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">CSV</button>
            </div>
          </div>
          <div className="vrm-card-body">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={processAgeData()}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--vrm-border)" />
                <XAxis dataKey="age" stroke="var(--vrm-text-secondary)" fontSize={12} />
                <YAxis stroke="var(--vrm-text-secondary)" fontSize={12} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--vrm-bg-secondary)', 
                    border: '1px solid var(--vrm-border)',
                    borderRadius: '6px'
                  }}
                />
                <Bar dataKey="visitors" fill="#1976d2" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Middle Row - Temporal Patterns */}
      <div className="vrm-grid vrm-grid-2" style={{ marginBottom: '24px' }}>
        {/* Hourly Activity Area Chart */}
        <div className="vrm-card">
          <div className="vrm-card-header">
            <h3 className="vrm-card-title">24-Hour Activity Pattern</h3>
            <div className="vrm-card-actions">
              <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">PNG</button>
              <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">CSV</button>
            </div>
          </div>
          <div className="vrm-card-body">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={processHourlyActivity()}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--vrm-border)" />
                <XAxis dataKey="hour" stroke="var(--vrm-text-secondary)" fontSize={10} />
                <YAxis stroke="var(--vrm-text-secondary)" fontSize={12} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--vrm-bg-secondary)', 
                    border: '1px solid var(--vrm-border)',
                    borderRadius: '6px'
                  }}
                />
                <Area type="monotone" dataKey="activity" stroke="#1976d2" fill="#1976d2" fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Weekly Patterns Bar Chart */}
        <div className="vrm-card">
          <div className="vrm-card-header">
            <h3 className="vrm-card-title">Weekly Activity Patterns</h3>
            <div className="vrm-card-actions">
              <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">PNG</button>
              <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">CSV</button>
            </div>
          </div>
          <div className="vrm-card-body">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={processWeeklyPatterns()}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--vrm-border)" />
                <XAxis dataKey="day" stroke="var(--vrm-text-secondary)" fontSize={10} />
                <YAxis stroke="var(--vrm-text-secondary)" fontSize={12} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--vrm-bg-secondary)', 
                    border: '1px solid var(--vrm-border)',
                    borderRadius: '6px'
                  }}
                />
                <Bar dataKey="activity" fill="#2e7d32" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Row - Trends */}
      <div className="vrm-card" style={{ marginBottom: '24px' }}>
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">Daily Activity Trends</h3>
          <div className="vrm-card-actions">
            <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">PNG</button>
            <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">CSV</button>
          </div>
        </div>
        <div className="vrm-card-body">
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={processDailyTrends()}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--vrm-border)" />
              <XAxis dataKey="date" stroke="var(--vrm-text-secondary)" fontSize={10} />
              <YAxis stroke="var(--vrm-text-secondary)" fontSize={12} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'var(--vrm-bg-secondary)', 
                  border: '1px solid var(--vrm-border)',
                  borderRadius: '6px'
                }}
              />
              <Legend />
              <Line type="monotone" dataKey="activity" stroke="#1976d2" strokeWidth={2} name="Total Activity" />
              <Line type="monotone" dataKey="entrances" stroke="#2e7d32" strokeWidth={2} name="Entrances" />
              <Line type="monotone" dataKey="exits" stroke="#d32f2f" strokeWidth={2} name="Exits" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Analytics Summary Panel */}
      <div className="vrm-card">
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">Analytics Summary</h3>
        </div>
        <div className="vrm-card-body">
          <div className="vrm-grid vrm-grid-4">
            <div style={{ padding: '16px', backgroundColor: 'var(--vrm-bg-tertiary)', borderRadius: '6px', borderLeft: '4px solid var(--vrm-accent-blue)' }}>
              <strong style={{ color: 'var(--vrm-text-primary)' }}>Data Quality:</strong>
              <p style={{ color: 'var(--vrm-text-secondary)', marginTop: '4px', fontSize: '14px' }}>
                {data.summary.total_records.toLocaleString()} records across {data.intelligence.date_span_days} days
              </p>
            </div>
            
            <div style={{ padding: '16px', backgroundColor: 'var(--vrm-bg-tertiary)', borderRadius: '6px', borderLeft: '4px solid var(--vrm-accent-teal)' }}>
              <strong style={{ color: 'var(--vrm-text-primary)' }}>Peak Performance:</strong>
              <p style={{ color: 'var(--vrm-text-secondary)', marginTop: '4px', fontSize: '14px' }}>
                Hour {data.intelligence.peak_hours[0] || 'N/A'} shows highest activity levels
              </p>
            </div>
            
            <div style={{ padding: '16px', backgroundColor: 'var(--vrm-bg-tertiary)', borderRadius: '6px', borderLeft: '4px solid var(--vrm-accent-orange)' }}>
              <strong style={{ color: 'var(--vrm-text-primary)' }}>Gender Balance:</strong>
              <p style={{ color: 'var(--vrm-text-secondary)', marginTop: '4px', fontSize: '14px' }}>
                {processGenderData().map(g => `${g.name}: ${g.percentage}%`).join(', ')}
              </p>
            </div>
            
            <div style={{ padding: '16px', backgroundColor: 'var(--vrm-bg-tertiary)', borderRadius: '6px', borderLeft: '4px solid var(--vrm-accent-purple)' }}>
              <strong style={{ color: 'var(--vrm-text-primary)' }}>Coverage:</strong>
              <p style={{ color: 'var(--vrm-text-secondary)', marginTop: '4px', fontSize: '14px' }}>
                {data.intelligence.optimal_granularity} analysis recommended
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

export default AnalyticsPage;