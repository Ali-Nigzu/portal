import React, { useState, useEffect } from 'react';
import './App.css';
import { 
  LiveOccupancyChart, 
  TrafficTimeChart, 
  AgeDistributionChart, 
  EntryExitChart 
} from './components/ProfessionalCharts';

// Types for our data
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

// Modern Dashboard Component
const Dashboard: React.FC<{credentials: {username: string, password: string}}> = ({ credentials }) => {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Create basic auth header
      const auth = btoa(`${credentials.username}:${credentials.password}`);
      
      const response = await fetch('http://localhost:8000/api/chart-data', {
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
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p>Loading intelligent analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error">
        <h2>⚠️ Connection Error</h2>
        <p>{error}</p>
        <button onClick={fetchData} className="retry-btn">Retry</button>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>🎯 Nigzsu Analytics</h1>
        <p>Professional Business Intelligence Dashboard</p>
      </header>

      {data && (
        <>
          {/* Smart Summary Cards */}
          <div className="summary-cards">
            <div className="card">
              <h3>📊 Total Records</h3>
              <div className="metric">{data.summary.total_records.toLocaleString()}</div>
              <p className="sub-metric">
                Span: {data.intelligence.date_span_days} days | 
                {data.intelligence.optimal_granularity} granularity
              </p>
            </div>
            
            <div className="card">
              <h3>⏰ Latest Activity</h3>
              <div className="metric">
                {data.intelligence.latest_timestamp 
                  ? new Date(data.intelligence.latest_timestamp).toLocaleDateString()
                  : 'No data'}
              </div>
              <p className="sub-metric">Reference "current time"</p>
            </div>

            <div className="card">
              <h3>🔥 Peak Hours</h3>
              <div className="metric">
                {data.intelligence.peak_hours.slice(0, 3).join('h, ')}h
              </div>
              <p className="sub-metric">Highest traffic periods</p>
            </div>

            <div className="card">
              <h3>👥 Demographics</h3>
              <div className="metric">
                {Object.entries(data.intelligence.demographics_breakdown.gender || {})
                  .map(([k, v]) => `${k}: ${v}`).join(' | ')}
              </div>
              <p className="sub-metric">Gender distribution</p>
            </div>
          </div>

          {/* Professional Chart Placeholders */}
          <div className="charts-grid">
            <div className="chart-card">
              <div className="chart-header">
                <h4>📈 Live Occupancy</h4>
                <div className="chart-actions">
                  <button className="export-btn">PNG</button>
                  <button className="export-btn">CSV</button>
                </div>
              </div>
              <LiveOccupancyChart data={data.data} intelligence={data.intelligence} />
            </div>

            <div className="chart-card">
              <div className="chart-header">
                <h4>📊 Traffic Over Time</h4>
                <div className="chart-actions">
                  <button className="export-btn">PNG</button>
                  <button className="export-btn">CSV</button>
                </div>
              </div>
              <TrafficTimeChart data={data.data} intelligence={data.intelligence} />
            </div>

            <div className="chart-card">
              <div className="chart-header">
                <h4>🥧 Age Distribution</h4>
                <div className="chart-actions">
                  <button className="export-btn">PNG</button>
                  <button className="export-btn">CSV</button>
                </div>
              </div>
              <AgeDistributionChart data={data.data} intelligence={data.intelligence} />
            </div>

            <div className="chart-card">
              <div className="chart-header">
                <h4>📈 Entry/Exit Flow</h4>
                <div className="chart-actions">
                  <button className="export-btn">PNG</button>
                  <button className="export-btn">CSV</button>
                </div>
              </div>
              <EntryExitChart data={data.data} intelligence={data.intelligence} />
            </div>
          </div>

          {/* Data Intelligence Panel */}
          <div className="intelligence-panel">
            <h3>🧠 Smart Insights</h3>
            <div className="insights-grid">
              <div className="insight">
                <strong>Optimal Viewing:</strong> {data.intelligence.optimal_granularity} granularity 
                recommended for {data.intelligence.date_span_days}-day span
              </div>
              <div className="insight">
                <strong>Peak Activity:</strong> Hour {data.intelligence.temporal_patterns.peak_times?.hour || 'N/A'} 
                with {data.intelligence.temporal_patterns.peak_times?.count || 0} records
              </div>
              <div className="insight">
                <strong>Latest Reference:</strong> Using {data.intelligence.latest_timestamp 
                  ? new Date(data.intelligence.latest_timestamp).toLocaleString() 
                  : 'No timestamp'} as "current time"
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// Login Component
const Login: React.FC<{onLogin: (username: string, password: string) => void}> = ({ onLogin }) => {
  const [username, setUsername] = useState('client1');
  const [password, setPassword] = useState('client123');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin(username, password);
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h2>🔐 Nigzsu Analytics</h2>
        <p>Access your business intelligence dashboard</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Username:</label>
            <input 
              type="text" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)}
              placeholder="client1"
            />
          </div>
          <div className="form-group">
            <label>Password:</label>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)}
              placeholder="client123"
            />
          </div>
          <button type="submit" className="login-btn">Sign In</button>
        </form>
      </div>
    </div>
  );
};

// Main App Component
const App: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [credentials, setCredentials] = useState({ username: '', password: '' });

  const handleLogin = (username: string, password: string) => {
    setCredentials({ username, password });
    setIsLoggedIn(true);
  };

  return (
    <div className="App">
      {isLoggedIn ? (
        <Dashboard credentials={credentials} />
      ) : (
        <Login onLogin={handleLogin} />
      )}
    </div>
  );
};

export default App;
