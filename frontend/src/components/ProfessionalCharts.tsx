import React from 'react';
import './ProfessionalCharts.css';

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

interface ChartProps {
  data: ChartData[];
  intelligence: any;
}

// Professional Live Occupancy Chart
export const LiveOccupancyChart: React.FC<ChartProps> = ({ data, intelligence }) => {
  const currentHour = new Date().getHours();
  const currentData = data.filter(d => {
    if (!d.timestamp) return false;
    const hour = new Date(d.timestamp).getHours();
    return !isNaN(hour) && hour === currentHour;
  });

  const maxCount = Math.max(currentData.length, 50); // Scale for visual appeal
  const percentage = (currentData.length / maxCount) * 100;

  return (
    <div className="professional-chart">
      <div className="chart-visual">
        <div className="occupancy-gauge">
          <div className="gauge-background">
            <div 
              className="gauge-fill" 
              style={{ width: `${percentage}%` }}
            ></div>
          </div>
          <div className="gauge-center">
            <div className="gauge-value">{currentData.length}</div>
            <div className="gauge-label">Current</div>
          </div>
        </div>
        <div className="chart-stats">
          <div className="stat-item">
            <span className="stat-value">{data.length.toLocaleString()}</span>
            <span className="stat-label">Total Records</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{intelligence.peak_hours[0] || 'N/A'}h</span>
            <span className="stat-label">Peak Hour</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Professional Traffic Over Time Chart
export const TrafficTimeChart: React.FC<ChartProps> = ({ data, intelligence }) => {
  // Group data by hour
  const hourlyData: { [key: number]: number } = {};
  for (let i = 0; i < 24; i++) hourlyData[i] = 0;
  
  data.forEach(d => {
    if (d.hour >= 0 && d.hour <= 23) {
      hourlyData[d.hour]++;
    }
  });

  const maxValue = Math.max(...Object.values(hourlyData));
  const hours = Object.entries(hourlyData);

  return (
    <div className="professional-chart">
      <div className="chart-visual">
        <div className="bar-chart">
          {hours.map(([hour, count]) => {
            const height = maxValue > 0 ? (count / maxValue) * 100 : 0;
            const isPeak = intelligence.peak_hours.includes(parseInt(hour));
            
            return (
              <div key={hour} className="bar-item">
                <div 
                  className={`bar ${isPeak ? 'bar-peak' : ''}`}
                  style={{ height: `${height}%` }}
                  title={`${hour}:00 - ${count} records`}
                ></div>
                <div className="bar-label">{parseInt(hour) % 6 === 0 ? `${hour}h` : ''}</div>
              </div>
            );
          })}
        </div>
        <div className="chart-info">
          <div className="granularity-badge">
            {intelligence.optimal_granularity} view
          </div>
        </div>
      </div>
    </div>
  );
};

// Professional Age Distribution Pie Chart
export const AgeDistributionChart: React.FC<ChartProps> = ({ data }) => {
  const ageGroups = data.reduce((acc: { [key: string]: number }, item) => {
    acc[item.age_estimate] = (acc[item.age_estimate] || 0) + 1;
    return acc;
  }, {});

  const total = Object.values(ageGroups).reduce((sum, count) => sum + count, 0);
  const colors = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#00f2fe'];
  
  let currentAngle = 0;
  const segments = Object.entries(ageGroups).map(([age, count], index) => {
    const percentage = (count / total) * 100;
    const angle = (count / total) * 360;
    const startAngle = currentAngle;
    currentAngle += angle;
    
    return {
      age,
      count,
      percentage,
      startAngle,
      endAngle: currentAngle,
      color: colors[index % colors.length]
    };
  });

  return (
    <div className="professional-chart">
      <div className="chart-visual">
        <div className="pie-chart-container">
          <div className="pie-chart">
            <svg viewBox="0 0 100 100" className="pie-svg">
              {segments.map((segment, index) => {
                const startAngleRad = (segment.startAngle - 90) * (Math.PI / 180);
                const endAngleRad = (segment.endAngle - 90) * (Math.PI / 180);
                const largeArcFlag = segment.endAngle - segment.startAngle <= 180 ? "0" : "1";
                
                const x1 = 50 + 40 * Math.cos(startAngleRad);
                const y1 = 50 + 40 * Math.sin(startAngleRad);
                const x2 = 50 + 40 * Math.cos(endAngleRad);
                const y2 = 50 + 40 * Math.sin(endAngleRad);
                
                const pathData = [
                  `M 50 50`,
                  `L ${x1} ${y1}`,
                  `A 40 40 0 ${largeArcFlag} 1 ${x2} ${y2}`,
                  `Z`
                ].join(' ');
                
                return (
                  <path
                    key={index}
                    d={pathData}
                    fill={segment.color}
                    stroke="#fff"
                    strokeWidth="0.5"
                  />
                );
              })}
            </svg>
            <div className="pie-center">
              <div className="pie-total">{total}</div>
              <div className="pie-label">Total</div>
            </div>
          </div>
          <div className="pie-legend">
            {segments.map((segment, index) => (
              <div key={index} className="legend-item">
                <div 
                  className="legend-color" 
                  style={{ backgroundColor: segment.color }}
                ></div>
                <span className="legend-text">
                  {segment.age} ({segment.percentage.toFixed(1)}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// Professional Entry/Exit Flow Chart
export const EntryExitChart: React.FC<ChartProps> = ({ data }) => {
  const entryData = data.filter(d => d.event === 'entry');
  const exitData = data.filter(d => d.event === 'exit');
  
  const entryByHour: { [key: number]: number } = {};
  const exitByHour: { [key: number]: number } = {};
  
  for (let i = 0; i < 24; i++) {
    entryByHour[i] = 0;
    exitByHour[i] = 0;
  }
  
  entryData.forEach(d => {
    if (d.hour >= 0 && d.hour <= 23) entryByHour[d.hour]++;
  });
  
  exitData.forEach(d => {
    if (d.hour >= 0 && d.hour <= 23) exitByHour[d.hour]++;
  });
  
  const maxValue = Math.max(
    ...Object.values(entryByHour),
    ...Object.values(exitByHour)
  );

  return (
    <div className="professional-chart">
      <div className="chart-visual">
        <div className="flow-chart">
          <div className="flow-legend">
            <div className="legend-item">
              <div className="legend-color entry-color"></div>
              <span>Entry ({entryData.length})</span>
            </div>
            <div className="legend-item">
              <div className="legend-color exit-color"></div>
              <span>Exit ({exitData.length})</span>
            </div>
          </div>
          <div className="stacked-bars">
            {Array.from({ length: 24 }, (_, hour) => {
              const entryHeight = maxValue > 0 ? (entryByHour[hour] / maxValue) * 100 : 0;
              const exitHeight = maxValue > 0 ? (exitByHour[hour] / maxValue) * 100 : 0;
              
              return (
                <div key={hour} className="stacked-bar-item">
                  <div className="stacked-bar">
                    <div 
                      className="bar-segment entry-bar"
                      style={{ height: `${entryHeight}%` }}
                      title={`${hour}:00 Entry: ${entryByHour[hour]}`}
                    ></div>
                    <div 
                      className="bar-segment exit-bar"
                      style={{ height: `${exitHeight}%` }}
                      title={`${hour}:00 Exit: ${exitByHour[hour]}`}
                    ></div>
                  </div>
                  <div className="bar-label">{hour % 4 === 0 ? `${hour}h` : ''}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};