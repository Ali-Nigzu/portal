import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import VRMLayout from './components/VRMLayout';
import DashboardPage from './pages/DashboardPage';
import EventLogsPage from './pages/EventLogsPage';
import AlarmLogsPage from './pages/AlarmLogsPage';
import DeviceListPage from './pages/DeviceListPage';
import ReportsPage from './pages/ReportsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import AdminPage from './pages/AdminPage';
import './styles/VRMTheme.css';

// Login Component
const Login: React.FC<{onLogin: (username: string, password: string) => void}> = ({ onLogin }) => {
  const [username, setUsername] = useState('client1');
  const [password, setPassword] = useState('client123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      // Validate credentials by attempting to fetch data
      const auth = btoa(`${username}:${password}`);
      const response = await fetch('/api/chart-data', {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        onLogin(username, password);
      } else if (response.status === 401) {
        setError('Invalid username or password');
      } else {
        setError('Connection error. Please try again.');
      }
    } catch (err) {
      setError('Unable to connect to server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh', 
      background: 'var(--vrm-bg-primary)',
      padding: '20px' 
    }}>
      <div style={{ 
        background: 'var(--vrm-bg-secondary)', 
        padding: '40px',
        borderRadius: '12px',
        border: '1px solid var(--vrm-border)',
        maxWidth: '400px',
        width: '100%',
        textAlign: 'center'
      }}>
        <div style={{ marginBottom: '32px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            overflow: 'hidden'
          }}>
            <img 
              src="/company-logo.png" 
              alt="Company Logo"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover'
              }}
            />
          </div>
          <h2 style={{ color: 'var(--vrm-text-primary)', marginBottom: '8px', fontSize: '24px', fontWeight: '600' }}>
            Nigzsu
          </h2>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px', textAlign: 'left' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '6px', 
              color: 'var(--vrm-text-secondary)', 
              fontSize: '14px',
              fontWeight: '500'
            }}>
              Username:
            </label>
            <input 
              type="text" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              required
              style={{ 
                width: '100%',
                padding: '12px 16px',
                backgroundColor: 'var(--vrm-bg-tertiary)',
                border: '1px solid var(--vrm-border)',
                borderRadius: '6px',
                color: 'var(--vrm-text-primary)',
                fontSize: '14px'
              }}
            />
          </div>
          
          <div style={{ marginBottom: '24px', textAlign: 'left' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '6px', 
              color: 'var(--vrm-text-secondary)', 
              fontSize: '14px',
              fontWeight: '500'
            }}>
              Password:
            </label>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
              style={{ 
                width: '100%',
                padding: '12px 16px',
                backgroundColor: 'var(--vrm-bg-tertiary)',
                border: '1px solid var(--vrm-border)',
                borderRadius: '6px',
                color: 'var(--vrm-text-primary)',
                fontSize: '14px'
              }}
            />
          </div>

          {error && (
            <div style={{ 
              marginBottom: '20px',
              padding: '12px',
              backgroundColor: 'rgba(244, 67, 54, 0.1)',
              border: '1px solid var(--vrm-accent-red)',
              borderRadius: '6px',
              color: 'var(--vrm-accent-red)',
              fontSize: '14px'
            }}>
              {error}
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="vrm-btn"
            style={{ 
              width: '100%',
              padding: '14px',
              fontSize: '16px',
              fontWeight: '600'
            }}
          >
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <div style={{ 
          marginTop: '24px', 
          padding: '16px', 
          backgroundColor: 'var(--vrm-bg-tertiary)', 
          borderRadius: '6px',
          fontSize: '12px',
          color: 'var(--vrm-text-muted)'
        }}>
          <strong>Demo Credentials:</strong><br />
          Client: client1 / client123<br />
          Admin: admin / admin123
        </div>
      </div>
    </div>
  );
};

// Main App Component  
const App: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [userRole, setUserRole] = useState<'client' | 'admin'>('client');

  const handleLogin = (username: string, password: string) => {
    setCredentials({ username, password });
    setUserRole(username === 'admin' ? 'admin' : 'client');
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setCredentials({ username: '', password: '' });
    setUserRole('client');
  };

  const hasViewToken = new URLSearchParams(window.location.search).has('view_token');

  if (!isLoggedIn && !hasViewToken) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Router>
      <VRMLayout userRole={userRole} onLogout={handleLogout}>
        <Routes>
          <Route path="/" element={<Navigate to={userRole === 'admin' ? '/admin' : '/dashboard'} replace />} />
          
          {/* Client-only routes - redirect admins unless they have a view_token */}
          <Route 
            path="/dashboard" 
            element={
              userRole === 'admin' && !hasViewToken ? 
              <Navigate to="/admin" replace /> : 
              <DashboardPage credentials={credentials} />
            } 
          />
          <Route 
            path="/event-logs" 
            element={
              userRole === 'admin' && !hasViewToken ? 
              <Navigate to="/admin" replace /> : 
              <EventLogsPage credentials={credentials} />
            } 
          />
          <Route 
            path="/alarm-logs" 
            element={
              userRole === 'admin' && !hasViewToken ? 
              <Navigate to="/admin" replace /> : 
              <AlarmLogsPage credentials={credentials} />
            } 
          />
          <Route 
            path="/device-list" 
            element={
              userRole === 'admin' && !hasViewToken ? 
              <Navigate to="/admin" replace /> : 
              <DeviceListPage credentials={credentials} />
            } 
          />
          <Route 
            path="/analytics" 
            element={
              userRole === 'admin' && !hasViewToken ? 
              <Navigate to="/admin" replace /> : 
              <AnalyticsPage credentials={credentials} />
            } 
          />
          <Route 
            path="/reports" 
            element={
              userRole === 'admin' && !hasViewToken ? 
              <Navigate to="/admin" replace /> : 
              <ReportsPage credentials={credentials} />
            } 
          />
          
          {/* Admin-only routes */}
          {userRole === 'admin' && (
            <Route 
              path="/admin" 
              element={<AdminPage credentials={credentials} />} 
            />
          )}
          
          {/* Catch all - redirect based on role */}
          <Route path="*" element={<Navigate to={userRole === 'admin' ? '/admin' : '/dashboard'} replace />} />
        </Routes>
      </VRMLayout>
    </Router>
  );
};

export default App;