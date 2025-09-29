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
}

export interface VisitorSession {
  track_number: number;
  entryTime?: string;
  exitTime?: string;
  dwellTime?: number; // in minutes
}

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
export const calculateVisitorSessions = (data: ChartData[]): VisitorSession[] => {
  const sessions: Map<number, VisitorSession> = new Map();

  // Group events by track_number
  data.forEach(item => {
    const trackNumber = item.track_number;
    
    if (!sessions.has(trackNumber)) {
      sessions.set(trackNumber, { track_number: trackNumber });
    }
    
    const session = sessions.get(trackNumber)!;
    
    if (item.event === 'entry') {
      if (!session.entryTime || new Date(item.timestamp) < new Date(session.entryTime)) {
        session.entryTime = item.timestamp;
      }
    } else if (item.event === 'exit') {
      if (!session.exitTime || new Date(item.timestamp) > new Date(session.exitTime)) {
        session.exitTime = item.timestamp;
      }
    }
  });

  // Calculate dwell times for sessions with both entry and exit
  const sessionsArray = Array.from(sessions.values());
  
  sessionsArray.forEach(session => {
    if (session.entryTime && session.exitTime) {
      const entryDate = new Date(session.entryTime);
      const exitDate = new Date(session.exitTime);
      const dwellTimeMs = exitDate.getTime() - entryDate.getTime();
      session.dwellTime = dwellTimeMs / (1000 * 60); // Convert to minutes
    }
  });

  return sessionsArray;
};

// Calculate average dwell time using the formula: Σ(Exit Time - Entry Time) / n
export const calculateAverageDwellTime = (data: ChartData[]): number => {
  const sessions = calculateVisitorSessions(data);
  
  // Filter sessions that have both entry and exit times
  const completeSessions = sessions.filter(session => 
    session.entryTime && session.exitTime && session.dwellTime !== undefined
  );

  if (completeSessions.length === 0) {
    return 0;
  }

  // Sum all dwell times and divide by number of complete sessions
  const totalDwellTime = completeSessions.reduce((sum, session) => sum + (session.dwellTime || 0), 0);
  return totalDwellTime / completeSessions.length;
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
export const calculateDwellTimeDistribution = (data: ChartData[]): { range: string, count: number }[] => {
  const sessions = calculateVisitorSessions(data);
  const completeSessions = sessions.filter(session => session.dwellTime !== undefined);
  
  const ranges = [
    { min: 0, max: 5, label: '0-5 min' },
    { min: 5, max: 15, label: '5-15 min' },
    { min: 15, max: 30, label: '15-30 min' },
    { min: 30, max: 60, label: '30-60 min' },
    { min: 60, max: Infinity, label: '60+ min' }
  ];
  
  return ranges.map(range => ({
    range: range.label,
    count: completeSessions.filter(session => 
      session.dwellTime! >= range.min && session.dwellTime! < range.max
    ).length
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