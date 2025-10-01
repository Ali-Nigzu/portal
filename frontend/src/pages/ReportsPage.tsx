import React from 'react';

const ReportsPage: React.FC = () => {
  const reportTemplates = [
    {
      id: 'occupancy-summary',
      name: 'Occupancy Summary Report',
      description: 'Daily, weekly, and monthly occupancy patterns with peak hours analysis',
      icon: '',
      type: 'Standard Report'
    },
    {
      id: 'traffic-analysis',
      name: 'Traffic Flow Analysis',
      description: 'Entry/exit patterns, flow rates, and demographic breakdowns',
      icon: '',
      type: 'Analytics Report'
    },
    {
      id: 'demographics-report', 
      name: 'Demographics Report',
      description: 'Age and gender distribution analysis with trend comparisons',
      icon: '',
      type: 'Demographics Report'
    },
    {
      id: 'device-performance',
      name: 'Device Performance Report',
      description: 'Camera and sensor status, uptime, and data quality metrics',
      icon: '',
      type: 'Technical Report'
    }
  ];

  return (
    <div>
      {/* Page Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ color: 'var(--vrm-text-primary)', fontSize: '24px', fontWeight: '600', marginBottom: '8px' }}>
          Reports
        </h1>
        <div className="vrm-breadcrumb">
          <span>Dashboard</span>
          <span>›</span>
          <span>Reports</span>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="vrm-grid vrm-grid-4" style={{ marginBottom: '24px' }}>
        <div className="vrm-card">
          <div className="vrm-card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '36px', fontWeight: '700', color: 'var(--vrm-accent-blue)', marginBottom: '8px' }}>
              4
            </div>
            <p style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>Report Templates</p>
          </div>
        </div>

        <div className="vrm-card">
          <div className="vrm-card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '36px', fontWeight: '700', color: 'var(--vrm-accent-teal)', marginBottom: '8px' }}>
              12
            </div>
            <p style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>Generated This Month</p>
          </div>
        </div>

        <div className="vrm-card">
          <div className="vrm-card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '36px', fontWeight: '700', color: 'var(--vrm-accent-green)', marginBottom: '8px' }}>
              3
            </div>
            <p style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>Scheduled Reports</p>
          </div>
        </div>

        <div className="vrm-card">
          <div className="vrm-card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '36px', fontWeight: '700', color: 'var(--vrm-accent-purple)', marginBottom: '8px' }}>
              PDF
            </div>
            <p style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>Export Format</p>
          </div>
        </div>
      </div>

      {/* Report Templates */}
      <div className="vrm-card" style={{ marginBottom: '24px' }}>
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">Available Report Templates</h3>
          <div className="vrm-card-actions">
            <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">Schedule Report</button>
            <button className="vrm-btn vrm-btn-sm">Create Custom</button>
          </div>
        </div>
        <div className="vrm-card-body">
          <div className="vrm-grid vrm-grid-2">
            {reportTemplates.map((template) => (
              <div key={template.id} style={{ 
                padding: '20px', 
                backgroundColor: 'var(--vrm-bg-tertiary)', 
                borderRadius: '8px',
                border: '1px solid var(--vrm-border)',
                transition: 'all 0.2s ease',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--vrm-accent-blue)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--vrm-border)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                  <span style={{ fontSize: '24px' }}>{template.icon}</span>
                  <div>
                    <h4 style={{ color: 'var(--vrm-text-primary)', margin: 0, fontSize: '16px', fontWeight: '600' }}>
                      {template.name}
                    </h4>
                    <span className="vrm-status vrm-status-online" style={{ fontSize: '11px', marginTop: '4px' }}>
                      {template.type}
                    </span>
                  </div>
                </div>
                
                <p style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px', marginBottom: '16px', lineHeight: '1.5' }}>
                  {template.description}
                </p>
                
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="vrm-btn vrm-btn-sm" style={{ flex: 1 }}>
                    Generate Report
                  </button>
                  <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">
                    Preview
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Reports */}
      <div className="vrm-card">
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">Recent Reports</h3>
          <div className="vrm-card-actions">
            <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">View All</button>
          </div>
        </div>
        <div className="vrm-card-body" style={{ padding: 0 }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="vrm-table">
              <thead>
                <tr>
                  <th>Report Name</th>
                  <th>Type</th>
                  <th>Generated</th>
                  <th>Period</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>📊</span>
                      <span>September Occupancy Summary</span>
                    </div>
                  </td>
                  <td>Standard Report</td>
                  <td>2025-09-28 14:30</td>
                  <td>September 2025</td>
                  <td>
                    <div className="vrm-status vrm-status-online">
                      <div className="vrm-status-dot"></div>
                      Ready
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">Download</button>
                      <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">View</button>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>🚶‍♂️</span>
                      <span>Weekly Traffic Analysis</span>
                    </div>
                  </td>
                  <td>Analytics Report</td>
                  <td>2025-09-27 09:15</td>
                  <td>Week 39, 2025</td>
                  <td>
                    <div className="vrm-status vrm-status-online">
                      <div className="vrm-status-dot"></div>
                      Ready
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">Download</button>
                      <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">View</button>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>📷</span>
                      <span>Device Performance Report</span>
                    </div>
                  </td>
                  <td>Technical Report</td>
                  <td>2025-09-26 16:45</td>
                  <td>September 2025</td>
                  <td>
                    <div className="vrm-status vrm-status-warning">
                      <div className="vrm-status-dot"></div>
                      Processing
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="vrm-btn vrm-btn-secondary vrm-btn-sm" disabled>Download</button>
                      <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">Cancel</button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Report Configuration */}
      <div className="vrm-card" style={{ marginTop: '24px' }}>
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">Quick Report Generator</h3>
        </div>
        <div className="vrm-card-body">
          <div className="vrm-grid vrm-grid-3">
            <div>
              <label style={{ display: 'block', marginBottom: '6px', color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>
                Report Type
              </label>
              <select style={{ 
                width: '100%', 
                padding: '8px 12px', 
                backgroundColor: 'var(--vrm-bg-tertiary)', 
                border: '1px solid var(--vrm-border)', 
                borderRadius: '6px', 
                color: 'var(--vrm-text-primary)'
              }}>
                <option>Occupancy Summary</option>
                <option>Traffic Analysis</option>
                <option>Demographics Report</option>
                <option>Device Performance</option>
              </select>
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '6px', color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>
                Time Period
              </label>
              <select style={{ 
                width: '100%', 
                padding: '8px 12px', 
                backgroundColor: 'var(--vrm-bg-tertiary)', 
                border: '1px solid var(--vrm-border)', 
                borderRadius: '6px', 
                color: 'var(--vrm-text-primary)'
              }}>
                <option>Last 7 Days</option>
                <option>Last 30 Days</option>
                <option>This Month</option>
                <option>Last Month</option>
                <option>Custom Range</option>
              </select>
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '6px', color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>
                Format
              </label>
              <select style={{ 
                width: '100%', 
                padding: '8px 12px', 
                backgroundColor: 'var(--vrm-bg-tertiary)', 
                border: '1px solid var(--vrm-border)', 
                borderRadius: '6px', 
                color: 'var(--vrm-text-primary)'
              }}>
                <option>PDF Report</option>
                <option>Excel Spreadsheet</option>
                <option>CSV Data</option>
              </select>
            </div>
          </div>
          
          <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
            <button className="vrm-btn" style={{ flex: 1 }}>
              Generate Report
            </button>
            <button className="vrm-btn vrm-btn-secondary">
              Schedule Recurring
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;