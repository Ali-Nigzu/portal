import { TimeFilterValue } from '../components/TimeFilterDropdown';

export interface ChartData {
  index: number;
  track_number: number;
  event: string;
  timestamp: string;
  sex: string;
  age_estimate: string;
  hour: number;
  day_of_week: string;
  date: string;
  camera_id?: string | number;
  camera_name?: string;
  site_id?: string | number;
  site_name?: string;
}

export interface VisitorSession {
  track_number: number;
  entryTime?: string;
  exitTime?: string;
  dwellTime?: number; // in minutes
}

export const MAX_SESSION_WINDOW_MINUTES = 6 * 60;

// Filter data based on time selection
export const filterDataByTime = (data: ChartData[], timeFilter: TimeFilterValue): ChartData[] => {
  if (timeFilter.option === 'alltime') {
    return data;
  }

  const now = new Date();
  let startDate: Date;
  let endDate: Date = now;

  switch (timeFilter.option) {
    case 'last24h':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case 'last7days':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'last30days':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'custom':
      if (timeFilter.startDate && timeFilter.endDate) {
        startDate = new Date(timeFilter.startDate);
        endDate = new Date(timeFilter.endDate + 'T23:59:59');
      } else {
        return data; // fallback to all data if custom dates not properly set
      }
      break;
    default:
      return data;
  }

  return data.filter(item => {
    const itemDate = new Date(item.timestamp);
    return itemDate >= startDate && itemDate <= endDate;
  });
};

// Calculate visitor sessions with dwell times
export const calculateDwellDurations = (data: ChartData[]): number[] => {
  const sorted = [...data].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const activeEntries = new Map<number, Date>();
  const dwells: number[] = [];

  sorted.forEach(item => {
    const eventTime = new Date(item.timestamp);
    if (Number.isNaN(eventTime.getTime())) {
      return;
    }

    if (item.event === 'entry') {
      activeEntries.set(item.track_number, eventTime);
      return;
    }

    if (item.event === 'exit') {
      const entry = activeEntries.get(item.track_number);
      if (entry) {
        const dwellMinutes = (eventTime.getTime() - entry.getTime()) / (1000 * 60);
        if (dwellMinutes >= 0 && dwellMinutes <= MAX_SESSION_WINDOW_MINUTES) {
          dwells.push(dwellMinutes);
        }
        activeEntries.delete(item.track_number);
      }
    }
  });

  return dwells;
};

// Calculate average dwell time using the formula: Σ(Exit Time - Entry Time) / n
export const calculateAverageDwellTime = (data: ChartData[]): number => {
  const durations = calculateDwellDurations(data);
  if (!durations.length) {
    return 0;
  }
  const totalDwellTime = durations.reduce((sum, value) => sum + value, 0);
  return totalDwellTime / durations.length;
};

// Calculate current occupancy (live count)
export const calculateCurrentOccupancy = (data: ChartData[]): number => {
  const entriesCount = data.filter(d => d.event === 'entry').length;
  const exitsCount = data.filter(d => d.event === 'exit').length;
  return Math.max(0, entriesCount - exitsCount);
};

// Calculate occupancy over time for time series data
export const calculateOccupancyTimeSeries = (data: ChartData[]): { timestamp: string, occupancy: number }[] => {
  // Sort data by timestamp
  const sortedData = [...data].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  const occupancyData: { timestamp: string, occupancy: number }[] = [];
  let currentOccupancy = 0;
  
  sortedData.forEach(item => {
    if (item.event === 'entry') {
      currentOccupancy++;
    } else if (item.event === 'exit') {
      currentOccupancy = Math.max(0, currentOccupancy - 1);
    }
    
    occupancyData.push({
      timestamp: item.timestamp,
      occupancy: currentOccupancy
    });
  });
  
  return occupancyData;
};

// Calculate dwell time distribution for analytics
export const calculateDwellTimeDistribution = (
  data: ChartData[],
): { range: string; count: number }[] => {
  const durations = calculateDwellDurations(data);
  const ranges = [
    { min: 0, max: 5, label: '0-5' },
    { min: 5, max: 10, label: '5-10' },
    { min: 10, max: 15, label: '10-15' },
    { min: 15, max: 20, label: '15-20' },
    { min: 20, max: 30, label: '20-30' },
    { min: 30, max: 45, label: '30-45' },
    { min: 45, max: 60, label: '45-60' },
    { min: 60, max: Infinity, label: '60+' },
  ];

  return ranges.map(range => ({
    range: range.label,
    count: durations.filter(duration => duration >= range.min && duration < range.max).length,
  }));
};

// Format time duration for display
export const formatDuration = (minutes: number): string => {
  if (minutes < 60) {
    return `${Math.round(minutes)}m`;
  } else {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = Math.round(minutes % 60);
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
};

const AGE_BANDS = [
  { min: 0, max: 4, label: '0-4' },
  { min: 5, max: 13, label: '5-13' },
  { min: 14, max: 25, label: '14-25' },
  { min: 26, max: 45, label: '26-45' },
  { min: 46, max: 65, label: '46-65' },
  { min: 66, max: Infinity, label: '66+' },
];

const extractAgeFromEstimate = (estimate?: string): number | null => {
  if (!estimate) {
    return null;
  }
  const matches = estimate.match(/\d+/g);
  if (!matches || !matches.length) {
    return null;
  }
  const numeric = Number.parseInt(matches[0], 10);
  return Number.isFinite(numeric) ? numeric : null;
};

export const getAgeBand = (estimate?: string): string | null => {
  const age = extractAgeFromEstimate(estimate);
  if (age == null) {
    return null;
  }
  const band = AGE_BANDS.find(range => age >= range.min && age <= range.max);
  return band ? band.label : null;
};