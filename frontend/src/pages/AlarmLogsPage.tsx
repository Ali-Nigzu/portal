import React, { useState, useEffect, useCallback } from 'react';
import { API_ENDPOINTS } from '../config';

interface AlarmEvent {
  id: string;
  instance: string;
  device: string;
  description: string;
  alarmStartedAt: string;
  alarmClearedAfter: string | null;
  severity: 'high' | 'medium' | 'low';
}

interface AlarmLogsPageProps {
  credentials: { username: string; password: string };
}

const AlarmLogsPage: React.FC<AlarmLogsPageProps> = ({ credentials }) => {
  const [alarms, setAlarms] = useState<AlarmEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const generateSmartAlarms = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch data to analyze for anomalies
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

      const result = await response.json();
      const data = result.data || [];
      
      // Generate smart alarms based on business intelligence data
      const generatedAlarms: AlarmEvent[] = [];
      
      // Analyze occupancy patterns
      const entriesCount = data.filter((d: any) => d.event === 'entry').length;
      const exitsCount = data.filter((d: any) => d.event === 'exit').length;
      const currentOccupancy = Math.max(0, entriesCount - exitsCount);
      
      // High occupancy alarm
      if (currentOccupancy > 50) {
        generatedAlarms.push({
          id: '001',
          instance: '261',
          device: 'Main Entrance Camera [261]',
          description: 'High occupancy detected: Capacity threshold exceeded',
          alarmStartedAt: '2025-09-28 14:20:15 (2 hours ago)',
          alarmClearedAfter: null,
          severity: 'high'
        });
      }
      
      // Traffic surge detection
      const hourlyActivity = data.reduce((acc: any, item: any) => {
        const hour = item.hour || new Date().getHours();
        acc[hour] = (acc[hour] || 0) + 1;
        return acc;
      }, {});
      
      const maxHourlyActivity = Math.max(...Object.values(hourlyActivity) as number[]);
      const avgHourlyActivity = (Object.values(hourlyActivity) as number[]).reduce((a: number, b: number) => a + b, 0) / Object.keys(hourlyActivity).length;
      
      if (maxHourlyActivity > avgHourlyActivity * 2) {
        generatedAlarms.push({
          id: '002',
          instance: '261',
          device: 'System Overview [261]',
          description: 'Traffic surge: Unusual activity spike detected',
          alarmStartedAt: '2025-09-28 12:45:28 (4 hours ago)',
          alarmClearedAfter: '1m, 31s',
          severity: 'medium'
        });
      }
      
      // Data quality alerts
      const recentData = data.filter((d: any) => {
        if (!d.timestamp) return false;
        const eventTime = new Date(d.timestamp).getTime();
        const now = Date.now();
        return (now - eventTime) < 24 * 60 * 60 * 1000; // Last 24 hours
      });
      
      if (recentData.length === 0) {
        generatedAlarms.push({
          id: '003',
          instance: '261',
          device: 'Data Processing Gateway [261]',
          description: 'Data feed interruption: No recent activity detected',
          alarmStartedAt: '2025-09-28 10:30:45 (6 hours ago)',
          alarmClearedAfter: null,
          severity: 'high'
        });
      }
      
      // Gender distribution anomaly
      const genderCounts = data.reduce((acc: any, item: any) => {
        acc[item.sex] = (acc[item.sex] || 0) + 1;
        return acc;
      }, {});
      
      const totalGenderEntries = (Object.values(genderCounts) as number[]).reduce((a: number, b: number) => a + b, 0);
      if (totalGenderEntries > 0) {
        const maleRatio = (genderCounts.M || 0) / totalGenderEntries;
        if (maleRatio > 0.9 || maleRatio < 0.1) {
          generatedAlarms.push({
            id: '004',
            instance: '262',
            device: 'Demographics Analyzer [262]',
            description: 'Demographics anomaly: Unusual gender distribution pattern',
            alarmStartedAt: '2025-09-28 08:15:22 (8 hours ago)',
            alarmClearedAfter: '45s',
            severity: 'low'
          });
        }
      }
      
      // Add some historical cleared alarms for demonstration
      generatedAlarms.push(
        {
          id: '005',
          instance: '261',
          device: 'System Overview [261]',
          description: 'Device communication timeout',
          alarmStartedAt: '2025-09-27 22:45:18 (18 hours ago)',
          alarmClearedAfter: '2m, 15s',
          severity: 'medium'
        },
        {
          id: '006',
          instance: '263',
          device: 'Side Exit Camera [263]',
          description: 'Camera offline: Connection lost',
          alarmStartedAt: '2025-09-27 15:30:42 (1 day ago)',
          alarmClearedAfter: '18s',
          severity: 'high'
        }
      );
      
      setAlarms(generatedAlarms);
      setError(null);
    } catch (err) {
      setError(`Failed to generate alarm data: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [credentials.username, credentials.password]);

  useEffect(() => {
    generateSmartAlarms();
  }, [generateSmartAlarms]);

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
          <button className="vrm-btn" onClick={generateSmartAlarms}>Retry Connection</button>
        </div>
      </div>
    );
  }

  const activeAlarms = alarms.filter(a => !a.alarmClearedAfter);
  const clearedAlarms = alarms.filter(a => a.alarmClearedAfter);
  const highSeverityAlarms = alarms.filter(a => a.severity === 'high').length;
  const mediumSeverityAlarms = alarms.filter(a => a.severity === 'medium').length;

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
              <button className="vrm-btn vrm-btn-sm" onClick={generateSmartAlarms}>Refresh</button>
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
            <button className="vrm-btn vrm-btn-sm" onClick={generateSmartAlarms}>Refresh</button>
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