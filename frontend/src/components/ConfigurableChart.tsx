import React, { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { exportChartAsPNG, exportDataAsCSV, generateChartId } from '../utils/exportUtils';

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

type DataType = 'activity' | 'entrances' | 'exits' | 'occupancy';

const ConfigurableChart: React.FC<ConfigurableChartProps> = ({ data, intelligence }) => {
  const [dataType, setDataType] = useState<DataType>('activity');
  const [chartData, setChartData] = useState<any[]>([]);
  const chartRef = useRef<HTMLDivElement>(null);
  const chartId = generateChartId('configurable-chart');

  useEffect(() => {
    processChartData();
  }, [data, dataType]);

  const processChartData = () => {
    if (!data || data.length === 0) return;

    // Use the data passed in (already filtered by parent component)
    const filteredData = data;

    // Group and process data based on type
    const grouped: { [key: string]: any } = {};
    
    // Determine if we should group by hour or by date based on data span
    const timeSpan = filteredData.length > 0 ? 
      new Date(Math.max(...filteredData.map(d => new Date(d.timestamp).getTime()))).getTime() - 
      new Date(Math.min(...filteredData.map(d => new Date(d.timestamp).getTime()))).getTime() : 0;
    const isShortTimespan = timeSpan <= 24 * 60 * 60 * 1000; // Less than or equal to 24 hours
    
    if (isShortTimespan && filteredData.length > 0) {
      // Group by hour for short timespans
      filteredData.forEach(item => {
        const hour = `${item.hour.toString().padStart(2, '0')}:00`;
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
            <button 
              className="vrm-btn vrm-btn-secondary vrm-btn-sm"
              onClick={() => exportChartAsPNG(chartId, `activity-chart-${dataType}`)}
            >
              PNG
            </button>
            <button 
              className="vrm-btn vrm-btn-secondary vrm-btn-sm"
              onClick={() => exportDataAsCSV(chartData, `activity-data-${dataType}`)}
            >
              CSV
            </button>
          </div>
        </div>
      </div>
      <div className="vrm-card-body">
        <div id={chartId} ref={chartRef}>
          {renderChart()}
        </div>
        
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
              Showing {dataType} data
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