import React, { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface ChartData {
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

interface ConfigurableChartProps {
  data: ChartData[];
  intelligence: any;
}

type TimeFrame = 'last24h' | 'last7days' | 'last30days' | 'custom';
type DataType = 'activity' | 'entrances' | 'exits' | 'occupancy';

const ConfigurableChart: React.FC<ConfigurableChartProps> = ({ data, intelligence }) => {
  const [timeFrame, setTimeFrame] = useState<TimeFrame>('last24h');
  const [dataType, setDataType] = useState<DataType>('activity');
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    processChartData();
  }, [data, timeFrame, dataType]);

  const processChartData = () => {
    if (!data || data.length === 0) return;

    let filteredData = [...data];
    const now = new Date();

    // Filter by time frame
    switch (timeFrame) {
      case 'last24h':
        const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        filteredData = data.filter(d => new Date(d.timestamp) >= last24h);
        break;
      case 'last7days':
        const last7days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        filteredData = data.filter(d => new Date(d.timestamp) >= last7days);
        break;
      case 'last30days':
        const last30days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        filteredData = data.filter(d => new Date(d.timestamp) >= last30days);
        break;
    }

    // Group and process data based on type
    const grouped: { [key: string]: any } = {};
    
    if (timeFrame === 'last24h') {
      // Group by hour for 24h view
      filteredData.forEach(item => {
        const hour = `${item.hour}:00`;
        if (!grouped[hour]) {
          grouped[hour] = { name: hour, activity: 0, entrances: 0, exits: 0, occupancy: 0 };
        }
        grouped[hour].activity++;
        if (item.event === 'entry') grouped[hour].entrances++;
        if (item.event === 'exit') grouped[hour].exits++;
      });
    } else {
      // Group by date for longer periods
      filteredData.forEach(item => {
        const date = new Date(item.timestamp).toLocaleDateString();
        if (!grouped[date]) {
          grouped[date] = { name: date, activity: 0, entrances: 0, exits: 0, occupancy: 0 };
        }
        grouped[date].activity++;
        if (item.event === 'entry') grouped[date].entrances++;
        if (item.event === 'exit') grouped[date].exits++;
      });
    }

    // Calculate running occupancy
    let runningOccupancy = 0;
    const processedData = Object.values(grouped).map(item => {
      runningOccupancy += (item.entrances - item.exits);
      return {
        ...item,
        occupancy: Math.max(0, runningOccupancy)
      };
    });

    setChartData(processedData);
  };

  const renderChart = () => {
    const color = dataType === 'activity' ? '#1976d2' : 
                 dataType === 'entrances' ? '#2e7d32' : 
                 dataType === 'exits' ? '#d32f2f' : '#f57c00';

    return (
      <ResponsiveContainer width="100%" height={400}>
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--vrm-border)" />
          <XAxis 
            dataKey="name" 
            stroke="var(--vrm-text-secondary)"
            fontSize={12}
          />
          <YAxis 
            stroke="var(--vrm-text-secondary)"
            fontSize={12}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'var(--vrm-bg-secondary)', 
              border: '1px solid var(--vrm-border)',
              borderRadius: '6px',
              color: 'var(--vrm-text-primary)'
            }}
          />
          <Area 
            type="monotone" 
            dataKey={dataType} 
            stroke={color} 
            fill={color}
            fillOpacity={0.3}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div className="vrm-card">
      <div className="vrm-card-header">
        <h3 className="vrm-card-title">Analytics Dashboard</h3>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {/* Time Frame Dropdown */}
          <div>
            <label style={{ fontSize: '12px', color: 'var(--vrm-text-secondary)', marginRight: '6px' }}>
              Time Frame:
            </label>
            <select 
              value={timeFrame} 
              onChange={(e) => setTimeFrame(e.target.value as TimeFrame)}
              style={{
                backgroundColor: 'var(--vrm-bg-secondary)',
                border: '1px solid var(--vrm-border)',
                borderRadius: '4px',
                padding: '4px 8px',
                color: 'var(--vrm-text-primary)',
                fontSize: '12px'
              }}
            >
              <option value="last24h">Last 24 Hours</option>
              <option value="last7days">Last 7 Days</option>
              <option value="last30days">Last 30 Days</option>
            </select>
          </div>

          {/* Data Type Dropdown */}
          <div>
            <label style={{ fontSize: '12px', color: 'var(--vrm-text-secondary)', marginRight: '6px' }}>
              Data Type:
            </label>
            <select 
              value={dataType} 
              onChange={(e) => setDataType(e.target.value as DataType)}
              style={{
                backgroundColor: 'var(--vrm-bg-secondary)',
                border: '1px solid var(--vrm-border)',
                borderRadius: '4px',
                padding: '4px 8px',
                color: 'var(--vrm-text-primary)',
                fontSize: '12px'
              }}
            >
              <option value="activity">Activity</option>
              <option value="entrances">Entrances</option>
              <option value="exits">Exits</option>
              <option value="occupancy">Occupancy</option>
            </select>
          </div>

          <div className="vrm-card-actions">
            <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">PNG</button>
            <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">CSV</button>
          </div>
        </div>
      </div>
      <div className="vrm-card-body">
        {renderChart()}
        
        {/* Chart Summary */}
        <div style={{ 
          marginTop: '16px', 
          padding: '12px', 
          backgroundColor: 'var(--vrm-bg-tertiary)', 
          borderRadius: '6px',
          borderLeft: '4px solid var(--vrm-accent-blue)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
            <span style={{ color: 'var(--vrm-text-secondary)' }}>
              Showing {dataType} data for {timeFrame.replace(/([A-Z])/g, ' $1').toLowerCase()}
            </span>
            <span style={{ color: 'var(--vrm-text-primary)', fontWeight: '600' }}>
              {chartData.length} data points
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfigurableChart;