import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';

interface ReportsPageProps {
  credentials?: { username: string; password: string };
}

const ReportsPage: React.FC<ReportsPageProps> = ({ credentials }) => {
  const [reportType, setReportType] = useState('occupancy-summary');
  const [timePeriod, setTimePeriod] = useState('last-7-days');
  const [format, setFormat] = useState('pdf');
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Controllable metrics
  const [selectedMetrics, setSelectedMetrics] = useState({
    totalTraffic: true,
    peakHours: true,
    demographics: true,
    entryExit: true,
    dwellTime: true,
    deviceStatus: false
  });

  const reportTemplates = [
    {
      id: 'occupancy-summary',
      name: 'Occupancy Summary Report',
      description: 'Daily, weekly, and monthly occupancy patterns with peak hours analysis',
      icon: '📊',
      type: 'Standard Report'
    },
    {
      id: 'traffic-analysis',
      name: 'Traffic Flow Analysis',
      description: 'Entry/exit patterns, flow rates, and demographic breakdowns',
      icon: '🚶',
      type: 'Analytics Report'
    },
    {
      id: 'demographics-report', 
      name: 'Demographics Report',
      description: 'Age and gender distribution analysis with trend comparisons',
      icon: '👥',
      type: 'Demographics Report'
    },
    {
      id: 'device-performance',
      name: 'Device Performance Report',
      description: 'Camera and sensor status, uptime, and data quality metrics',
      icon: '📷',
      type: 'Technical Report'
    }
  ];

  const toggleMetric = (metric: keyof typeof selectedMetrics) => {
    setSelectedMetrics(prev => ({ ...prev, [metric]: !prev[metric] }));
  };

  const generateSynthesizedMetrics = (reportTypeId: string) => {
    const now = new Date();
    const metrics: any = {};

    // Generate data specific to each report type
    const multipliers: any = {
      'occupancy-summary': { traffic: 1.2, peak: 1.5, dwell: 1.3 },
      'traffic-analysis': { traffic: 1.5, flow: 1.8, entries: 1.4 },
      'demographics-report': { demo: 2.0, age: 1.6, gender: 1.5 },
      'device-performance': { devices: 1.0, uptime: 1.1, quality: 1.2 }
    };
    
    const mult = multipliers[reportTypeId] || { traffic: 1.0, peak: 1.0, dwell: 1.0 };

    if (selectedMetrics.totalTraffic) {
      const baseValue = reportTypeId === 'traffic-analysis' ? 15000 : 
                        reportTypeId === 'occupancy-summary' ? 12000 : 8000;
      metrics.totalTraffic = {
        value: Math.floor((Math.random() * 5000 + baseValue) * (mult.traffic || 1)),
        change: (Math.random() * 30 - 10).toFixed(1) + '%',
        label: 'Total Traffic Events'
      };
    }

    if (selectedMetrics.peakHours) {
      const peakHour = reportTypeId === 'occupancy-summary' ? 
                       Math.floor(Math.random() * 3) + 14 : 
                       Math.floor(Math.random() * 12) + 9;
      const count = reportTypeId === 'traffic-analysis' ? 
                    Math.floor(Math.random() * 800) + 400 :
                    Math.floor(Math.random() * 500) + 200;
      metrics.peakHours = {
        time: `${peakHour}:00 - ${peakHour + 1}:00`,
        count: count,
        label: 'Peak Activity Time'
      };
    }

    if (selectedMetrics.demographics) {
      const maleBase = reportTypeId === 'demographics-report' ? 52 : 48;
      const femaleBase = reportTypeId === 'demographics-report' ? 48 : 52;
      const ageGroups = ['18-25', '26-35', '36-45', '46-60'];
      const ageIndex = reportTypeId === 'demographics-report' ? 1 : Math.floor(Math.random() * 4);
      
      metrics.demographics = {
        male: Math.floor(Math.random() * 15 + maleBase),
        female: Math.floor(Math.random() * 15 + femaleBase),
        ageGroup: ageGroups[ageIndex],
        label: 'Demographics Breakdown'
      };
    }

    if (selectedMetrics.entryExit) {
      const baseEntries = reportTypeId === 'traffic-analysis' ? 8000 : 3500;
      const entries = Math.floor(Math.random() * 3000 + baseEntries);
      const exitRatio = reportTypeId === 'traffic-analysis' ? 0.92 : 0.95;
      
      metrics.entryExit = {
        entries,
        exits: Math.floor(entries * (exitRatio + Math.random() * 0.1)),
        label: 'Entry/Exit Analysis'
      };
    }

    if (selectedMetrics.dwellTime) {
      const avgBase = reportTypeId === 'occupancy-summary' ? 25 : 15;
      const medBase = reportTypeId === 'occupancy-summary' ? 18 : 12;
      
      metrics.dwellTime = {
        average: Math.floor(Math.random() * 15 + avgBase),
        median: Math.floor(Math.random() * 10 + medBase),
        label: 'Average Dwell Time (min)'
      };
    }

    if (selectedMetrics.deviceStatus) {
      const online = reportTypeId === 'device-performance' ? 
                     Math.floor(Math.random() * 2) + 10 :
                     Math.floor(Math.random() * 3) + 8;
      const offline = reportTypeId === 'device-performance' ?
                      Math.floor(Math.random() * 3) :
                      Math.floor(Math.random() * 2);
      const uptime = reportTypeId === 'device-performance' ?
                     (97 + Math.random() * 2).toFixed(1) :
                     (95 + Math.random() * 4).toFixed(1);
      
      metrics.deviceStatus = {
        online,
        offline,
        uptime: uptime + '%',
        label: 'Device Status'
      };
    }

    return metrics;
  };

  const generatePDFReport = () => {
    setIsGenerating(true);

    try {
      const doc = new jsPDF();
      const metrics = generateSynthesizedMetrics(reportType);
      const template = reportTemplates.find(t => t.id === reportType);
      
      // Header
      doc.setFontSize(24);
      doc.setTextColor(33, 150, 243);
      doc.text('Nigzsu', 105, 20, { align: 'center' });
      
      // Report Title
      doc.setFontSize(18);
      doc.setTextColor(0, 0, 0);
      doc.text(template?.name || 'Report', 105, 35, { align: 'center' });
      
      // Date
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 105, 42, { align: 'center' });
      doc.text(`Period: ${timePeriod.replace('-', ' ').toUpperCase()}`, 105, 48, { align: 'center' });
      
      // Divider
      doc.setDrawColor(200, 200, 200);
      doc.line(20, 52, 190, 52);
      
      let yPos = 62;
      
      // Key Metrics Section
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.text('Key Metrics', 20, yPos);
      yPos += 10;
      
      // Display selected metrics
      Object.entries(metrics).forEach(([key, data]: [string, any]) => {
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
        
        doc.setFontSize(12);
        doc.setTextColor(33, 150, 243);
        doc.text(`• ${data.label}`, 25, yPos);
        yPos += 7;
        
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        
        if (data.value !== undefined) {
          doc.text(`   ${data.value.toLocaleString()} (${data.change} vs. previous period)`, 25, yPos);
          yPos += 6;
        }
        
        if (data.time) {
          doc.text(`   Peak Time: ${data.time}`, 25, yPos);
          yPos += 6;
          doc.text(`   Peak Count: ${data.count.toLocaleString()} events`, 25, yPos);
          yPos += 6;
        }
        
        if (data.male !== undefined) {
          doc.text(`   Male: ${data.male}% | Female: ${data.female}%`, 25, yPos);
          yPos += 6;
          doc.text(`   Dominant Age Group: ${data.ageGroup}`, 25, yPos);
          yPos += 6;
        }
        
        if (data.entries !== undefined) {
          doc.text(`   Entries: ${data.entries.toLocaleString()} | Exits: ${data.exits.toLocaleString()}`, 25, yPos);
          yPos += 6;
        }
        
        if (data.average !== undefined) {
          doc.text(`   Average: ${data.average} min | Median: ${data.median} min`, 25, yPos);
          yPos += 6;
        }
        
        if (data.online !== undefined) {
          doc.text(`   Online: ${data.online} | Offline: ${data.offline} | Uptime: ${data.uptime}`, 25, yPos);
          yPos += 6;
        }
        
        yPos += 3;
      });
      
      // Footer
      const pageCount = doc.internal.pages.length - 1;
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Page ${i} of ${pageCount}`, 105, 290, { align: 'center' });
        doc.text('Confidential - Nigzsu Business Intelligence', 105, 285, { align: 'center' });
      }
      
      // Save the PDF
      const filename = `${template?.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(filename);
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF report');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateReport = () => {
    if (format === 'pdf') {
      generatePDFReport();
    } else {
      alert(`${format.toUpperCase()} export coming soon!`);
    }
  };

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
      <div className="vrm-grid vrm-grid-3" style={{ marginBottom: '24px' }}>
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
              {Object.values(selectedMetrics).filter(Boolean).length}
            </div>
            <p style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>Selected Metrics</p>
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

      {/* Metric Selector */}
      <div className="vrm-card" style={{ marginBottom: '24px' }}>
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">Select Metrics to Include</h3>
        </div>
        <div className="vrm-card-body">
          <div className="vrm-grid vrm-grid-3">
            {Object.entries(selectedMetrics).map(([key, value]) => (
              <div 
                key={key}
                onClick={() => toggleMetric(key as keyof typeof selectedMetrics)}
                style={{ 
                  padding: '12px 16px',
                  backgroundColor: value ? 'var(--vrm-accent-blue)' : 'var(--vrm-bg-tertiary)',
                  border: `1px solid ${value ? 'var(--vrm-accent-blue)' : 'var(--vrm-border)'}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}
              >
                <input 
                  type="checkbox" 
                  checked={value} 
                  onChange={() => {}}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ 
                  color: value ? '#fff' : 'var(--vrm-text-primary)',
                  fontSize: '14px',
                  fontWeight: value ? '600' : '400'
                }}>
                  {key.replace(/([A-Z])/g, ' $1').trim().replace(/^./, str => str.toUpperCase())}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Report Configuration */}
      <div className="vrm-card" style={{ marginBottom: '24px' }}>
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">Report Configuration</h3>
        </div>
        <div className="vrm-card-body">
          <div className="vrm-grid vrm-grid-3">
            <div>
              <label style={{ display: 'block', marginBottom: '6px', color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>
                Report Type
              </label>
              <select 
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '8px 12px', 
                  backgroundColor: 'var(--vrm-bg-tertiary)', 
                  border: '1px solid var(--vrm-border)', 
                  borderRadius: '6px', 
                  color: 'var(--vrm-text-primary)'
                }}
              >
                {reportTemplates.map(template => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '6px', color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>
                Time Period
              </label>
              <select 
                value={timePeriod}
                onChange={(e) => setTimePeriod(e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '8px 12px', 
                  backgroundColor: 'var(--vrm-bg-tertiary)', 
                  border: '1px solid var(--vrm-border)', 
                  borderRadius: '6px', 
                  color: 'var(--vrm-text-primary)'
                }}
              >
                <option value="last-7-days">Last 7 Days</option>
                <option value="last-30-days">Last 30 Days</option>
                <option value="this-month">This Month</option>
                <option value="last-month">Last Month</option>
                <option value="custom-range">Custom Range</option>
              </select>
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '6px', color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>
                Format
              </label>
              <select 
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '8px 12px', 
                  backgroundColor: 'var(--vrm-bg-tertiary)', 
                  border: '1px solid var(--vrm-border)', 
                  borderRadius: '6px', 
                  color: 'var(--vrm-text-primary)'
                }}
              >
                <option value="pdf">PDF Report</option>
                <option value="excel">Excel Spreadsheet</option>
                <option value="csv">CSV Data</option>
              </select>
            </div>
          </div>
          
          <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
            <button 
              className="vrm-btn" 
              style={{ flex: 1 }}
              onClick={handleGenerateReport}
              disabled={isGenerating || Object.values(selectedMetrics).every(v => !v)}
            >
              {isGenerating ? 'Generating...' : 'Generate & Download Report'}
            </button>
            <button className="vrm-btn vrm-btn-secondary" onClick={() => setSelectedMetrics({
              totalTraffic: true,
              peakHours: true,
              demographics: true,
              entryExit: true,
              dwellTime: true,
              deviceStatus: false
            })}>
              Reset Defaults
            </button>
          </div>
        </div>
      </div>

      {/* Report Templates */}
      <div className="vrm-card">
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">Available Report Templates</h3>
        </div>
        <div className="vrm-card-body">
          <div className="vrm-grid vrm-grid-2">
            {reportTemplates.map((template) => (
              <div key={template.id} style={{ 
                padding: '20px', 
                backgroundColor: reportType === template.id ? 'rgba(33, 150, 243, 0.1)' : 'var(--vrm-bg-tertiary)', 
                borderRadius: '8px',
                border: `1px solid ${reportType === template.id ? 'var(--vrm-accent-blue)' : 'var(--vrm-border)'}`,
                transition: 'all 0.2s ease',
                cursor: 'pointer'
              }}
              onClick={() => setReportType(template.id)}
              onMouseEnter={(e) => {
                if (reportType !== template.id) {
                  e.currentTarget.style.borderColor = 'var(--vrm-accent-blue)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }
              }}
              onMouseLeave={(e) => {
                if (reportType !== template.id) {
                  e.currentTarget.style.borderColor = 'var(--vrm-border)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }
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
                
                <p style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px', marginBottom: '0', lineHeight: '1.5' }}>
                  {template.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;
