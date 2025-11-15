import React, { useState, useEffect, useCallback } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { API_ENDPOINTS } from '../config';
import { Credentials } from '../types/credentials';

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
  credentials: Credentials;
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
  const [totalPages, setTotalPages] = useState(1);
  const [totalEvents, setTotalEvents] = useState(0);
  const eventsPerPage = 20;

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      
      const urlParams = new URLSearchParams(window.location.search);
      const viewToken = urlParams.get('view_token');
      const clientId = urlParams.get('client_id');
      
      // Build search query parameters
      const searchParams = new URLSearchParams();
      searchParams.append('page', currentPage.toString());
      searchParams.append('per_page', eventsPerPage.toString());
      
      if (startDate) {
        searchParams.append('start_date', startDate.toISOString().split('T')[0]);
      }
      if (endDate) {
        searchParams.append('end_date', endDate.toISOString().split('T')[0]);
      }
      if (filter.event) {
        searchParams.append('event_type', filter.event);
      }
      if (filter.sex) {
        searchParams.append('sex', filter.sex);
      }
      if (filter.age) {
        searchParams.append('age', filter.age);
      }
      if (filter.trackId) {
        searchParams.append('track_id', filter.trackId);
      }
      
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      
      let apiUrl = `${API_ENDPOINTS.SEARCH_EVENTS}?${searchParams.toString()}`;
      
      if (viewToken) {
        apiUrl += `&view_token=${encodeURIComponent(viewToken)}`;
      } else {
        const auth = btoa(`${credentials.username}:${credentials.password}`);
        headers['Authorization'] = `Basic ${auth}`;
        
        if (clientId) {
          apiUrl += `&client_id=${encodeURIComponent(clientId)}`;
        }
      }
      
      const response = await fetch(apiUrl, { headers });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      setEvents(result.events || []);
      setTotalPages(result.total_pages || 1);
      setTotalEvents(result.total || 0);
      setError(null);
    } catch (err) {
      setError(`Failed to fetch events: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [credentials.username, credentials.password, currentPage, startDate, endDate, filter]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleSearch = () => {
    setCurrentPage(1);
  };

  // Server-side filtering and pagination - no client-side filtering needed
  const uniqueAges = ['0-4', '5-13', '14-25', '26-45', '46-65', '66+'];

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
      <div className="vrm-loading-state">
        <div className="vrm-loading-state-content">
          <div className="vrm-loading-spinner" />
          <p>Loading event logs…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="vrm-card vrm-card--spaced">
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">Connection Error</h3>
        </div>
        <div className="vrm-card-body">
          <p style={{ color: 'var(--vrm-accent-red)', marginBottom: 'var(--vrm-spacing-4)' }}>{error}</p>
          <button className="vrm-btn" onClick={fetchEvents}>Retry Connection</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Page Header */}
      <div className="vrm-page-header">
        <h1 className="vrm-page-title">
          Event logs
        </h1>
        <div className="vrm-breadcrumb">
          <span>Dashboard</span>
          <span>›</span>
          <span>Event logs</span>
        </div>
      </div>

      {/* Filters */}
      <div className="vrm-card vrm-card--spaced">
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">Filters</h3>
          <div className="vrm-card-actions">
            <button
              className="vrm-btn vrm-btn-secondary vrm-btn-sm"
              onClick={clearAllFilters}
            >
              Clear All
            </button>
            <button
              className="vrm-btn vrm-btn-primary vrm-btn-sm"
              onClick={handleSearch}
            >
              🔍 Search
            </button>
          </div>
        </div>
        <div className="vrm-card-body">
          {/* First Row: Date Pickers, Track ID, Event Type */}
          <div className="vrm-filter-grid">
            <div>
              <label className="vrm-label" htmlFor="event-start-date">
                Start Date
              </label>
              <DatePicker
                selected={startDate}
                onChange={(date: Date | null) => setStartDate(date)}
                placeholderText="Select start date"
                dateFormat="yyyy-MM-dd"
                className="vrm-date-picker"
                maxDate={endDate || undefined}
                id="event-start-date"
              />
            </div>

            <div>
              <label className="vrm-label" htmlFor="event-end-date">
                End Date
              </label>
              <DatePicker
                selected={endDate}
                onChange={(date: Date | null) => setEndDate(date)}
                placeholderText="Select end date"
                dateFormat="yyyy-MM-dd"
                className="vrm-date-picker"
                minDate={startDate || undefined}
                id="event-end-date"
              />
            </div>

            <div>
              <label className="vrm-label" htmlFor="event-track-id">
                Track ID
              </label>
              <input
                id="event-track-id"
                type="text"
                value={filter.trackId}
                onChange={(e) => setFilter(prev => ({ ...prev, trackId: e.target.value }))}
                placeholder="Search by track number"
                className="vrm-input"
              />
            </div>

            <div>
              <label className="vrm-label" htmlFor="event-type">
                Event Type
              </label>
              <select
                id="event-type"
                value={filter.event}
                onChange={(e) => setFilter(prev => ({ ...prev, event: e.target.value }))}
                className="vrm-select"
              >
                <option value="">All Events</option>
                <option value="entry">Entry</option>
                <option value="exit">Exit</option>
              </select>
            </div>
          </div>

          {/* Second Row: Gender, Age Group */}
          <div className="vrm-filter-grid">
            <div>
              <label className="vrm-label" htmlFor="event-gender">
                Gender
              </label>
              <select
                id="event-gender"
                value={filter.sex}
                onChange={(e) => setFilter(prev => ({ ...prev, sex: e.target.value }))}
                className="vrm-select"
              >
                <option value="">All Genders</option>
                <option value="M">Male</option>
                <option value="F">Female</option>
              </select>
            </div>

            <div>
              <label className="vrm-label" htmlFor="event-age-group">
                Age Group
              </label>
              <select
                id="event-age-group"
                value={filter.age}
                onChange={(e) => setFilter(prev => ({ ...prev, age: e.target.value }))}
                className="vrm-select"
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
            Activity Events ({totalEvents.toLocaleString()} total)
          </h3>
          <div className="vrm-card-actions">
            <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">Export CSV</button>
            <button className="vrm-btn vrm-btn-sm" onClick={fetchEvents}>Refresh</button>
          </div>
        </div>
        <div className="vrm-card-body vrm-card-body--flush">
          {events.length > 0 ? (
            <div className="vrm-table-scroll">
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
                  {events.map((event, index) => (
                    <tr key={`${event.index}-${index}`}>
                      <td>
                        <div className="vrm-inline">
                          <span>{getEventIcon(event.event)}</span>
                          <span style={{ textTransform: 'capitalize' }}>{event.event}</span>
                        </div>
                      </td>
                      <td>
                        <code className="vrm-code-badge">#{event.track_number}</code>
                      </td>
                      <td>{formatTimestamp(event.timestamp)}</td>
                      <td>
                        <div style={{ fontSize: 'var(--vrm-typography-font-size-body)' }}>
                          <div>{event.sex === 'M' ? 'Male' : 'Female'}</div>
                          <div style={{ color: 'var(--vrm-text-muted)', marginTop: 'var(--vrm-spacing-1)' }}>
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
            <div style={{ textAlign: 'center', padding: 'var(--vrm-spacing-8)', color: 'var(--vrm-text-secondary)' }}>
              No events found matching current filters
            </div>
          )}
        </div>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="vrm-card-body" style={{ borderTop: 'var(--vrm-borderWidth-thin) solid var(--vrm-border)' }}>
            <div className="vrm-pagination">
              <div className="vrm-pagination-info">
                Showing {((currentPage - 1) * eventsPerPage) + 1} to {Math.min(currentPage * eventsPerPage, totalEvents)} of {totalEvents.toLocaleString()} events
              </div>
              <div className="vrm-pagination-controls">
                <button
                  className="vrm-btn vrm-btn-secondary vrm-btn-sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </button>
                <span className="vrm-pagination-badge">
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

      
    </div>
  );
};

export default EventLogsPage;
