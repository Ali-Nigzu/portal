import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import VRMLayout from './components/VRMLayout';
import DashboardPage from './pages/DashboardPage';
import EventLogsPage from './pages/EventLogsPage';
import AlarmLogsPage from './pages/AlarmLogsPage';
import DeviceListPage from './pages/DeviceListPage';
import ReportsPage from './pages/ReportsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import AdminPage from './pages/AdminPage';
import LandingPage from './pages/LandingPage';
import './styles/VRMTheme.css';
import { GlobalControlsProvider } from './context/GlobalControlsContext';
import { FEATURE_FLAGS } from './config';
import AnalyticsV2Page from './analytics/v2/pages/AnalyticsV2Page';

// Login Component
const Login: React.FC<{onLogin: (username: string, password: string) => void}> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (response.ok) {
        await response.json();
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
    <div className="vrm-auth-shell">
      <div className="vrm-auth-card" role="dialog" aria-labelledby="camOS-login-title">
        <div>
          <div className="vrm-auth-logo">
            <img src="/company-logo.png" alt="Company Logo" />
          </div>
          <h2 id="camOS-login-title" className="vrm-auth-title">
            camOS
          </h2>
          <p className="vrm-auth-subtitle">Sign in to monitor your sites</p>
        </div>

        <form onSubmit={handleSubmit} className="vrm-auth-form">
          <div className="vrm-field">
            <label className="vrm-label" htmlFor="login-username">
              Username
            </label>
            <input
              id="login-username"
              className="vrm-input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              autoComplete="username"
              required
            />
          </div>

          <div className="vrm-field">
            <label className="vrm-label" htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              className="vrm-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <div className="vrm-status vrm-status-warning vrm-auth-error" role="alert" aria-live="assertive">
              {error}
            </div>
          )}

          <div className="vrm-auth-actions">
            <button type="submit" className="vrm-btn vrm-btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Signing in…' : 'Login'}
            </button>
          </div>
        </form>

        <div className="vrm-auth-hint">
          <strong>Demo credentials</strong>
          <br />
          Client: client1 / client123
          <br />
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

  // Restore session from sessionStorage on app load
  useEffect(() => {
    const savedCredentials = sessionStorage.getItem('camOS_credentials');
    if (savedCredentials) {
      try {
        const { username, password } = JSON.parse(savedCredentials);
        setCredentials({ username, password });
        setUserRole(username === 'admin' ? 'admin' : 'client');
        setIsLoggedIn(true);
      } catch (error) {
        console.error('Failed to restore session:', error);
        sessionStorage.removeItem('camOS_credentials');
      }
    }
  }, []);

  const handleLogin = (username: string, password: string) => {
    setCredentials({ username, password });
    setUserRole(username === 'admin' ? 'admin' : 'client');
    setIsLoggedIn(true);
    
    // Persist credentials to sessionStorage
    sessionStorage.setItem('camOS_credentials', JSON.stringify({ username, password }));
  };

  const handleLogout = () => {
    // Clear session storage
    sessionStorage.removeItem('camOS_credentials');
    
    // Check if we're in a view token session
    const hasViewToken = new URLSearchParams(window.location.search).has('view_token');
    
    if (hasViewToken) {
      // If viewing via view token, close the tab or redirect to home without token
      window.close();
      // Fallback if window.close() doesn't work (some browsers block it)
      setTimeout(() => {
        window.location.href = '/';
      }, 100);
    } else {
      // Normal logout - clear state
      setIsLoggedIn(false);
      setCredentials({ username: '', password: '' });
      setUserRole('client');
    }
  };

  const hasViewToken = new URLSearchParams(window.location.search).has('view_token');

  return (
    <Router>
      <GlobalControlsProvider>
        <Routes>
        {/* Public routes */}
        <Route path="/" element={!isLoggedIn && !hasViewToken ? <LandingPage /> : <Navigate to={userRole === 'admin' ? '/admin' : '/dashboard'} replace />} />
        <Route path="/login" element={!isLoggedIn && !hasViewToken ? <Login onLogin={handleLogin} /> : <Navigate to={userRole === 'admin' ? '/admin' : '/dashboard'} replace />} />
        
        {/* Protected routes - require login */}
        {(isLoggedIn || hasViewToken) && (
          <>
            <Route path="/dashboard" element={
              <VRMLayout userRole={hasViewToken ? 'client' : userRole} onLogout={handleLogout}>
                {userRole === 'admin' && !hasViewToken ? 
                  <Navigate to="/admin" replace /> : 
                  <DashboardPage credentials={credentials} />
                }
              </VRMLayout>
            } />
            <Route path="/event-logs" element={
              <VRMLayout userRole={hasViewToken ? 'client' : userRole} onLogout={handleLogout}>
                {userRole === 'admin' && !hasViewToken ? 
                  <Navigate to="/admin" replace /> : 
                  <EventLogsPage credentials={credentials} />
                }
              </VRMLayout>
            } />
            <Route path="/alarm-logs" element={
              <VRMLayout userRole={hasViewToken ? 'client' : userRole} onLogout={handleLogout}>
                {userRole === 'admin' && !hasViewToken ? 
                  <Navigate to="/admin" replace /> : 
                  <AlarmLogsPage credentials={credentials} />
                }
              </VRMLayout>
            } />
            <Route path="/device-list" element={
              <VRMLayout userRole={hasViewToken ? 'client' : userRole} onLogout={handleLogout}>
                {userRole === 'admin' && !hasViewToken ? 
                  <Navigate to="/admin" replace /> : 
                  <DeviceListPage credentials={credentials} />
                }
              </VRMLayout>
            } />
            <Route path="/analytics" element={
              <VRMLayout userRole={hasViewToken ? 'client' : userRole} onLogout={handleLogout}>
                {userRole === 'admin' && !hasViewToken ?
                  <Navigate to="/admin" replace /> :
                  <AnalyticsPage credentials={credentials} />
                }
              </VRMLayout>
            } />
            {FEATURE_FLAGS.analyticsV2 ? (
              <Route path="/analytics/v2" element={
                <VRMLayout userRole={hasViewToken ? 'client' : userRole} onLogout={handleLogout}>
                  {userRole === 'admin' && !hasViewToken ?
                    <Navigate to="/admin" replace /> :
                    <AnalyticsV2Page />
                  }
                </VRMLayout>
              } />
            ) : null}
            <Route path="/reports" element={
              <VRMLayout userRole={hasViewToken ? 'client' : userRole} onLogout={handleLogout}>
                {userRole === 'admin' && !hasViewToken ? 
                  <Navigate to="/admin" replace /> : 
                  <ReportsPage credentials={credentials} />
                }
              </VRMLayout>
            } />
            
            {userRole === 'admin' && (
              <Route path="/admin" element={
                <VRMLayout userRole={userRole} onLogout={handleLogout}>
                  <AdminPage credentials={credentials} />
                </VRMLayout>
              } />
            )}
          </>
        )}
        
        {/* Redirect all other routes */}
        <Route path="*" element={
          !isLoggedIn && !hasViewToken ? 
            <Navigate to="/" replace /> : 
            <Navigate to={userRole === 'admin' ? '/admin' : '/dashboard'} replace />
        } />
        </Routes>
      </GlobalControlsProvider>
    </Router>
  );
};

export default App;