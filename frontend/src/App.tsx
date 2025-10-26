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
            camOS
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
              autoComplete="username"
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
              autoComplete="current-password"
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
    </Router>
  );
};

export default App;