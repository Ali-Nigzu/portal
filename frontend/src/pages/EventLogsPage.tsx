import React, { useState, useEffect, useCallback } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
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

interface EventLogsPageProps {
  credentials: { username: string; password: string };
}

const EventLogsPage: React.FC<EventLogsPageProps> = ({ credentials }) => {
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState({
    event: '',
    sex: '',
    age: '',
    trackId: ''
  });
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const eventsPerPage = 20;

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      
      const auth = btoa(`${credentials.username}:${credentials.password}`);
      
      const response = await fetch(API_ENDPOINTS.CHART_DATA, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      setEvents(result.data || []);
      setError(null);
    } catch (err) {
      setError(`Failed to fetch events: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [credentials.username, credentials.password]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const parseEventDate = (timestamp: string): Date | null => {
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        return null;
      }
      return date;
    } catch {
      return null;
    }
  };

  const isSameDay = (date1: Date, date2: Date): boolean => {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  };

  const isDateInRange = (eventDate: Date, start: Date | null, end: Date | null): boolean => {
    if (!start && !end) return true;
    
    const eventDateOnly = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
    
    if (start && end) {
      const startDateOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const endDateOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      
      if (isSameDay(startDateOnly, endDateOnly)) {
        return isSameDay(eventDateOnly, startDateOnly);
      }
      
      return eventDateOnly >= startDateOnly && eventDateOnly <= endDateOnly;
    }
    
    if (start) {
      const startDateOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      return eventDateOnly >= startDateOnly;
    }
    
    if (end) {
      const endDateOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      return eventDateOnly <= endDateOnly;
    }
    
    return true;
  };

  const filteredEvents = events.filter(event => {
    const eventDate = parseEventDate(event.timestamp);
    
    const dateInRange = eventDate ? isDateInRange(eventDate, startDate, endDate) : true;
    
    const trackIdMatch = !filter.trackId || 
      event.track_number.toString().includes(filter.trackId);
    
    return (
      (!filter.event || event.event.toLowerCase().includes(filter.event.toLowerCase())) &&
      (!filter.sex || event.sex === filter.sex) &&
      (!filter.age || event.age_estimate === filter.age) &&
      dateInRange &&
      trackIdMatch
    );
  });

  const totalPages = Math.ceil(filteredEvents.length / eventsPerPage);
  const startIndex = (currentPage - 1) * eventsPerPage;
  const endIndex = startIndex + eventsPerPage;
  const currentEvents = filteredEvents.slice(startIndex, endIndex);

  const uniqueAges = Array.from(new Set(events.map(e => e.age_estimate))).filter(Boolean);

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        return timestamp;
      }
      return date.toLocaleString();
    } catch {
      return timestamp;
    }
  };

  const getEventIcon = (event: string) => {
    switch (event.toLowerCase()) {
      case 'entry': return '';
      case 'exit': return '';
      default: return '';
    }
  };

  const getEventStatus = (event: string) => {
    switch (event.toLowerCase()) {
      case 'entry': return 'vrm-status-online';
      case 'exit': return 'vrm-status-warning';
      default: return 'vrm-status-offline';
    }
  };

  const clearAllFilters = () => {
    setFilter({ event: '', sex: '', age: '', trackId: '' });
    setStartDate(null);
    setEndDate(null);
    setCurrentPage(1);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            width: '40px', 
            height: '40px', 
            border: '4px solid #333', 
            borderTop: '4px solid #1976d2', 
            borderRadius: '50%', 
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }}></div>
          <p style={{ color: 'var(--vrm-text-secondary)' }}>Loading event logs...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="vrm-card">
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">Connection Error</h3>
        </div>
        <div className="vrm-card-body">
          <p style={{ color: 'var(--vrm-accent-red)', marginBottom: '16px' }}>{error}</p>
          <button className="vrm-btn" onClick={fetchEvents}>Retry Connection</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Page Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ color: 'var(--vrm-text-primary)', fontSize: '24px', fontWeight: '600', marginBottom: '8px' }}>
          Event logs
        </h1>
        <div className="vrm-breadcrumb">
          <span>Dashboard</span>
          <span>›</span>
          <span>Event logs</span>
        </div>
      </div>

      {/* Filters */}
      <div className="vrm-card" style={{ marginBottom: '24px' }}>
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">Filters</h3>
          <div className="vrm-card-actions">
            <button 
              className="vrm-btn vrm-btn-secondary vrm-btn-sm"
              onClick={clearAllFilters}
            >
              Clear All
            </button>
          </div>
        </div>
        <div className="vrm-card-body">
          {/* First Row: Date Pickers, Track ID, Event Type */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
            gap: '16px',
            marginBottom: '16px'
          }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>
                Start Date
              </label>
              <DatePicker
                selected={startDate}
                onChange={(date: Date | null) => setStartDate(date)}
                placeholderText="Select start date"
                dateFormat="yyyy-MM-dd"
                className="vrm-date-picker"
                maxDate={endDate || undefined}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '6px', color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>
                End Date
              </label>
              <DatePicker
                selected={endDate}
                onChange={(date: Date | null) => setEndDate(date)}
                placeholderText="Select end date"
                dateFormat="yyyy-MM-dd"
                className="vrm-date-picker"
                minDate={startDate || undefined}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '6px', color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>
                Track ID
              </label>
              <input 
                type="text"
                value={filter.trackId}
                onChange={(e) => setFilter(prev => ({ ...prev, trackId: e.target.value }))}
                placeholder="Search by track number"
                style={{ 
                  width: '100%', 
                  padding: '8px 12px', 
                  backgroundColor: 'var(--vrm-bg-tertiary)', 
                  border: '1px solid var(--vrm-border)', 
                  borderRadius: '6px', 
                  color: 'var(--vrm-text-primary)'
                }}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '6px', color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>
                Event Type
              </label>
              <select 
                value={filter.event}
                onChange={(e) => setFilter(prev => ({ ...prev, event: e.target.value }))}
                style={{ 
                  width: '100%', 
                  padding: '8px 12px', 
                  backgroundColor: 'var(--vrm-bg-tertiary)', 
                  border: '1px solid var(--vrm-border)', 
                  borderRadius: '6px', 
                  color: 'var(--vrm-text-primary)'
                }}
              >
                <option value="">All Events</option>
                <option value="entry">Entry</option>
                <option value="exit">Exit</option>
              </select>
            </div>
          </div>

          {/* Second Row: Gender, Age Group */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
            gap: '16px'
          }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>
                Gender
              </label>
              <select 
                value={filter.sex}
                onChange={(e) => setFilter(prev => ({ ...prev, sex: e.target.value }))}
                style={{ 
                  width: '100%', 
                  padding: '8px 12px', 
                  backgroundColor: 'var(--vrm-bg-tertiary)', 
                  border: '1px solid var(--vrm-border)', 
                  borderRadius: '6px', 
                  color: 'var(--vrm-text-primary)'
                }}
              >
                <option value="">All Genders</option>
                <option value="M">Male</option>
                <option value="F">Female</option>
              </select>
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '6px', color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>
                Age Group
              </label>
              <select 
                value={filter.age}
                onChange={(e) => setFilter(prev => ({ ...prev, age: e.target.value }))}
                style={{ 
                  width: '100%', 
                  padding: '8px 12px', 
                  backgroundColor: 'var(--vrm-bg-tertiary)', 
                  border: '1px solid var(--vrm-border)', 
                  borderRadius: '6px', 
                  color: 'var(--vrm-text-primary)'
                }}
              >
                <option value="">All Ages</option>
                {uniqueAges.map(age => (
                  <option key={age} value={age}>{age}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Events Table */}
      <div className="vrm-card">
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">
            Activity Events ({filteredEvents.length.toLocaleString()} of {events.length.toLocaleString()} total)
          </h3>
          <div className="vrm-card-actions">
            <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">Export CSV</button>
            <button className="vrm-btn vrm-btn-sm" onClick={fetchEvents}>Refresh</button>
          </div>
        </div>
        <div className="vrm-card-body" style={{ padding: 0 }}>
          {currentEvents.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="vrm-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Track ID</th>
                    <th>Timestamp</th>
                    <th>Demographics</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {currentEvents.map((event, index) => (
                    <tr key={`${event.index}-${index}`}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>{getEventIcon(event.event)}</span>
                          <span style={{ textTransform: 'capitalize' }}>{event.event}</span>
                        </div>
                      </td>
                      <td>
                        <code style={{ 
                          backgroundColor: 'var(--vrm-bg-tertiary)', 
                          padding: '2px 6px', 
                          borderRadius: '3px',
                          fontSize: '12px'
                        }}>
                          #{event.track_number}
                        </code>
                      </td>
                      <td>{formatTimestamp(event.timestamp)}</td>
                      <td>
                        <div style={{ fontSize: '13px' }}>
                          <div>{event.sex === 'M' ? '👨' : '👩'} {event.sex === 'M' ? 'Male' : 'Female'}</div>
                          <div style={{ color: 'var(--vrm-text-muted)', marginTop: '2px' }}>
                            Age: {event.age_estimate}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className={`vrm-status ${getEventStatus(event.event)}`}>
                          <div className="vrm-status-dot"></div>
                          {event.event === 'entry' ? 'Entered' : event.event === 'exit' ? 'Exited' : 'Unknown'}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--vrm-text-secondary)' }}>
              No events found matching current filters
            </div>
          )}
        </div>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="vrm-card-body" style={{ borderTop: '1px solid var(--vrm-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
              <div style={{ color: 'var(--vrm-text-secondary)', fontSize: '14px' }}>
                Showing {startIndex + 1} to {Math.min(endIndex, filteredEvents.length)} of {filteredEvents.length} events
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  className="vrm-btn vrm-btn-secondary vrm-btn-sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </button>
                <span style={{ 
                  padding: '6px 12px', 
                  backgroundColor: 'var(--vrm-bg-tertiary)', 
                  borderRadius: '6px',
                  fontSize: '14px'
                }}>
                  Page {currentPage} of {totalPages}
                </span>
                <button 
                  className="vrm-btn vrm-btn-secondary vrm-btn-sm"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .vrm-date-picker {
          width: 100%;
          padding: 8px 12px;
          background-color: var(--vrm-bg-tertiary);
          border: 1px solid var(--vrm-border);
          border-radius: 6px;
          color: var(--vrm-text-primary);
          font-size: 14px;
        }

        .vrm-date-picker:focus {
          outline: none;
          border-color: var(--vrm-accent-blue);
        }

        .react-datepicker-wrapper {
          width: 100%;
        }

        .react-datepicker__input-container {
          width: 100%;
        }

        .react-datepicker {
          background-color: var(--vrm-bg-secondary);
          border: 1px solid var(--vrm-border);
          border-radius: 8px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
        }

        .react-datepicker__header {
          background-color: var(--vrm-bg-tertiary);
          border-bottom: 1px solid var(--vrm-border);
          border-radius: 8px 8px 0 0;
        }

        .react-datepicker__current-month,
        .react-datepicker__day-name {
          color: var(--vrm-text-primary);
        }

        .react-datepicker__day {
          color: var(--vrm-text-secondary);
        }

        .react-datepicker__day:hover {
          background-color: var(--vrm-hover);
          color: var(--vrm-text-primary);
        }

        .react-datepicker__day--selected,
        .react-datepicker__day--keyboard-selected {
          background-color: var(--vrm-accent-blue);
          color: white;
        }

        .react-datepicker__day--disabled {
          color: var(--vrm-text-muted);
          opacity: 0.5;
        }

        .react-datepicker__navigation-icon::before {
          border-color: var(--vrm-text-secondary);
        }

        .react-datepicker__navigation:hover .react-datepicker__navigation-icon::before {
          border-color: var(--vrm-text-primary);
        }

        .react-datepicker__day--in-range,
        .react-datepicker__day--in-selecting-range {
          background-color: rgba(25, 118, 210, 0.2);
          color: var(--vrm-text-primary);
        }

        .react-datepicker__day--range-start,
        .react-datepicker__day--range-end {
          background-color: var(--vrm-accent-blue);
          color: white;
        }

        .react-datepicker__triangle {
          display: none;
        }

        .react-datepicker-popper {
          z-index: 1000;
        }
      `}</style>
    </div>
  );
};

export default EventLogsPage;
