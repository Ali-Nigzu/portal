import React, { useState, useEffect, useCallback } from 'react';
import { 
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { API_ENDPOINTS } from '../config';
import TimeFilterDropdown, { TimeFilterValue } from '../components/TimeFilterDropdown';
import { 
  filterDataByTime, 
  calculateAverageDwellTime, 
  calculateOccupancyTimeSeries,
  calculateDwellTimeDistribution,
  formatDuration
} from '../utils/dataProcessing';

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

interface ToggleableDataSeries {
  key: string;
  name: string;
  color: string;
  yAxisId: string;
  enabled: boolean;
}

const COLORS = ['#1976d2', '#2e7d32', '#d32f2f', '#f57c00', '#7b1fa2', '#c2185b', '#00796b', '#5d4037'];

const AnalyticsPage: React.FC<AnalyticsPageProps> = ({ credentials }) => {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [globalTimeFilter, setGlobalTimeFilter] = useState<TimeFilterValue>({ option: 'last7days' });
  const [activityPatternType, setActivityPatternType] = useState<'hourly' | 'weekly' | 'monthly'>('hourly');
  
  // Foxess-style toggleable data series
  const [dataSeriesConfig, setDataSeriesConfig] = useState<ToggleableDataSeries[]>([
    { key: 'activity', name: 'Total Activity', color: '#1976d2', yAxisId: 'left', enabled: true },
    { key: 'entrances', name: 'Entrances', color: '#2e7d32', yAxisId: 'left', enabled: true },
    { key: 'exits', name: 'Exits', color: '#d32f2f', yAxisId: 'left', enabled: true },
    { key: 'occupancy', name: 'Occupancy', color: '#f57c00', yAxisId: 'right', enabled: false },
    { key: 'dwell_time', name: 'Avg Dwell Time', color: '#9c27b0', yAxisId: 'right', enabled: false }
  ]);

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

  // Filter data based on global time filter
  const filteredData = data ? filterDataByTime(data.data, globalTimeFilter) : [];

  const toggleDataSeries = (key: string) => {
    setDataSeriesConfig(prev => 
      prev.map(series => 
        series.key === key ? { ...series, enabled: !series.enabled } : series
      )
    );
  };

  const processGenderData = () => {
    if (!filteredData.length) return [];
    const genderCounts = filteredData.reduce((acc, item) => {
      acc[item.sex] = (acc[item.sex] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(genderCounts).map(([gender, count]) => ({
      name: gender === 'M' ? 'Male' : gender === 'F' ? 'Female' : 'Unknown',
      value: count,
      percentage: ((count / filteredData.length) * 100).toFixed(1)
    }));
  };

  const processAgeData = () => {
    if (!filteredData.length) return [];
    const ageCounts = filteredData.reduce((acc, item) => {
      acc[item.age_estimate] = (acc[item.age_estimate] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(ageCounts).map(([age, count]) => ({
      age,
      visitors: count
    })).sort((a, b) => a.age.localeCompare(b.age));
  };

  const processActivityPatterns = () => {
    if (!filteredData.length) return [];

    if (activityPatternType === 'hourly') {
      const hourlyData = Array.from({ length: 24 }, (_, hour) => ({
        period: `${hour.toString().padStart(2, '0')}:00`,
        activity: 0,
        entrances: 0,
        exits: 0
      }));

      filteredData.forEach(item => {
        const hour = item.hour;
        if (hour >= 0 && hour < 24) {
          hourlyData[hour].activity++;
          if (item.event === 'entry') hourlyData[hour].entrances++;
          if (item.event === 'exit') hourlyData[hour].exits++;
        }
      });

      return hourlyData;
    } else if (activityPatternType === 'weekly') {
      const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const weeklyData = weekdays.map(day => ({
        period: day,
        activity: 0,
        entrances: 0,
        exits: 0
      }));

      filteredData.forEach(item => {
        const dayIndex = new Date(item.timestamp).getDay();
        weeklyData[dayIndex].activity++;
        if (item.event === 'entry') weeklyData[dayIndex].entrances++;
        if (item.event === 'exit') weeklyData[dayIndex].exits++;
      });

      return weeklyData;
    } else {
      // Monthly patterns
      const monthlyData = Array.from({ length: 12 }, (_, month) => ({
        period: new Date(0, month).toLocaleString('default', { month: 'short' }),
        activity: 0,
        entrances: 0,
        exits: 0
      }));

      filteredData.forEach(item => {
        const month = new Date(item.timestamp).getMonth();
        monthlyData[month].activity++;
        if (item.event === 'entry') monthlyData[month].entrances++;
        if (item.event === 'exit') monthlyData[month].exits++;
      });

      return monthlyData;
    }
  };

  const processFoxessTrends = () => {
    if (!filteredData.length) return [];
    
    // Group data by date
    const dailyData = filteredData.reduce((acc, item) => {
      const date = new Date(item.timestamp).toLocaleDateString();
      if (!acc[date]) {
        acc[date] = { 
          date, 
          activity: 0, 
          entrances: 0, 
          exits: 0, 
          dailyData: [] as ChartData[]
        };
      }
      acc[date].activity++;
      if (item.event === 'entry') acc[date].entrances++;
      if (item.event === 'exit') acc[date].exits++;
      acc[date].dailyData.push(item);
      return acc;
    }, {} as Record<string, any>);

    // Calculate occupancy and dwell time for each day
    const trendsData = Object.values(dailyData).map((day: any) => {
      const occupancyTimeSeries = calculateOccupancyTimeSeries(day.dailyData);
      const avgOccupancy = occupancyTimeSeries.length > 0 
        ? occupancyTimeSeries.reduce((sum, point) => sum + point.occupancy, 0) / occupancyTimeSeries.length
        : 0;
      
      const dwellTime = calculateAverageDwellTime(day.dailyData);

      return {
        date: day.date,
        activity: day.activity,
        entrances: day.entrances,
        exits: day.exits,
        occupancy: Math.round(avgOccupancy * 10) / 10, // Round to 1 decimal
        dwell_time: Math.round(dwellTime * 10) / 10 // Round to 1 decimal (minutes)
      };
    }).sort((a: any, b: any) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    return trendsData;
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
      {/* Page Header with Global Time Filter */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ color: 'var(--vrm-text-primary)', fontSize: '24px', fontWeight: '600', marginBottom: '8px' }}>
            Advanced Analytics
          </h1>
          <div className="vrm-breadcrumb">
            <span>Dashboard</span>
            <span>›</span>
            <span>Analytics</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>Time Period:</span>
          <TimeFilterDropdown 
            value={globalTimeFilter} 
            onChange={setGlobalTimeFilter}
          />
        </div>
      </div>

      {/* Top Row - Demographics with Time Filtering */}
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

      {/* Activity Patterns - Merged Chart */}
      <div className="vrm-card" style={{ marginBottom: '24px' }}>
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">Activity Patterns</h3>
          <div className="vrm-card-actions">
            <select 
              value={activityPatternType} 
              onChange={(e) => setActivityPatternType(e.target.value as 'hourly' | 'weekly' | 'monthly')}
              style={{
                padding: '6px 12px',
                backgroundColor: 'var(--vrm-bg-secondary)',
                border: '1px solid var(--vrm-border)',
                borderRadius: '4px',
                color: 'var(--vrm-text-primary)',
                fontSize: '12px',
                marginRight: '8px'
              }}
            >
              <option value="hourly">24-Hour Pattern</option>
              <option value="weekly">Weekly Pattern</option>
              <option value="monthly">Monthly Pattern</option>
            </select>
            <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">PNG</button>
            <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">CSV</button>
          </div>
        </div>
        <div className="vrm-card-body">
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={processActivityPatterns()}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--vrm-border)" />
              <XAxis dataKey="period" stroke="var(--vrm-text-secondary)" fontSize={10} />
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

      {/* Foxess-Style Multi-Series Trends Chart */}
      <div className="vrm-card" style={{ marginBottom: '24px' }}>
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">Advanced Trends</h3>
          <div className="vrm-card-actions">
            <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">PNG</button>
            <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">CSV</button>
          </div>
        </div>
        
        {/* Data Series Toggles */}
        <div style={{ padding: '16px', borderBottom: '1px solid var(--vrm-border)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {dataSeriesConfig.map(series => (
              <button
                key={series.key}
                onClick={() => toggleDataSeries(series.key)}
                style={{
                  padding: '4px 8px',
                  fontSize: '11px',
                  borderRadius: '4px',
                  border: '1px solid var(--vrm-border)',
                  backgroundColor: series.enabled ? series.color : 'var(--vrm-bg-secondary)',
                  color: series.enabled ? 'white' : 'var(--vrm-text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                ● {series.name}
              </button>
            ))}
          </div>
        </div>

        <div className="vrm-card-body">
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={processFoxessTrends()}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--vrm-border)" />
              <XAxis dataKey="date" stroke="var(--vrm-text-secondary)" fontSize={10} />
              <YAxis yAxisId="left" stroke="var(--vrm-text-secondary)" fontSize={12} />
              <YAxis yAxisId="right" orientation="right" stroke="var(--vrm-text-secondary)" fontSize={12} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'var(--vrm-bg-secondary)', 
                  border: '1px solid var(--vrm-border)',
                  borderRadius: '6px'
                }}
                formatter={(value, name) => {
                  if (name === 'Avg Dwell Time') {
                    return [`${value} min`, name];
                  }
                  return [value, name];
                }}
              />
              <Legend />
              
              {dataSeriesConfig.map(series => 
                series.enabled && (
                  <Line 
                    key={series.key}
                    yAxisId={series.yAxisId}
                    type="monotone" 
                    dataKey={series.key} 
                    stroke={series.color} 
                    strokeWidth={2} 
                    name={series.name}
                    connectNulls={false}
                  />
                )
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Enhanced Analytics Summary Panel */}
      <div className="vrm-card">
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">Analytics Summary</h3>
        </div>
        <div className="vrm-card-body">
          <div className="vrm-grid vrm-grid-4">
            <div style={{ padding: '16px', backgroundColor: 'var(--vrm-bg-tertiary)', borderRadius: '6px', borderLeft: '4px solid var(--vrm-accent-blue)' }}>
              <strong style={{ color: 'var(--vrm-text-primary)' }}>Filtered Data:</strong>
              <p style={{ color: 'var(--vrm-text-secondary)', marginTop: '4px', fontSize: '14px' }}>
                {filteredData.length.toLocaleString()} events in selected period
              </p>
            </div>
            
            <div style={{ padding: '16px', backgroundColor: 'var(--vrm-bg-tertiary)', borderRadius: '6px', borderLeft: '4px solid var(--vrm-accent-teal)' }}>
              <strong style={{ color: 'var(--vrm-text-primary)' }}>Avg Dwell Time:</strong>
              <p style={{ color: 'var(--vrm-text-secondary)', marginTop: '4px', fontSize: '14px' }}>
                {formatDuration(calculateAverageDwellTime(filteredData))}
              </p>
            </div>
            
            <div style={{ padding: '16px', backgroundColor: 'var(--vrm-bg-tertiary)', borderRadius: '6px', borderLeft: '4px solid var(--vrm-accent-orange)' }}>
              <strong style={{ color: 'var(--vrm-text-primary)' }}>Gender Balance:</strong>
              <p style={{ color: 'var(--vrm-text-secondary)', marginTop: '4px', fontSize: '14px' }}>
                {processGenderData().map(g => `${g.name}: ${g.percentage}%`).join(', ')}
              </p>
            </div>
            
            <div style={{ padding: '16px', backgroundColor: 'var(--vrm-bg-tertiary)', borderRadius: '6px', borderLeft: '4px solid var(--vrm-accent-purple)' }}>
              <strong style={{ color: 'var(--vrm-text-primary)' }}>Time Period:</strong>
              <p style={{ color: 'var(--vrm-text-secondary)', marginTop: '4px', fontSize: '14px' }}>
                {globalTimeFilter.option === 'custom' && globalTimeFilter.startDate && globalTimeFilter.endDate
                  ? `${new Date(globalTimeFilter.startDate).toLocaleDateString()} - ${new Date(globalTimeFilter.endDate).toLocaleDateString()}`
                  : globalTimeFilter.option.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, str => str.toUpperCase())}
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