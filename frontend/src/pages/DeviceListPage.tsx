import React, { useState, useEffect } from 'react';
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

interface DeviceListPageProps {
  credentials: { username: string; password: string };
}

const DeviceListPage: React.FC<DeviceListPageProps> = ({ credentials }) => {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDeviceList = React.useCallback(async () => {
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
      }
      
      const response = await fetch(apiUrl, { headers });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      setDevices(result.devices || []);
      setError(null);
    } catch (err) {
      setError(`Failed to load device information: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [credentials.username, credentials.password]);

  useEffect(() => {
    fetchDeviceList();
  }, [fetchDeviceList]);

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'Camera': return '';
      case 'Sensor': return '';
      case 'Gateway': return '';
      default: return '';
    }
  };

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
  const maintenanceDevices = devices.filter(d => d.status === 'maintenance').length;

  return (
    <div>
      {/* Page Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ color: 'var(--vrm-text-primary)', fontSize: '24px', fontWeight: '600', marginBottom: '8px' }}>
          Device list
        </h1>
        <div className="vrm-breadcrumb">
          <span>Dashboard</span>
          <span>›</span>
          <span>Device list</span>
        </div>
      </div>

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

      {/* Device Status Summary */}
      <div className="vrm-grid vrm-grid-4" style={{ marginBottom: '24px' }}>
        <div className="vrm-card">
          <div className="vrm-card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '36px', fontWeight: '700', color: 'var(--vrm-accent-green)', marginBottom: '8px' }}>
              {onlineDevices}
            </div>
            <p style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>Online Devices</p>
          </div>
        </div>

        <div className="vrm-card">
          <div className="vrm-card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '36px', fontWeight: '700', color: 'var(--vrm-accent-red)', marginBottom: '8px' }}>
              {offlineDevices}
            </div>
            <p style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>Offline Devices</p>
          </div>
        </div>

        <div className="vrm-card">
          <div className="vrm-card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '36px', fontWeight: '700', color: 'var(--vrm-accent-orange)', marginBottom: '8px' }}>
              {maintenanceDevices}
            </div>
            <p style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>Maintenance</p>
          </div>
        </div>

        <div className="vrm-card">
          <div className="vrm-card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '36px', fontWeight: '700', color: 'var(--vrm-accent-blue)', marginBottom: '8px' }}>
              {devices.length}
            </div>
            <p style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>Total Devices</p>
          </div>
        </div>
      </div>

      {/* Device List */}
      <div className="vrm-card">
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">Connected Devices</h3>
          <div className="vrm-card-actions">
            <button className="vrm-btn vrm-btn-secondary vrm-btn-sm" onClick={fetchDeviceList}>Refresh</button>
            <button className="vrm-btn vrm-btn-sm">Add Device</button>
          </div>
        </div>
        <div className="vrm-card-body" style={{ padding: 0 }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="vrm-table">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Last Seen</th>
                  <th>Location</th>
                  <th>Data Records</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => (
                  <tr key={device.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '24px' }}>{getDeviceIcon(device.type)}</span>
                        <div>
                          <div style={{ fontWeight: '600' }}>{device.name}</div>
                          <div style={{ fontSize: '12px', color: 'var(--vrm-text-muted)' }}>
                            ID: {device.id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`vrm-status ${device.type === 'Camera' ? 'vrm-status-online' : device.type === 'Gateway' ? 'vrm-status-warning' : 'vrm-status-offline'}`}>
                        {device.type}
                      </span>
                    </td>
                    <td>
                      <div className={`vrm-status ${getStatusClass(device.status)}`}>
                        <div className="vrm-status-dot"></div>
                        {getStatusText(device.status)}
                      </div>
                    </td>
                    <td>{device.lastSeen}</td>
                    <td>{device.location || 'Unknown'}</td>
                    <td>
                      {device.recordCount !== undefined ? (
                        <div>
                          <div style={{ fontWeight: '600' }}>{device.recordCount.toLocaleString()}</div>
                          <div style={{ fontSize: '12px', color: 'var(--vrm-text-muted)' }}>events</div>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--vrm-text-muted)' }}>N/A</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">
                          View
                        </button>
                        {device.dataSource && (
                          <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">
                            Data Source
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Device Details Section */}
      {devices.length > 0 && (
        <div className="vrm-card" style={{ marginTop: '24px' }}>
          <div className="vrm-card-header">
            <h3 className="vrm-card-title">Data Source Configuration</h3>
          </div>
          <div className="vrm-card-body">
            <div className="vrm-grid vrm-grid-2">
              {devices.filter(d => d.dataSource).map((device) => (
                <div key={device.id} style={{ padding: '16px', backgroundColor: 'var(--vrm-bg-tertiary)', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <span>{getDeviceIcon(device.type)}</span>
                    <strong style={{ color: 'var(--vrm-text-primary)' }}>{device.name}</strong>
                    <div className={`vrm-status ${getStatusClass(device.status)}`}>
                      <div className="vrm-status-dot"></div>
                    </div>
                  </div>
                  
                  <div style={{ fontSize: '14px', color: 'var(--vrm-text-secondary)' }}>
                    <div style={{ marginBottom: '6px' }}>
                      <strong>Data Source:</strong>
                    </div>
                    <code style={{ 
                      backgroundColor: 'var(--vrm-bg-primary)', 
                      padding: '4px 8px', 
                      borderRadius: '4px', 
                      fontSize: '12px',
                      wordBreak: 'break-all',
                      display: 'block'
                    }}>
                      {device.dataSource}
                    </code>
                  </div>
                  
                  {device.recordCount !== undefined && (
                    <div style={{ marginTop: '12px', fontSize: '14px' }}>
                      <span style={{ color: 'var(--vrm-text-secondary)' }}>Records processed: </span>
                      <strong style={{ color: 'var(--vrm-accent-blue)' }}>{device.recordCount.toLocaleString()}</strong>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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