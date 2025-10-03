import React, { useState } from 'react';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

interface ReportsPageProps {
  credentials?: { username: string; password: string };
}

const ReportsPage: React.FC<ReportsPageProps> = ({ credentials }) => {
  const [reportType, setReportType] = useState('occupancy-summary');
  const [timePeriod, setTimePeriod] = useState('last-7-days');
  const [format, setFormat] = useState('pdf');
  const [isGenerating, setIsGenerating] = useState(false);

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

  const generateOccupancyData = () => {
    return {
      currentOccupancy: Math.floor(Math.random() * 200) + 200,
      maxCapacity: 500,
      occupancyRate: (Math.random() * 30 + 50).toFixed(1) + '%',
      averageDwellTime: Math.floor(Math.random() * 20) + 25,
      peakOccupancyTime: `${Math.floor(Math.random() * 3) + 14}:00`,
      peakOccupancyCount: Math.floor(Math.random() * 100) + 380,
      floorUtilization: {
        floor1: (Math.random() * 20 + 70).toFixed(1) + '%',
        floor2: (Math.random() * 20 + 60).toFixed(1) + '%',
        floor3: (Math.random() * 20 + 50).toFixed(1) + '%'
      },
      hourlyOccupancy: [
        { hour: '09:00', count: Math.floor(Math.random() * 100) + 150 },
        { hour: '12:00', count: Math.floor(Math.random() * 100) + 300 },
        { hour: '15:00', count: Math.floor(Math.random() * 100) + 350 },
        { hour: '18:00', count: Math.floor(Math.random() * 100) + 200 }
      ]
    };
  };

  const generateTrafficData = () => {
    return {
      totalEntries: Math.floor(Math.random() * 3000) + 8000,
      totalExits: Math.floor(Math.random() * 3000) + 7800,
      peakFlowTime: `${Math.floor(Math.random() * 3) + 12}:00`,
      peakFlowRate: Math.floor(Math.random() * 200) + 450,
      averageFlowRate: Math.floor(Math.random() * 100) + 180,
      congestionPoints: [
        { location: 'Main Entrance', congestion: (Math.random() * 20 + 70).toFixed(1) + '%' },
        { location: 'Elevator Lobby', congestion: (Math.random() * 20 + 60).toFixed(1) + '%' },
        { location: 'Exit Gates', congestion: (Math.random() * 20 + 50).toFixed(1) + '%' }
      ],
      flowByHour: [
        { hour: '09:00', entries: Math.floor(Math.random() * 200) + 600 },
        { hour: '12:00', entries: Math.floor(Math.random() * 200) + 800 },
        { hour: '15:00', entries: Math.floor(Math.random() * 200) + 750 },
        { hour: '18:00', entries: Math.floor(Math.random() * 200) + 650 }
      ]
    };
  };

  const generateDemographicsData = () => {
    const ageData = {
      '18-25': Math.random() * 10 + 20,
      '26-35': Math.random() * 10 + 30,
      '36-45': Math.random() * 10 + 25,
      '46-60': Math.random() * 10 + 15,
      '60+': Math.random() * 5 + 8
    };
    
    let peakAge = '26-35';
    let maxValue = ageData['26-35'];
    Object.entries(ageData).forEach(([age, value]) => {
      if (value > maxValue) {
        maxValue = value;
        peakAge = age;
      }
    });
    
    return {
      totalVisitors: Math.floor(Math.random() * 5000) + 10000,
      genderDistribution: {
        male: (Math.random() * 10 + 48).toFixed(1) + '%',
        female: (Math.random() * 10 + 48).toFixed(1) + '%',
        unidentified: (Math.random() * 5 + 2).toFixed(1) + '%'
      },
      ageDistribution: {
        '18-25': ageData['18-25'].toFixed(1) + '%',
        '26-35': ageData['26-35'].toFixed(1) + '%',
        '36-45': ageData['36-45'].toFixed(1) + '%',
        '46-60': ageData['46-60'].toFixed(1) + '%',
        '60+': ageData['60+'].toFixed(1) + '%'
      },
      visitorProfiles: [
        { profile: 'Regular Customers', percentage: (Math.random() * 10 + 35).toFixed(1) + '%' },
        { profile: 'First-time Visitors', percentage: (Math.random() * 10 + 25).toFixed(1) + '%' },
        { profile: 'Occasional Visitors', percentage: (Math.random() * 10 + 30).toFixed(1) + '%' }
      ],
      peakDemographic: `${peakAge} age group`
    };
  };

  const generateDeviceData = () => {
    const totalDevices = Math.floor(Math.random() * 3) + 12;
    const offlineDevices = Math.floor(Math.random() * 2);
    const onlineDevices = totalDevices - offlineDevices;
    
    const deviceStatus = [];
    const qualities = ['Excellent', 'Good', 'Fair'];
    
    for (let i = 1; i <= totalDevices; i++) {
      const isOnline = i <= onlineDevices;
      const uptime = isOnline ? (95 + Math.random() * 4).toFixed(1) : (50 + Math.random() * 30).toFixed(1);
      const quality = isOnline ? qualities[Math.floor(Math.random() * 2)] : 'Poor';
      
      deviceStatus.push({
        device: `Camera-${i.toString().padStart(2, '0')}`,
        status: isOnline ? 'Online' : 'Offline',
        uptime: uptime + '%',
        quality: quality
      });
    }
    
    return {
      totalDevices,
      onlineDevices,
      offlineDevices,
      averageUptime: (97 + Math.random() * 2).toFixed(2) + '%',
      dataQuality: (92 + Math.random() * 6).toFixed(1) + '%',
      deviceStatus,
      maintenanceAlerts: Math.floor(Math.random() * 3),
      lastMaintenance: '2 days ago',
      nextScheduledMaintenance: '5 days'
    };
  };

  const getReportData = (reportTypeId: string) => {
    switch (reportTypeId) {
      case 'occupancy-summary':
        return generateOccupancyData();
      case 'traffic-analysis':
        return generateTrafficData();
      case 'demographics-report':
        return generateDemographicsData();
      case 'device-performance':
        return generateDeviceData();
      default:
        return {};
    }
  };

  const generatePDFReport = () => {
    setIsGenerating(true);

    try {
      const doc = new jsPDF();
      const data = getReportData(reportType);
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
      
      // Report-specific content
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.text('Key Metrics', 20, yPos);
      yPos += 10;
      
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);

      if (reportType === 'occupancy-summary') {
        const d: any = data;
        doc.text(`Current Occupancy: ${d.currentOccupancy} / ${d.maxCapacity} (${d.occupancyRate})`, 25, yPos);
        yPos += 6;
        doc.text(`Average Dwell Time: ${d.averageDwellTime} minutes`, 25, yPos);
        yPos += 6;
        doc.text(`Peak Occupancy Time: ${d.peakOccupancyTime} (${d.peakOccupancyCount} people)`, 25, yPos);
        yPos += 10;
        
        doc.text('Floor Utilization:', 25, yPos);
        yPos += 6;
        doc.text(`  Floor 1: ${d.floorUtilization.floor1}`, 30, yPos);
        yPos += 5;
        doc.text(`  Floor 2: ${d.floorUtilization.floor2}`, 30, yPos);
        yPos += 5;
        doc.text(`  Floor 3: ${d.floorUtilization.floor3}`, 30, yPos);
        yPos += 10;
        
        doc.text('Hourly Occupancy Patterns:', 25, yPos);
        yPos += 6;
        d.hourlyOccupancy.forEach((item: any) => {
          doc.text(`  ${item.hour}: ${item.count} people`, 30, yPos);
          yPos += 5;
        });
      } else if (reportType === 'traffic-analysis') {
        const d: any = data;
        doc.text(`Total Entries: ${d.totalEntries.toLocaleString()}`, 25, yPos);
        yPos += 6;
        doc.text(`Total Exits: ${d.totalExits.toLocaleString()}`, 25, yPos);
        yPos += 6;
        doc.text(`Peak Flow Time: ${d.peakFlowTime} (${d.peakFlowRate} people/hour)`, 25, yPos);
        yPos += 6;
        doc.text(`Average Flow Rate: ${d.averageFlowRate} people/hour`, 25, yPos);
        yPos += 10;
        
        doc.text('Congestion Points:', 25, yPos);
        yPos += 6;
        d.congestionPoints.forEach((item: any) => {
          doc.text(`  ${item.location}: ${item.congestion}`, 30, yPos);
          yPos += 5;
        });
        yPos += 5;
        
        doc.text('Flow by Hour:', 25, yPos);
        yPos += 6;
        d.flowByHour.forEach((item: any) => {
          doc.text(`  ${item.hour}: ${item.entries} entries`, 30, yPos);
          yPos += 5;
        });
      } else if (reportType === 'demographics-report') {
        const d: any = data;
        doc.text(`Total Visitors: ${d.totalVisitors.toLocaleString()}`, 25, yPos);
        yPos += 6;
        doc.text(`Peak Demographic: ${d.peakDemographic}`, 25, yPos);
        yPos += 10;
        
        doc.text('Gender Distribution:', 25, yPos);
        yPos += 6;
        doc.text(`  Male: ${d.genderDistribution.male}`, 30, yPos);
        yPos += 5;
        doc.text(`  Female: ${d.genderDistribution.female}`, 30, yPos);
        yPos += 5;
        doc.text(`  Unidentified: ${d.genderDistribution.unidentified}`, 30, yPos);
        yPos += 10;
        
        doc.text('Age Distribution:', 25, yPos);
        yPos += 6;
        Object.entries(d.ageDistribution).forEach(([age, pct]) => {
          doc.text(`  ${age}: ${pct}`, 30, yPos);
          yPos += 5;
        });
        yPos += 5;
        
        doc.text('Visitor Profiles:', 25, yPos);
        yPos += 6;
        d.visitorProfiles.forEach((item: any) => {
          doc.text(`  ${item.profile}: ${item.percentage}`, 30, yPos);
          yPos += 5;
        });
      } else if (reportType === 'device-performance') {
        const d: any = data;
        doc.text(`Total Devices: ${d.totalDevices}`, 25, yPos);
        yPos += 6;
        doc.text(`Online: ${d.onlineDevices} | Offline: ${d.offlineDevices}`, 25, yPos);
        yPos += 6;
        doc.text(`Average Uptime: ${d.averageUptime}`, 25, yPos);
        yPos += 6;
        doc.text(`Data Quality: ${d.dataQuality}`, 25, yPos);
        yPos += 6;
        doc.text(`Maintenance Alerts: ${d.maintenanceAlerts}`, 25, yPos);
        yPos += 6;
        doc.text(`Last Maintenance: ${d.lastMaintenance}`, 25, yPos);
        yPos += 6;
        doc.text(`Next Scheduled: ${d.nextScheduledMaintenance}`, 25, yPos);
        yPos += 10;
        
        doc.text('Device Status:', 25, yPos);
        yPos += 6;
        d.deviceStatus.forEach((item: any) => {
          doc.text(`  ${item.device}: ${item.status} | Uptime: ${item.uptime} | Quality: ${item.quality}`, 30, yPos);
          yPos += 5;
        });
      }
      
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

  const generateExcelReport = () => {
    setIsGenerating(true);

    try {
      const data = getReportData(reportType);
      const template = reportTemplates.find(t => t.id === reportType);
      
      let worksheetData: any[] = [];

      if (reportType === 'occupancy-summary') {
        const d: any = data;
        worksheetData = [
          ['Occupancy Summary Report'],
          ['Generated:', new Date().toLocaleString()],
          ['Period:', timePeriod.replace('-', ' ').toUpperCase()],
          [],
          ['Metric', 'Value'],
          ['Current Occupancy', `${d.currentOccupancy} / ${d.maxCapacity}`],
          ['Occupancy Rate', d.occupancyRate],
          ['Average Dwell Time', `${d.averageDwellTime} minutes`],
          ['Peak Occupancy Time', d.peakOccupancyTime],
          ['Peak Occupancy Count', d.peakOccupancyCount],
          [],
          ['Floor Utilization'],
          ['Floor 1', d.floorUtilization.floor1],
          ['Floor 2', d.floorUtilization.floor2],
          ['Floor 3', d.floorUtilization.floor3],
          [],
          ['Hourly Occupancy'],
          ['Hour', 'Count'],
          ...d.hourlyOccupancy.map((item: any) => [item.hour, item.count])
        ];
      } else if (reportType === 'traffic-analysis') {
        const d: any = data;
        worksheetData = [
          ['Traffic Flow Analysis Report'],
          ['Generated:', new Date().toLocaleString()],
          ['Period:', timePeriod.replace('-', ' ').toUpperCase()],
          [],
          ['Metric', 'Value'],
          ['Total Entries', d.totalEntries],
          ['Total Exits', d.totalExits],
          ['Peak Flow Time', d.peakFlowTime],
          ['Peak Flow Rate', `${d.peakFlowRate} people/hour`],
          ['Average Flow Rate', `${d.averageFlowRate} people/hour`],
          [],
          ['Congestion Points'],
          ['Location', 'Congestion Level'],
          ...d.congestionPoints.map((item: any) => [item.location, item.congestion]),
          [],
          ['Flow by Hour'],
          ['Hour', 'Entries'],
          ...d.flowByHour.map((item: any) => [item.hour, item.entries])
        ];
      } else if (reportType === 'demographics-report') {
        const d: any = data;
        worksheetData = [
          ['Demographics Report'],
          ['Generated:', new Date().toLocaleString()],
          ['Period:', timePeriod.replace('-', ' ').toUpperCase()],
          [],
          ['Metric', 'Value'],
          ['Total Visitors', d.totalVisitors],
          ['Peak Demographic', d.peakDemographic],
          [],
          ['Gender Distribution'],
          ['Male', d.genderDistribution.male],
          ['Female', d.genderDistribution.female],
          ['Unidentified', d.genderDistribution.unidentified],
          [],
          ['Age Distribution'],
          ...Object.entries(d.ageDistribution).map(([age, pct]) => [age, pct]),
          [],
          ['Visitor Profiles'],
          ['Profile', 'Percentage'],
          ...d.visitorProfiles.map((item: any) => [item.profile, item.percentage])
        ];
      } else if (reportType === 'device-performance') {
        const d: any = data;
        worksheetData = [
          ['Device Performance Report'],
          ['Generated:', new Date().toLocaleString()],
          ['Period:', timePeriod.replace('-', ' ').toUpperCase()],
          [],
          ['Metric', 'Value'],
          ['Total Devices', d.totalDevices],
          ['Online Devices', d.onlineDevices],
          ['Offline Devices', d.offlineDevices],
          ['Average Uptime', d.averageUptime],
          ['Data Quality', d.dataQuality],
          ['Maintenance Alerts', d.maintenanceAlerts],
          ['Last Maintenance', d.lastMaintenance],
          ['Next Scheduled Maintenance', d.nextScheduledMaintenance],
          [],
          ['Device Status'],
          ['Device', 'Status', 'Uptime', 'Quality'],
          ...d.deviceStatus.map((item: any) => [item.device, item.status, item.uptime, item.quality])
        ];
      }

      const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');

      const filename = `${template?.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(workbook, filename);

    } catch (error) {
      console.error('Error generating Excel:', error);
      alert('Failed to generate Excel report');
    } finally {
      setIsGenerating(false);
    }
  };

  const generateCSVReport = () => {
    setIsGenerating(true);

    try {
      const data = getReportData(reportType);
      const template = reportTemplates.find(t => t.id === reportType);
      
      let csvContent = '';

      if (reportType === 'occupancy-summary') {
        const d: any = data;
        csvContent = `Occupancy Summary Report\n`;
        csvContent += `Generated,${new Date().toLocaleString()}\n`;
        csvContent += `Period,${timePeriod.replace('-', ' ').toUpperCase()}\n\n`;
        csvContent += `Metric,Value\n`;
        csvContent += `Current Occupancy,"${d.currentOccupancy} / ${d.maxCapacity}"\n`;
        csvContent += `Occupancy Rate,${d.occupancyRate}\n`;
        csvContent += `Average Dwell Time,${d.averageDwellTime} minutes\n`;
        csvContent += `Peak Occupancy Time,${d.peakOccupancyTime}\n`;
        csvContent += `Peak Occupancy Count,${d.peakOccupancyCount}\n\n`;
        csvContent += `Floor Utilization\n`;
        csvContent += `Floor 1,${d.floorUtilization.floor1}\n`;
        csvContent += `Floor 2,${d.floorUtilization.floor2}\n`;
        csvContent += `Floor 3,${d.floorUtilization.floor3}\n\n`;
        csvContent += `Hourly Occupancy\nHour,Count\n`;
        d.hourlyOccupancy.forEach((item: any) => {
          csvContent += `${item.hour},${item.count}\n`;
        });
      } else if (reportType === 'traffic-analysis') {
        const d: any = data;
        csvContent = `Traffic Flow Analysis Report\n`;
        csvContent += `Generated,${new Date().toLocaleString()}\n`;
        csvContent += `Period,${timePeriod.replace('-', ' ').toUpperCase()}\n\n`;
        csvContent += `Metric,Value\n`;
        csvContent += `Total Entries,${d.totalEntries}\n`;
        csvContent += `Total Exits,${d.totalExits}\n`;
        csvContent += `Peak Flow Time,${d.peakFlowTime}\n`;
        csvContent += `Peak Flow Rate,${d.peakFlowRate} people/hour\n`;
        csvContent += `Average Flow Rate,${d.averageFlowRate} people/hour\n\n`;
        csvContent += `Congestion Points\nLocation,Congestion Level\n`;
        d.congestionPoints.forEach((item: any) => {
          csvContent += `${item.location},${item.congestion}\n`;
        });
        csvContent += `\nFlow by Hour\nHour,Entries\n`;
        d.flowByHour.forEach((item: any) => {
          csvContent += `${item.hour},${item.entries}\n`;
        });
      } else if (reportType === 'demographics-report') {
        const d: any = data;
        csvContent = `Demographics Report\n`;
        csvContent += `Generated,${new Date().toLocaleString()}\n`;
        csvContent += `Period,${timePeriod.replace('-', ' ').toUpperCase()}\n\n`;
        csvContent += `Metric,Value\n`;
        csvContent += `Total Visitors,${d.totalVisitors}\n`;
        csvContent += `Peak Demographic,${d.peakDemographic}\n\n`;
        csvContent += `Gender Distribution\n`;
        csvContent += `Male,${d.genderDistribution.male}\n`;
        csvContent += `Female,${d.genderDistribution.female}\n`;
        csvContent += `Unidentified,${d.genderDistribution.unidentified}\n\n`;
        csvContent += `Age Distribution\nAge Group,Percentage\n`;
        Object.entries(d.ageDistribution).forEach(([age, pct]) => {
          csvContent += `${age},${pct}\n`;
        });
        csvContent += `\nVisitor Profiles\nProfile,Percentage\n`;
        d.visitorProfiles.forEach((item: any) => {
          csvContent += `${item.profile},${item.percentage}\n`;
        });
      } else if (reportType === 'device-performance') {
        const d: any = data;
        csvContent = `Device Performance Report\n`;
        csvContent += `Generated,${new Date().toLocaleString()}\n`;
        csvContent += `Period,${timePeriod.replace('-', ' ').toUpperCase()}\n\n`;
        csvContent += `Metric,Value\n`;
        csvContent += `Total Devices,${d.totalDevices}\n`;
        csvContent += `Online Devices,${d.onlineDevices}\n`;
        csvContent += `Offline Devices,${d.offlineDevices}\n`;
        csvContent += `Average Uptime,${d.averageUptime}\n`;
        csvContent += `Data Quality,${d.dataQuality}\n`;
        csvContent += `Maintenance Alerts,${d.maintenanceAlerts}\n`;
        csvContent += `Last Maintenance,${d.lastMaintenance}\n`;
        csvContent += `Next Scheduled Maintenance,${d.nextScheduledMaintenance}\n\n`;
        csvContent += `Device Status\nDevice,Status,Uptime,Quality\n`;
        d.deviceStatus.forEach((item: any) => {
          csvContent += `${item.device},${item.status},${item.uptime},${item.quality}\n`;
        });
      }

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `${template?.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (error) {
      console.error('Error generating CSV:', error);
      alert('Failed to generate CSV report');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateReport = () => {
    if (format === 'pdf') {
      generatePDFReport();
    } else if (format === 'excel') {
      generateExcelReport();
    } else if (format === 'csv') {
      generateCSVReport();
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
              {format.toUpperCase()}
            </div>
            <p style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>Export Format</p>
          </div>
        </div>

        <div className="vrm-card">
          <div className="vrm-card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '36px', fontWeight: '700', color: 'var(--vrm-accent-purple)', marginBottom: '8px' }}>
              {timePeriod.split('-').length}
            </div>
            <p style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>Time Period</p>
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
              disabled={isGenerating}
            >
              {isGenerating ? 'Generating...' : 'Generate & Download Report'}
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
