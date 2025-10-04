import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../config';

interface DeviceInfo {
  id: string;
  name: string;
  type: 'Camera' | 'Sensor' | 'Gateway';
  status: 'online' | 'offline' | 'maintenance';
  lastSeen: string;
  dataSource?: string;
  location?: string;
  recordCount?: number;
}

interface DataSource {
  id: string;
  title: string;
  url: string;
  type: string;
  active?: boolean;
}

interface User {
  role: 'admin' | 'client';
  name: string;
  csv_url?: string;
  data_sources?: DataSource[];
}

interface DeviceListPageProps {
  credentials: { username: string; password: string };
}

const DeviceListPage: React.FC<DeviceListPageProps> = ({ credentials }) => {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<{ [key: string]: User }>({});
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);

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
        const usersData = data.users || data;
        setUsers(usersData);
        setIsAdmin(credentials.username === 'admin' || usersData[credentials.username]?.role === 'admin');
        
        // Set default selected client to first client user
        const clientUsers = Object.entries(usersData).filter(([_, user]) => (user as User).role === 'client');
        if (clientUsers.length > 0) {
          setSelectedClient(clientUsers[0][0]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  }, [credentials.username, credentials.password]);

  const fetchDeviceList = useCallback(async (clientId?: string) => {
    try {
      setLoading(true);
      
      const urlParams = new URLSearchParams(window.location.search);
      const viewToken = urlParams.get('view_token');
      
      let apiUrl = `${API_BASE_URL}/api/device-list`;
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
      setDevices(result.devices || []);
      setDataSources(result.data_sources || []);
      setError(null);
    } catch (err) {
      setError(`Failed to load device information: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [credentials.username, credentials.password, isAdmin]);

  // Fetch data sources for current user or selected client
  const fetchDataSources = useCallback(async () => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const viewToken = urlParams.get('view_token');
      
      // Determine which client's data sources to load
      let clientToLoad = isAdmin ? selectedClient : credentials.username;
      
      // If using view token, try to get from users state
      if (viewToken && users && Object.keys(users).length > 0) {
        const clientUsers = Object.entries(users).filter(([_, user]) => user.role === 'client');
        if (clientUsers.length > 0) {
          clientToLoad = clientUsers[0][0];
        }
      }
      
      if (!clientToLoad) return;
      
      // Check if we have users data first
      if (users && users[clientToLoad] && users[clientToLoad].data_sources) {
        setDataSources(users[clientToLoad].data_sources || []);
      } else {
        // Fallback: fetch from API if admin
        if (isAdmin && !viewToken) {
          const auth = btoa(`${credentials.username}:${credentials.password}`);
          const response = await fetch(`${API_BASE_URL}/api/admin/data-sources/${clientToLoad}`, {
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/json',
            },
          });
          
          if (response.ok) {
            const data = await response.json();
            setDataSources(data.data_sources || []);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch data sources:', err);
      setDataSources([]);
    }
  }, [credentials.username, credentials.password, isAdmin, selectedClient, users]);

  // Initial load: fetch users first (only if not using view token), then devices
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

  // Fetch devices when selected client changes
  useEffect(() => {
    if (isAdmin && selectedClient) {
      fetchDeviceList(selectedClient);
    } else if (!isAdmin) {
      fetchDeviceList();
    }
  }, [selectedClient, isAdmin, fetchDeviceList]);

  // Fetch data sources when user data changes
  useEffect(() => {
    fetchDataSources();
  }, [fetchDataSources, users, selectedClient]);

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'online': return 'vrm-status-online';
      case 'offline': return 'vrm-status-offline';
      case 'maintenance': return 'vrm-status-warning';
      default: return 'vrm-status-offline';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'online': return 'Online';
      case 'offline': return 'Offline';
      case 'maintenance': return 'Maintenance';
      default: return 'Unknown';
    }
  };

  // Download CSV data for a specific data source
  const handleDownloadDataSource = async (sourceUrl: string, sourceName: string) => {
    try {
      const response = await fetch(sourceUrl);
      if (!response.ok) {
        throw new Error('Failed to download data');
      }
      
      const csvData = await response.text();
      const blob = new Blob([csvData], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sourceName.replace(/[^a-z0-9]/gi, '_')}_data.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
      alert('Failed to download data source');
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
          <p style={{ color: 'var(--vrm-text-secondary)' }}>Loading device information...</p>
        </div>
      </div>
    );
  }

  const onlineDevices = devices.filter(d => d.status === 'online').length;
  const offlineDevices = devices.filter(d => d.status === 'offline').length;
  const clientUsers = Object.entries(users).filter(([_, user]) => user.role === 'client');

  return (
    <div>
      {/* Page Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ color: 'var(--vrm-text-primary)', fontSize: '24px', fontWeight: '600', marginBottom: '8px' }}>
          Device List
        </h1>
        <div className="vrm-breadcrumb">
          <span>Dashboard</span>
          <span>›</span>
          <span>Device List</span>
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

      {error && (
        <div className="vrm-card" style={{ marginBottom: '24px' }}>
          <div className="vrm-card-body">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--vrm-accent-orange)' }}>
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          </div>
        </div>
      )}

      {/* Device Summary */}
      <div className="vrm-grid vrm-grid-3" style={{ marginBottom: '24px' }}>
        <div className="vrm-card">
          <div className="vrm-card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '36px', fontWeight: '700', color: 'var(--vrm-accent-blue)', marginBottom: '8px' }}>
              {devices.length}
            </div>
            <p style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>Total Devices</p>
          </div>
        </div>

        <div className="vrm-card">
          <div className="vrm-card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '36px', fontWeight: '700', color: 'var(--vrm-accent-green)', marginBottom: '8px' }}>
              {onlineDevices}
            </div>
            <p style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>Online</p>
          </div>
        </div>

        <div className="vrm-card">
          <div className="vrm-card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '36px', fontWeight: '700', color: 'var(--vrm-accent-orange)', marginBottom: '8px' }}>
              {offlineDevices}
            </div>
            <p style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>Offline</p>
          </div>
        </div>
      </div>

      {/* Devices List */}
      <div className="vrm-card" style={{ marginBottom: '24px' }}>
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">Devices</h3>
          <div className="vrm-card-actions">
            <button className="vrm-btn vrm-btn-secondary vrm-btn-sm" onClick={() => fetchDeviceList(isAdmin ? selectedClient : undefined)}>Refresh</button>
          </div>
        </div>
        <div className="vrm-card-body" style={{ padding: 0 }}>
          {devices.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="vrm-table">
                <thead>
                  <tr>
                    <th>Device Name</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Location</th>
                    <th>Last Seen</th>
                    <th>Records</th>
                    <th>Data Source</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((device) => (
                    <tr key={device.id}>
                      <td>
                        <div>
                          <div style={{ fontWeight: '600' }}>{device.name}</div>
                          <div style={{ fontSize: '12px', color: 'var(--vrm-text-muted)' }}>
                            {device.id}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`vrm-status ${
                          device.type === 'Camera' ? 'vrm-status-online' : 
                          device.type === 'Sensor' ? 'vrm-status-warning' : 
                          'vrm-status-offline'
                        }`}>
                          {device.type}
                        </span>
                      </td>
                      <td>
                        <div className={`vrm-status ${getStatusClass(device.status)}`}>
                          <div className="vrm-status-dot"></div>
                          {getStatusText(device.status)}
                        </div>
                      </td>
                      <td>{device.location || '-'}</td>
                      <td style={{ fontSize: '13px', color: 'var(--vrm-text-secondary)' }}>
                        {new Date(device.lastSeen).toLocaleString()}
                      </td>
                      <td style={{ textAlign: 'center' }}>{device.recordCount || '-'}</td>
                      <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {device.dataSource ? (
                          <code style={{ fontSize: '11px', color: 'var(--vrm-text-muted)' }}>
                            {device.dataSource}
                          </code>
                        ) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ 
              textAlign: 'center', 
              padding: '60px 20px',
              color: 'var(--vrm-text-muted)'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📱</div>
              <p style={{ fontSize: '16px', marginBottom: '8px' }}>No devices found</p>
              <p style={{ fontSize: '14px' }}>
                {isAdmin ? 'Add devices from the Admin panel.' : 'Contact your administrator to configure devices.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Data Sources List */}
      <div className="vrm-card">
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">Data Sources</h3>
          <div className="vrm-card-actions">
            <button className="vrm-btn vrm-btn-secondary vrm-btn-sm" onClick={() => fetchDataSources()}>Refresh</button>
          </div>
        </div>
        <div className="vrm-card-body" style={{ padding: 0 }}>
          {dataSources.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="vrm-table">
                <thead>
                  <tr>
                    <th>Source Name</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Data URL</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {dataSources.map((source) => (
                    <tr key={source.id}>
                      <td>
                        <div>
                          <div style={{ fontWeight: '600' }}>{source.title}</div>
                          <div style={{ fontSize: '12px', color: 'var(--vrm-text-muted)' }}>
                            {source.id}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`vrm-status ${
                          source.type === 'Camera' ? 'vrm-status-online' : 
                          source.type === 'Sensor' ? 'vrm-status-warning' : 
                          'vrm-status-offline'
                        }`}>
                          {source.type}
                        </span>
                      </td>
                      <td>
                        <div className={`vrm-status ${source.active ? 'vrm-status-online' : 'vrm-status-offline'}`}>
                          <div className="vrm-status-dot"></div>
                          {source.active ? 'Active' : 'Inactive'}
                        </div>
                      </td>
                      <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <code style={{ fontSize: '11px', color: 'var(--vrm-text-muted)' }}>
                          {source.url}
                        </code>
                      </td>
                      <td>
                        <button 
                          className="vrm-btn vrm-btn-primary vrm-btn-sm"
                          onClick={() => handleDownloadDataSource(source.url, source.title)}
                        >
                          Download CSV
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ 
              textAlign: 'center', 
              padding: '60px 20px',
              color: 'var(--vrm-text-muted)'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📁</div>
              <p style={{ fontSize: '16px', marginBottom: '8px' }}>No data sources configured</p>
              <p style={{ fontSize: '14px' }}>
                {isAdmin ? 'Add data sources from the Admin panel.' : 'Contact your administrator to configure data sources.'}
              </p>
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

export default DeviceListPage;