import React from 'react';
import ReactECharts from 'echarts-for-react';

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

interface Intelligence {
  total_records: number;
  date_span_days: number;
  latest_timestamp: string | null;
  optimal_granularity: string;
  peak_hours: number[];
  demographics_breakdown: Record<string, unknown>;
  temporal_patterns: Record<string, unknown>;
}

interface ChartProps {
  data: ChartData[];
  intelligence: Intelligence;
}

// Professional Live Occupancy Chart with ECharts
export const LiveOccupancyChart: React.FC<ChartProps> = ({ data, intelligence }) => {
  const currentHour = new Date().getHours();
  const currentData = data.filter(d => {
    if (!d.timestamp) return false;
    const hour = new Date(d.timestamp).getHours();
    return !isNaN(hour) && hour === currentHour;
  });

  const maxCount = Math.max(currentData.length, 50);
  const percentage = (currentData.length / maxCount) * 100;

  const option = {
    title: {
      text: 'Live Occupancy',
      textStyle: { color: '#ffffff', fontSize: 18 }
    },
    backgroundColor: 'transparent',
    series: [{
      type: 'gauge',
      min: 0,
      max: 100,
      splitNumber: 10,
      radius: '80%',
      axisLine: {
        lineStyle: {
          width: 8,
          color: [[0.3, '#67e0e3'], [0.7, '#37a2da'], [1, '#fd666d']]
        }
      },
      pointer: {
        itemStyle: { color: 'auto' }
      },
      axisTick: {
        distance: -30,
        length: 8,
        lineStyle: { color: '#fff', width: 2 }
      },
      splitLine: {
        distance: -30,
        length: 30,
        lineStyle: { color: '#fff', width: 4 }
      },
      axisLabel: {
        color: 'auto',
        distance: 40,
        fontSize: 12
      },
      detail: {
        valueAnimation: true,
        formatter: '{value}%',
        color: 'auto',
        fontSize: 20
      },
      data: [{ value: percentage.toFixed(1) }]
    }]
  };

  return (
    <div style={{ background: '#1a1a1a', padding: '20px', borderRadius: '10px', margin: '10px' }}>
      <ReactECharts option={option} style={{ height: '300px' }} />
      <div style={{ color: '#ffffff', textAlign: 'center', marginTop: '10px' }}>
        Current: {currentData.length} people | Peak: {intelligence.peak_hours?.length || 0} hours
      </div>
    </div>
  );
};

// Professional Hourly Activity Chart with ECharts
export const HourlyActivityChart: React.FC<ChartProps> = ({ data, intelligence }) => {
  const hourlyData = Array.from({ length: 24 }, (_, hour) => {
    const count = data.filter(d => {
      if (!d.timestamp) return false;
      const h = new Date(d.timestamp).getHours();
      return !isNaN(h) && h === hour;
    }).length;
    return { hour, count };
  });

  const option = {
    title: {
      text: 'Hourly Activity Pattern',
      textStyle: { color: '#ffffff', fontSize: 18 }
    },
    backgroundColor: 'transparent',
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: hourlyData.map(d => `${d.hour}:00`),
      axisLabel: { color: '#ffffff' },
      axisLine: { lineStyle: { color: '#ffffff' } }
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#ffffff' },
      axisLine: { lineStyle: { color: '#ffffff' } },
      splitLine: { lineStyle: { color: '#333333' } }
    },
    series: [{
      data: hourlyData.map(d => ({
        value: d.count,
        itemStyle: {
          color: intelligence.peak_hours?.includes(d.hour) ? '#fd666d' : '#37a2da'
        }
      })),
      type: 'bar',
      itemStyle: {
        borderRadius: [4, 4, 0, 0]
      }
    }],
    tooltip: {
      trigger: 'axis',
      formatter: '{b}: {c} records'
    }
  };

  return (
    <div style={{ background: '#1a1a1a', padding: '20px', borderRadius: '10px', margin: '10px' }}>
      <ReactECharts option={option} style={{ height: '300px' }} />
    </div>
  );
};

// Professional Age Distribution Chart with ECharts
export const AgeDistributionChart: React.FC<ChartProps> = ({ data, intelligence }) => {
  const ageGroups = data.reduce((acc: Record<string, number>, d) => {
    if (d.age_estimate) {
      acc[d.age_estimate] = (acc[d.age_estimate] || 0) + 1;
    }
    return acc;
  }, {});

  const pieData = Object.entries(ageGroups).map(([age, count]) => ({
    value: count,
    name: age
  }));

  const option = {
    title: {
      text: 'Age Distribution',
      textStyle: { color: '#ffffff', fontSize: 18 }
    },
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      formatter: '{a} <br/>{b}: {c} ({d}%)'
    },
    legend: {
      orient: 'vertical',
      left: 'left',
      textStyle: { color: '#ffffff' }
    },
    series: [{
      name: 'Age Groups',
      type: 'pie',
      radius: '50%',
      data: pieData,
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowOffsetX: 0,
          shadowColor: 'rgba(0, 0, 0, 0.5)'
        }
      }
    }]
  };

  return (
    <div style={{ background: '#1a1a1a', padding: '20px', borderRadius: '10px', margin: '10px' }}>
      <ReactECharts option={option} style={{ height: '300px' }} />
    </div>
  );
};

// Professional Entry/Exit Flow Chart with ECharts
export const EntryExitChart: React.FC<ChartProps> = ({ data, intelligence }) => {
  const entryData = data.filter(d => d.event === 'entry');
  const exitData = data.filter(d => d.event === 'exit');
  
  const hourlyFlow = Array.from({ length: 24 }, (_, hour) => {
    const entries = entryData.filter(d => {
      if (!d.timestamp) return false;
      const h = new Date(d.timestamp).getHours();
      return !isNaN(h) && h === hour;
    }).length;
    
    const exits = exitData.filter(d => {
      if (!d.timestamp) return false;
      const h = new Date(d.timestamp).getHours();
      return !isNaN(h) && h === hour;
    }).length;
    
    return { hour, entries, exits };
  });

  const option = {
    title: {
      text: 'Entry/Exit Flow Pattern',
      textStyle: { color: '#ffffff', fontSize: 18 }
    },
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' }
    },
    legend: {
      data: ['Entries', 'Exits'],
      textStyle: { color: '#ffffff' }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: hourlyFlow.map(d => `${d.hour}:00`),
      axisLabel: { color: '#ffffff' },
      axisLine: { lineStyle: { color: '#ffffff' } }
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#ffffff' },
      axisLine: { lineStyle: { color: '#ffffff' } },
      splitLine: { lineStyle: { color: '#333333' } }
    },
    series: [
      {
        name: 'Entries',
        type: 'line',
        stack: 'Total',
        data: hourlyFlow.map(d => d.entries),
        itemStyle: { color: '#67e0e3' },
        areaStyle: { opacity: 0.6 }
      },
      {
        name: 'Exits',
        type: 'line',
        stack: 'Total',
        data: hourlyFlow.map(d => d.exits),
        itemStyle: { color: '#fd666d' },
        areaStyle: { opacity: 0.6 }
      }
    ]
  };

  return (
    <div style={{ background: '#1a1a1a', padding: '20px', borderRadius: '10px', margin: '10px' }}>
      <ReactECharts option={option} style={{ height: '300px' }} />
      <div style={{ color: '#ffffff', textAlign: 'center', marginTop: '10px' }}>
        Total Entries: {entryData.length} | Total Exits: {exitData.length}
      </div>
    </div>
  );
};