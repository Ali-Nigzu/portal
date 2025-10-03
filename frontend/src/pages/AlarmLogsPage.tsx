import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../config';

interface AlarmEvent {
  id: string;
  instance: string;
  device: string;
  description: string;
  alarmStartedAt: string;
  alarmClearedAfter: string | null;
  severity: 'high' | 'medium' | 'low';
}

interface User {
  role: 'admin' | 'client';
  name: string;
  csv_url?: string;
}

interface AlarmLogsPageProps {
  credentials: { username: string; password: string };
}

const AlarmLogsPage: React.FC<AlarmLogsPageProps> = ({ credentials }) => {
  const [alarms, setAlarms] = useState<AlarmEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<{ [key: string]: User }>({});
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState(false);

  // Fetch users list (for admin only)
  const fetchUsers = useCallback(async () => {
    try {
      const auth = btoa(`${credentials.username}:${credentials.password}`);
      const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data);
        setIsAdmin(credentials.username === 'admin' || data[credentials.username]?.role === 'admin');
        
        // Set default selected client to first client user
        const clientUsers = Object.entries(data).filter(([_, user]) => (user as User).role === 'client');
        if (clientUsers.length > 0) {
          setSelectedClient(clientUsers[0][0]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  }, [credentials.username, credentials.password]);

  const fetchAlarmLogs = useCallback(async (clientId?: string) => {
    try {
      setLoading(true);
      
      const urlParams = new URLSearchParams(window.location.search);
      const viewToken = urlParams.get('view_token');
      
      let apiUrl = `${API_BASE_URL}/api/alarm-logs`;
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      
      if (viewToken) {
        apiUrl += `?view_token=${encodeURIComponent(viewToken)}`;
      } else {
        const auth = btoa(`${credentials.username}:${credentials.password}`);
        headers['Authorization'] = `Basic ${auth}`;
        
        // Add client_id if admin and client is selected
        if (isAdmin && clientId) {
          apiUrl += `?client_id=${encodeURIComponent(clientId)}`;
        }
      }
      
      const response = await fetch(apiUrl, { headers });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      setAlarms(result.alarms || []);
      setError(null);
    } catch (err) {
      setError(`Failed to load alarm logs: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [credentials.username, credentials.password, isAdmin]);

  // Initial load: fetch users first (only if not using view token), then alarms
  useEffect(() => {
    const initialize = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const viewToken = urlParams.get('view_token');
      
      // Only fetch users if not using view token (view tokens can't access admin endpoints)
      if (!viewToken) {
        await fetchUsers();
      }
    };
    initialize();
  }, [fetchUsers]);

  // Fetch alarms when selected client changes
  useEffect(() => {
    if (isAdmin && selectedClient) {
      fetchAlarmLogs(selectedClient);
    } else if (!isAdmin) {
      fetchAlarmLogs();
    }
  }, [selectedClient, isAdmin, fetchAlarmLogs]);

  const getSeverityClass = (severity: string) => {
    switch (severity) {
      case 'high': return 'vrm-status-offline'; // Red
      case 'medium': return 'vrm-status-warning'; // Orange
      case 'low': return 'vrm-status-online'; // Green
      default: return 'vrm-status-offline';
    }
  };

  const getSeverityText = (severity: string) => {
    switch (severity) {
      case 'high': return 'High';
      case 'medium': return 'Medium';
      case 'low': return 'Low';
      default: return 'Unknown';
    }
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
          <p style={{ color: 'var(--vrm-text-secondary)' }}>Loading alarm data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="vrm-card">
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">Connection Error</h3>
        </div>
        <div className="vrm-card-body">
          <p style={{ color: 'var(--vrm-accent-red)', marginBottom: '16px' }}>{error}</p>
          <button className="vrm-btn" onClick={() => fetchAlarmLogs(isAdmin ? selectedClient : undefined)}>Retry Connection</button>
        </div>
      </div>
    );
  }

  const activeAlarms = alarms.filter(a => !a.alarmClearedAfter);
  const clearedAlarms = alarms.filter(a => a.alarmClearedAfter);
  const highSeverityAlarms = alarms.filter(a => a.severity === 'high').length;
  const mediumSeverityAlarms = alarms.filter(a => a.severity === 'medium').length;

  const clientUsers = Object.entries(users).filter(([_, user]) => user.role === 'client');

  return (
    <div>
      {/* Page Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ color: 'var(--vrm-text-primary)', fontSize: '24px', fontWeight: '600', marginBottom: '8px' }}>
          Alarm logs
        </h1>
        <div className="vrm-breadcrumb">
          <span>Dashboard</span>
          <span>›</span>
          <span>Alarm logs</span>
        </div>
      </div>

      {/* Client Selector (Admin Only) */}
      {isAdmin && clientUsers.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--vrm-text-primary)', fontWeight: '500' }}>
            Select Client
          </label>
          <select
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
            style={{
              padding: '10px 12px',
              backgroundColor: 'var(--vrm-bg-tertiary)',
              border: '1px solid var(--vrm-border-color)',
              borderRadius: '4px',
              color: 'var(--vrm-text-primary)',
              fontSize: '14px',
              minWidth: '250px',
              cursor: 'pointer'
            }}
          >
            {clientUsers.map(([username, user]) => (
              <option key={username} value={username}>
                {user.name} ({username})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Alarm Summary */}
      <div className="vrm-grid vrm-grid-4" style={{ marginBottom: '24px' }}>
        <div className="vrm-card">
          <div className="vrm-card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '36px', fontWeight: '700', color: 'var(--vrm-accent-red)', marginBottom: '8px' }}>
              {activeAlarms.length}
            </div>
            <p style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>Active Alarms</p>
          </div>
        </div>

        <div className="vrm-card">
          <div className="vrm-card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '36px', fontWeight: '700', color: 'var(--vrm-accent-red)', marginBottom: '8px' }}>
              {highSeverityAlarms}
            </div>
            <p style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>High Severity</p>
          </div>
        </div>

        <div className="vrm-card">
          <div className="vrm-card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '36px', fontWeight: '700', color: 'var(--vrm-accent-orange)', marginBottom: '8px' }}>
              {mediumSeverityAlarms}
            </div>
            <p style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>Medium Severity</p>
          </div>
        </div>

        <div className="vrm-card">
          <div className="vrm-card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '36px', fontWeight: '700', color: 'var(--vrm-accent-green)', marginBottom: '8px' }}>
              {clearedAlarms.length}
            </div>
            <p style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>Cleared Alarms</p>
          </div>
        </div>
      </div>

      {/* Active Alarms */}
      {activeAlarms.length > 0 && (
        <div className="vrm-card" style={{ marginBottom: '24px' }}>
          <div className="vrm-card-header">
            <h3 className="vrm-card-title">Active Alarms ({activeAlarms.length})</h3>
            <div className="vrm-card-actions">
              <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">Clear All</button>
              <button className="vrm-btn vrm-btn-sm" onClick={() => fetchAlarmLogs(isAdmin ? selectedClient : undefined)}>Refresh</button>
            </div>
          </div>
          <div className="vrm-card-body" style={{ padding: 0 }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="vrm-table">
                <thead>
                  <tr>
                    <th>Instance</th>
                    <th>Device</th>
                    <th>Description</th>
                    <th>Alarm Started At</th>
                    <th>Severity</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {activeAlarms.map((alarm) => (
                    <tr key={alarm.id}>
                      <td>
                        <code style={{ 
                          backgroundColor: 'var(--vrm-bg-tertiary)', 
                          padding: '2px 6px', 
                          borderRadius: '3px',
                          fontSize: '12px'
                        }}>
                          {alarm.instance}
                        </code>
                      </td>
                      <td>{alarm.device}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>{alarm.description}</span>
                        </div>
                      </td>
                      <td>{alarm.alarmStartedAt}</td>
                      <td>
                        <div className={`vrm-status ${getSeverityClass(alarm.severity)}`}>
                          <div className="vrm-status-dot"></div>
                          {getSeverityText(alarm.severity)}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">
                            Clear
                          </button>
                          <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">
                            Details
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* All Alarms History */}
      <div className="vrm-card">
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">
            Alarm History ({alarms.length} total)
          </h3>
          <div className="vrm-card-actions">
            <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">Export CSV</button>
            <button className="vrm-btn vrm-btn-sm" onClick={() => fetchAlarmLogs(isAdmin ? selectedClient : undefined)}>Refresh</button>
          </div>
        </div>
        <div className="vrm-card-body" style={{ padding: 0 }}>
          {alarms.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="vrm-table">
                <thead>
                  <tr>
                    <th>Instance</th>
                    <th>Device</th>
                    <th>Description</th>
                    <th>Alarm Started At</th>
                    <th>Alarm Cleared After</th>
                    <th>Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {alarms.map((alarm) => (
                    <tr key={alarm.id}>
                      <td>
                        <code style={{ 
                          backgroundColor: 'var(--vrm-bg-tertiary)', 
                          padding: '2px 6px', 
                          borderRadius: '3px',
                          fontSize: '12px'
                        }}>
                          {alarm.instance}
                        </code>
                      </td>
                      <td>{alarm.device}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>{alarm.description}</span>
                        </div>
                      </td>
                      <td>{alarm.alarmStartedAt}</td>
                      <td>
                        {alarm.alarmClearedAfter ? (
                          <span style={{ color: 'var(--vrm-accent-green)' }}>{alarm.alarmClearedAfter}</span>
                        ) : (
                          <span style={{ color: 'var(--vrm-accent-red)' }}>Still active</span>
                        )}
                      </td>
                      <td>
                        <div className={`vrm-status ${getSeverityClass(alarm.severity)}`}>
                          <div className="vrm-status-dot"></div>
                          {getSeverityText(alarm.severity)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--vrm-text-secondary)' }}>
              No alarms found
            </div>
          )}
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

export default AlarmLogsPage;