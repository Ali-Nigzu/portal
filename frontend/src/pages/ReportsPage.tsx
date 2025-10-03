import React, { useState, useEffect, useCallback } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { API_ENDPOINTS } from '../config';

interface EventData {
  index: number;
  track_number: number;
  event: string;
  timestamp: string;
  sex: string;
  age_estimate: string;
  hour: number;
  day_of_week: string;
  date: string;
}

interface ReportsPageProps {
  credentials?: { username: string; password: string };
}

const ReportsPage: React.FC<ReportsPageProps> = ({ credentials }) => {
  const [reportType, setReportType] = useState('occupancy-summary');
  const [timePeriod, setTimePeriod] = useState('last-7-days');
  const [format, setFormat] = useState('pdf');
  const [isGenerating, setIsGenerating] = useState(false);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    if (!credentials) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      
      const urlParams = new URLSearchParams(window.location.search);
      const viewToken = urlParams.get('view_token');
      const clientId = urlParams.get('client_id');
      
      let apiUrl = API_ENDPOINTS.CHART_DATA;
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      
      if (viewToken) {
        apiUrl += `?view_token=${encodeURIComponent(viewToken)}`;
      } else {
        const auth = btoa(`${credentials.username}:${credentials.password}`);
        headers['Authorization'] = `Basic ${auth}`;
        
        if (clientId) {
          apiUrl += `?client_id=${encodeURIComponent(clientId)}`;
        }
      }
      
      const response = await fetch(apiUrl, { headers });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      setEvents(result.data || []);
    } catch (err) {
      console.error('Failed to fetch events:', err);
    } finally {
      setLoading(false);
    }
  }, [credentials]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    if (timePeriod === 'custom-range') {
      setShowDatePicker(true);
    } else {
      setShowDatePicker(false);
    }
  }, [timePeriod]);

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

  const getFilteredEvents = () => {
    let filtered = [...events];
    
    if (timePeriod !== 'custom-range') {
      const now = new Date();
      let startDate = new Date();
      
      if (timePeriod === 'last-7-days') {
        startDate.setDate(now.getDate() - 7);
      } else if (timePeriod === 'last-30-days') {
        startDate.setDate(now.getDate() - 30);
      } else if (timePeriod === 'this-month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (timePeriod === 'last-month') {
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
        filtered = filtered.filter(e => {
          const eventDate = new Date(e.timestamp);
          return eventDate >= startDate && eventDate <= endOfLastMonth;
        });
        return filtered;
      }
      
      filtered = filtered.filter(e => new Date(e.timestamp) >= startDate);
    } else if (startDate && endDate) {
      filtered = filtered.filter(e => {
        const eventDate = new Date(e.timestamp);
        const eventDateOnly = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
        const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
        const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
        return eventDateOnly >= startDateOnly && eventDateOnly <= endDateOnly;
      });
    }
    
    return filtered;
  };

  const generateOccupancyData = () => {
    const filtered = getFilteredEvents();
    const entries = filtered.filter(e => e.event.toLowerCase() === 'entry').length;
    const exits = filtered.filter(e => e.event.toLowerCase() === 'exit').length;
    const currentOccupancy = Math.max(0, entries - exits);
    
    const trackMap: {[key: number]: Date[]} = {};
    filtered.forEach(e => {
      if (!trackMap[e.track_number]) trackMap[e.track_number] = [];
      trackMap[e.track_number].push(new Date(e.timestamp));
    });
    
    const dwellTimes: number[] = [];
    Object.values(trackMap).forEach(timestamps => {
      if (timestamps.length >= 2) {
        const sorted = timestamps.sort((a, b) => a.getTime() - b.getTime());
        const dwellMinutes = (sorted[sorted.length - 1].getTime() - sorted[0].getTime()) / 60000;
        if (dwellMinutes > 0 && dwellMinutes < 1440) {
          dwellTimes.push(dwellMinutes);
        }
      }
    });
    
    const avgDwellTime = dwellTimes.length > 0 
      ? Math.round(dwellTimes.reduce((a, b) => a + b, 0) / dwellTimes.length)
      : 0;
    
    const sortedEvents = [...filtered].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    const hourlyOccupancy: {[key: number]: number} = {};
    let runningOccupancy = 0;
    let lastTimestamp: Date | null = null;
    
    sortedEvents.forEach(e => {
      const currentTimestamp = new Date(e.timestamp);
      
      if (lastTimestamp) {
        let tempTime = new Date(lastTimestamp);
        tempTime.setMinutes(0, 0, 0);
        tempTime.setHours(tempTime.getHours() + 1);
        
        while (tempTime <= currentTimestamp) {
          const tempHour = tempTime.getHours();
          hourlyOccupancy[tempHour] = Math.max(hourlyOccupancy[tempHour] || 0, runningOccupancy);
          tempTime.setHours(tempTime.getHours() + 1);
        }
      }
      
      const currentHour = currentTimestamp.getHours();
      hourlyOccupancy[currentHour] = Math.max(hourlyOccupancy[currentHour] || 0, runningOccupancy);
      
      if (e.event.toLowerCase() === 'entry') {
        runningOccupancy++;
      } else if (e.event.toLowerCase() === 'exit') {
        runningOccupancy = Math.max(0, runningOccupancy - 1);
      }
      
      hourlyOccupancy[currentHour] = Math.max(hourlyOccupancy[currentHour] || 0, runningOccupancy);
      
      lastTimestamp = currentTimestamp;
    });
    
    if (lastTimestamp && runningOccupancy > 0) {
      let windowEnd = new Date();
      
      if (timePeriod === 'last-month') {
        const now = new Date();
        windowEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      } else if (timePeriod === 'custom-range' && endDate) {
        windowEnd = new Date(endDate);
        windowEnd.setHours(23, 59, 59, 999);
      }
      
      const lastTime = lastTimestamp as Date;
      let tempTime = new Date(lastTime);
      tempTime.setMinutes(0, 0, 0);
      tempTime.setHours(tempTime.getHours() + 1);
      
      while (tempTime <= windowEnd && tempTime.getTime() - lastTime.getTime() < 24 * 60 * 60 * 1000) {
        const tempHour = tempTime.getHours();
        hourlyOccupancy[tempHour] = Math.max(hourlyOccupancy[tempHour] || 0, runningOccupancy);
        tempTime.setHours(tempTime.getHours() + 1);
      }
    }
    
    let peakHour = 0;
    let peakCount = 0;
    Object.entries(hourlyOccupancy).forEach(([hour, count]) => {
      if (count > peakCount) {
        peakCount = count;
        peakHour = parseInt(hour);
      }
    });
    
    return {
      currentOccupancy,
      totalEntries: entries,
      totalExits: exits,
      occupancyRate: entries > 0 ? ((currentOccupancy / entries) * 100).toFixed(1) + '%' : '0%',
      averageDwellTime: avgDwellTime,
      peakOccupancyTime: `${peakHour.toString().padStart(2, '0')}:00`,
      peakOccupancyCount: peakCount,
      hourlyOccupancy: Object.entries(hourlyOccupancy).map(([hour, count]) => ({
        hour: `${hour.toString().padStart(2, '0')}:00`,
        count
      })).sort((a, b) => parseInt(a.hour) - parseInt(b.hour))
    };
  };

  const generateTrafficData = () => {
    const filtered = getFilteredEvents();
    const entries = filtered.filter(e => e.event.toLowerCase() === 'entry');
    const exits = filtered.filter(e => e.event.toLowerCase() === 'exit');
    
    const hourCounts: {[key: number]: {entries: number, exits: number}} = {};
    filtered.forEach(e => {
      const hour = e.hour;
      if (!hourCounts[hour]) hourCounts[hour] = {entries: 0, exits: 0};
      if (e.event.toLowerCase() === 'entry') hourCounts[hour].entries++;
      if (e.event.toLowerCase() === 'exit') hourCounts[hour].exits++;
    });
    
    let peakHour = 0;
    let peakRate = 0;
    Object.entries(hourCounts).forEach(([hour, counts]) => {
      const rate = counts.entries + counts.exits;
      if (rate > peakRate) {
        peakRate = rate;
        peakHour = parseInt(hour);
      }
    });
    
    const totalFlow = entries.length + exits.length;
    const hours = Object.keys(hourCounts).length || 1;
    const avgFlowRate = Math.round(totalFlow / hours);
    
    return {
      totalEntries: entries.length,
      totalExits: exits.length,
      peakFlowTime: `${peakHour.toString().padStart(2, '0')}:00`,
      peakFlowRate: peakRate,
      averageFlowRate: avgFlowRate,
      flowByHour: Object.entries(hourCounts).map(([hour, counts]) => ({
        hour: `${hour.toString().padStart(2, '0')}:00`,
        entries: counts.entries
      })).sort((a, b) => parseInt(a.hour) - parseInt(b.hour))
    };
  };

  const generateDemographicsData = () => {
    const filtered = getFilteredEvents();
    const totalVisitors = new Set(filtered.map(e => e.track_number)).size;
    
    const genderCounts = { male: 0, female: 0, unidentified: 0 };
    const ageCounts: {[key: string]: number} = {
      '18-25': 0,
      '26-35': 0,
      '36-45': 0,
      '46-60': 0,
      '60+': 0
    };
    
    filtered.forEach(e => {
      const sex = e.sex.toLowerCase();
      if (sex === 'm' || sex === 'male') genderCounts.male++;
      else if (sex === 'f' || sex === 'female') genderCounts.female++;
      else genderCounts.unidentified++;
      
      const ageStr = e.age_estimate.toString().toLowerCase();
      if (ageStr.includes('0,8') || ageStr.includes('9,16')) {
        // Skip children/teens
      } else if (ageStr.includes('17,25')) {
        ageCounts['18-25']++;
      } else if (ageStr.includes('25,40')) {
        ageCounts['26-35']++;
      } else if (ageStr.includes('40,60')) {
        ageCounts['46-60']++;
      } else if (ageStr.includes('60+') || ageStr.includes('60)')) {
        ageCounts['60+']++;
      }
    });
    
    const totalGender = genderCounts.male + genderCounts.female + genderCounts.unidentified;
    const genderPcts = totalGender > 0 ? {
      male: ((genderCounts.male / totalGender) * 100).toFixed(1),
      female: ((genderCounts.female / totalGender) * 100).toFixed(1),
      unidentified: ((genderCounts.unidentified / totalGender) * 100).toFixed(1)
    } : {
      male: '0.0',
      female: '0.0',
      unidentified: '0.0'
    };
    
    const totalAge = Object.values(ageCounts).reduce((a, b) => a + b, 0);
    const agePcts: {[key: string]: string} = {};
    Object.entries(ageCounts).forEach(([age, count]) => {
      agePcts[age] = totalAge > 0 ? ((count / totalAge) * 100).toFixed(1) : '0.0';
    });
    
    let peakAge = '26-35';
    let maxAgeCount = 0;
    Object.entries(ageCounts).forEach(([age, count]) => {
      if (count > maxAgeCount) {
        maxAgeCount = count;
        peakAge = age;
      }
    });
    
    return {
      totalVisitors,
      genderDistribution: {
        male: genderPcts.male + '%',
        female: genderPcts.female + '%',
        unidentified: genderPcts.unidentified + '%'
      },
      ageDistribution: {
        '18-25': agePcts['18-25'] + '%',
        '26-35': agePcts['26-35'] + '%',
        '36-45': agePcts['36-45'] + '%',
        '46-60': agePcts['46-60'] + '%',
        '60+': agePcts['60+'] + '%'
      },
      peakDemographic: `${peakAge} age group`
    };
  };

  const generateDeviceData = () => {
    return {
      message: 'Device performance data is not available in the current data source. This report requires camera/sensor metadata that is not present in the CSV data.'
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
        doc.text(`Current Occupancy: ${d.currentOccupancy} (${d.occupancyRate})`, 25, yPos);
        yPos += 6;
        doc.text(`Total Entries: ${d.totalEntries.toLocaleString()}`, 25, yPos);
        yPos += 6;
        doc.text(`Total Exits: ${d.totalExits.toLocaleString()}`, 25, yPos);
        yPos += 6;
        doc.text(`Average Dwell Time: ${d.averageDwellTime} minutes`, 25, yPos);
        yPos += 6;
        doc.text(`Peak Occupancy Time: ${d.peakOccupancyTime} (${d.peakOccupancyCount} events)`, 25, yPos);
        yPos += 10;
        
        if (d.hourlyOccupancy && d.hourlyOccupancy.length > 0) {
          doc.text('Hourly Occupancy Patterns:', 25, yPos);
          yPos += 6;
          d.hourlyOccupancy.slice(0, 15).forEach((item: any) => {
            doc.text(`  ${item.hour}: ${item.count} events`, 30, yPos);
            yPos += 5;
          });
        }
      } else if (reportType === 'traffic-analysis') {
        const d: any = data;
        doc.text(`Total Entries: ${d.totalEntries.toLocaleString()}`, 25, yPos);
        yPos += 6;
        doc.text(`Total Exits: ${d.totalExits.toLocaleString()}`, 25, yPos);
        yPos += 6;
        doc.text(`Peak Flow Time: ${d.peakFlowTime} (${d.peakFlowRate} events/hour)`, 25, yPos);
        yPos += 6;
        doc.text(`Average Flow Rate: ${d.averageFlowRate} events/hour`, 25, yPos);
        yPos += 10;
        
        if (d.flowByHour && d.flowByHour.length > 0) {
          doc.text('Flow by Hour:', 25, yPos);
          yPos += 6;
          d.flowByHour.slice(0, 15).forEach((item: any) => {
            doc.text(`  ${item.hour}: ${item.entries} entries`, 30, yPos);
            yPos += 5;
          });
        }
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
      } else if (reportType === 'device-performance') {
        const d: any = data;
        if (d.message) {
          doc.text(d.message, 25, yPos, { maxWidth: 160 });
        }
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
          ['Current Occupancy', d.currentOccupancy],
          ['Total Entries', d.totalEntries],
          ['Total Exits', d.totalExits],
          ['Occupancy Rate', d.occupancyRate],
          ['Average Dwell Time', `${d.averageDwellTime} minutes`],
          ['Peak Occupancy Time', d.peakOccupancyTime],
          ['Peak Occupancy Count', d.peakOccupancyCount],
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
          ['Peak Flow Rate', `${d.peakFlowRate} events/hour`],
          ['Average Flow Rate', `${d.averageFlowRate} events/hour`],
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
          ...Object.entries(d.ageDistribution).map(([age, pct]) => [age, pct])
        ];
      } else if (reportType === 'device-performance') {
        const d: any = data;
        worksheetData = [
          ['Device Performance Report'],
          ['Generated:', new Date().toLocaleString()],
          ['Period:', timePeriod.replace('-', ' ').toUpperCase()],
          [],
          [d.message || 'No data available']
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
        csvContent += `Current Occupancy,${d.currentOccupancy}\n`;
        csvContent += `Total Entries,${d.totalEntries}\n`;
        csvContent += `Total Exits,${d.totalExits}\n`;
        csvContent += `Occupancy Rate,${d.occupancyRate}\n`;
        csvContent += `Average Dwell Time,${d.averageDwellTime} minutes\n`;
        csvContent += `Peak Occupancy Time,${d.peakOccupancyTime}\n`;
        csvContent += `Peak Occupancy Count,${d.peakOccupancyCount}\n\n`;
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
        csvContent += `Peak Flow Rate,${d.peakFlowRate} events/hour\n`;
        csvContent += `Average Flow Rate,${d.averageFlowRate} events/hour\n\n`;
        csvContent += `Flow by Hour\nHour,Entries\n`;
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
      } else if (reportType === 'device-performance') {
        const d: any = data;
        csvContent = `Device Performance Report\n`;
        csvContent += `Generated,${new Date().toLocaleString()}\n`;
        csvContent += `Period,${timePeriod.replace('-', ' ').toUpperCase()}\n\n`;
        csvContent += `${d.message || 'No data available'}\n`;
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
          
          {showDatePicker && (
            <div style={{ marginTop: '20px', padding: '16px', backgroundColor: 'var(--vrm-bg-secondary)', borderRadius: '6px', border: '1px solid var(--vrm-border)' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>
                    Start Date
                  </label>
                  <DatePicker
                    selected={startDate}
                    onChange={(date) => setStartDate(date)}
                    selectsStart
                    startDate={startDate}
                    endDate={endDate}
                    dateFormat="yyyy-MM-dd"
                    className="vrm-date-picker"
                    placeholderText="Select start date"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>
                    End Date
                  </label>
                  <DatePicker
                    selected={endDate}
                    onChange={(date) => setEndDate(date)}
                    selectsEnd
                    startDate={startDate}
                    endDate={endDate}
                    minDate={startDate || undefined}
                    dateFormat="yyyy-MM-dd"
                    className="vrm-date-picker"
                    placeholderText="Select end date"
                  />
                </div>
              </div>
            </div>
          )}
          
          <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
            <button 
              className="vrm-btn" 
              style={{ flex: 1 }}
              onClick={handleGenerateReport}
              disabled={isGenerating || loading}
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
