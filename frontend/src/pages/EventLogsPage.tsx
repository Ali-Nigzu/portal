import React, { useState, useEffect, useCallback } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { API_ENDPOINTS } from '../config';
import { Credentials } from '../types/credentials';

interface EventData {
  index: number;
  track_number: string;
  event: string;
  timestamp: string;
  sex: string | number | null;
  age_estimate: string | number | null;
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
  const [draftFilters, setDraftFilters] = useState({
    event: '',
    sex: '',
    age: '',
    trackId: '',
    race: '',
    cameraId: ''
  });
  const [appliedFilters, setAppliedFilters] = useState({
    event: '',
    sex: '',
    age: '',
    trackId: '',
    race: '',
    cameraId: ''
  });
  const [draftStartDate, setDraftStartDate] = useState<Date | null>(null);
  const [draftEndDate, setDraftEndDate] = useState<Date | null>(null);
  const [appliedStartDate, setAppliedStartDate] = useState<Date | null>(null);
  const [appliedEndDate, setAppliedEndDate] = useState<Date | null>(null);
  const [searchToken, setSearchToken] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalEvents, setTotalEvents] = useState(0);
  const eventsPerPage = 20;
  const ageBuckets = [
    { value: '0-4', label: '0-4' },
    { value: '5-13', label: '5-13' },
    { value: '14-25', label: '14-25' },
    { value: '26-45', label: '26-45' },
    { value: '46-65', label: '46-65' },
    { value: '66+', label: '66+' },
  ];
  const raceOptions = [
    { value: '0', label: 'Light' },
    { value: '1', label: 'Mix' },
    { value: '2', label: 'Dark' },
  ];
  const sexOptions = [
    { value: 'M', label: 'Male' },
    { value: 'F', label: 'Female' },
  ];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const clampToToday = (date: Date | null): Date | null => {
    if (!date) {
      return null;
    }
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next.getTime() > today.getTime() ? new Date(today) : next;
  };

  const sanitizeTrackId = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }
    return trimmed.startsWith('#') ? trimmed.slice(1).trim() : trimmed;
  };

  const buildSearchParams = useCallback((includePagination: boolean): URLSearchParams => {
    const searchParams = new URLSearchParams();
    if (includePagination) {
      searchParams.append('page', currentPage.toString());
      searchParams.append('per_page', eventsPerPage.toString());
    }

    if (appliedStartDate) {
      searchParams.append('start_date', appliedStartDate.toISOString().split('T')[0]);
    }
    if (appliedEndDate) {
      searchParams.append('end_date', appliedEndDate.toISOString().split('T')[0]);
    }
    if (appliedFilters.event) {
      searchParams.append('event', appliedFilters.event);
    }
    if (appliedFilters.sex) {
      searchParams.append('sex', appliedFilters.sex);
    }
    if (appliedFilters.age) {
      searchParams.append('age', appliedFilters.age);
    }
    const sanitizedTrackId = sanitizeTrackId(appliedFilters.trackId);
    if (sanitizedTrackId) {
      searchParams.append('track_id', sanitizedTrackId);
    }
    if (appliedFilters.race) {
      searchParams.append('race', appliedFilters.race);
    }
    if (appliedFilters.cameraId) {
      searchParams.append('camera_id', appliedFilters.cameraId);
    }

    return searchParams;
  }, [appliedEndDate, appliedFilters, appliedStartDate, currentPage, eventsPerPage]);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      
      const urlParams = new URLSearchParams(window.location.search);
      const viewToken = urlParams.get('view_token');
      const clientId = urlParams.get('client_id');
      
      const searchParams = buildSearchParams(true);
      
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
  }, [buildSearchParams, credentials.password, credentials.username]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents, searchToken]);

  const handleSearch = () => {
    setAppliedFilters({ ...draftFilters });
    setAppliedStartDate(clampToToday(draftStartDate));
    setAppliedEndDate(clampToToday(draftEndDate));
    setCurrentPage(1);
    setSearchToken((prev) => prev + 1);
  };

  const handleTrackIdKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleSearch();
    }
  };

  const formatSex = (value: EventData['sex']) => {
    if (value === null || value === undefined) {
      return 'Unknown';
    }
    const normalized = value.toString().toLowerCase();
    if (normalized === '0' || normalized === 'm' || normalized === 'male') {
      return 'Male';
    }
    if (normalized === '1' || normalized === 'f' || normalized === 'female') {
      return 'Female';
    }
    return 'Unknown';
  };

  const formatAgeBucket = (value: EventData['age_estimate']) => {
    if (value === null || value === undefined) {
      return 'Unknown';
    }
    const raw = value.toString();
    const mapped = ageBuckets.find((bucket) => bucket.value === raw);
    if (mapped) {
      return mapped.label;
    }
    const numeric = parseInt(raw, 10);
    if (!Number.isNaN(numeric) && ageBuckets[numeric]) {
      return ageBuckets[numeric].label;
    }
    return raw;
  };

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
    setDraftFilters({
      event: '',
      sex: '',
      age: '',
      trackId: '',
      race: '',
      cameraId: ''
    });
    setAppliedFilters({
      event: '',
      sex: '',
      age: '',
      trackId: '',
      race: '',
      cameraId: ''
    });
    setDraftStartDate(null);
    setDraftEndDate(null);
    setAppliedStartDate(null);
    setAppliedEndDate(null);
    setCurrentPage(1);
    setSearchToken((prev) => prev + 1);
  };

  const handleExport = async () => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const viewToken = urlParams.get('view_token');
      const clientId = urlParams.get('client_id');
      const searchParams = buildSearchParams(false);
      let apiUrl = `${API_ENDPOINTS.SEARCH_EVENTS}?${searchParams.toString()}`;

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
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
      const exportEvents = result.events || [];
      if (!Array.isArray(exportEvents) || exportEvents.length === 0) {
        throw new Error('No events available for export.');
      }

      const columns: Array<keyof EventData> = [
        'index',
        'track_number',
        'event',
        'timestamp',
        'sex',
        'age_estimate',
        'hour',
        'day_of_week',
        'date',
      ];
      const escapeCsv = (value: unknown) => {
        if (value === null || value === undefined) {
          return '';
        }
        const text = String(value);
        if (/[",\n]/.test(text)) {
          return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
      };
      const csvRows = [
        columns.join(','),
        ...exportEvents.map((event: EventData) =>
          columns.map((column) => escapeCsv(event[column])).join(','),
        ),
      ];
      const csvBlob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(csvBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'event-logs.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(`Failed to export events: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
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
    <div className="event-logs-page">
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
      <div className="vrm-card vrm-card--spaced event-logs-filters-card">
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
        <div className="vrm-card-body event-logs-filters-body">
          <div className="event-logs-filter-grid">
            <div className="event-logs-filter-field">
              <label className="vrm-label" htmlFor="event-start-date">
                Start Date
              </label>
              <DatePicker
                selected={draftStartDate}
                onChange={(date: Date | null) => setDraftStartDate(clampToToday(date))}
                placeholderText="Select start date"
                dateFormat="yyyy-MM-dd"
                className="vrm-date-picker event-logs-filter-control"
                maxDate={draftEndDate || today}
                id="event-start-date"
              />
            </div>

            <div className="event-logs-filter-field">
              <label className="vrm-label" htmlFor="event-end-date">
                End Date
              </label>
              <DatePicker
                selected={draftEndDate}
                onChange={(date: Date | null) => setDraftEndDate(clampToToday(date))}
                placeholderText="Select end date"
                dateFormat="yyyy-MM-dd"
                className="vrm-date-picker event-logs-filter-control"
                minDate={draftStartDate || undefined}
                maxDate={today}
                id="event-end-date"
              />
            </div>

            <div className="event-logs-filter-field">
              <label className="vrm-label" htmlFor="event-track-id">
                Track ID
              </label>
              <input
                id="event-track-id"
                type="text"
                value={draftFilters.trackId}
                onChange={(e) => setDraftFilters(prev => ({ ...prev, trackId: e.target.value }))}
                onKeyDown={handleTrackIdKeyDown}
                placeholder="Search by track ID"
                className="vrm-input event-logs-filter-control"
              />
            </div>

            <div className="event-logs-filter-field">
              <label className="vrm-label" htmlFor="event-type">
                Event Type
              </label>
              <select
                id="event-type"
                value={draftFilters.event}
                onChange={(e) => setDraftFilters(prev => ({ ...prev, event: e.target.value }))}
                className="vrm-select event-logs-filter-control"
              >
                <option value="">All Events</option>
                <option value="entry">Entry</option>
                <option value="exit">Exit</option>
              </select>
            </div>

            <div className="event-logs-filter-field">
              <label className="vrm-label" htmlFor="event-sex">
                Sex
              </label>
              <select
                id="event-sex"
                value={draftFilters.sex}
                onChange={(e) => setDraftFilters(prev => ({ ...prev, sex: e.target.value }))}
                className="vrm-select event-logs-filter-control"
              >
                <option value="">All Sexes</option>
                {sexOptions.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div className="event-logs-filter-field">
              <label className="vrm-label" htmlFor="event-age-group">
                Age Group
              </label>
              <select
                id="event-age-group"
                value={draftFilters.age}
                onChange={(e) => setDraftFilters(prev => ({ ...prev, age: e.target.value }))}
                className="vrm-select event-logs-filter-control"
              >
                <option value="">All Ages</option>
                {ageBuckets.map(age => (
                  <option key={age.value} value={age.value}>{age.label}</option>
                ))}
              </select>
            </div>

            <div className="event-logs-filter-field">
              <label className="vrm-label" htmlFor="event-race">
                Race
              </label>
              <select
                id="event-race"
                value={draftFilters.race}
                onChange={(e) => setDraftFilters(prev => ({ ...prev, race: e.target.value }))}
                className="vrm-select event-logs-filter-control"
              >
                <option value="">All Races</option>
                {raceOptions.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div className="event-logs-filter-field">
              <label className="vrm-label" htmlFor="event-camera-id">
                Camera ID
              </label>
              <input
                id="event-camera-id"
                type="number"
                value={draftFilters.cameraId}
                onChange={(e) => setDraftFilters(prev => ({ ...prev, cameraId: e.target.value }))}
                placeholder="Filter by camera ID"
                className="vrm-input event-logs-filter-control"
                min="0"
              />
            </div>
          </div>

        </div>
      </div>

      {/* Events Table */}
      <div className="vrm-card">
        <div className="vrm-card-header event-logs-table-header">
          <h3 className="vrm-card-title">
            Activity Events ({totalEvents.toLocaleString()} total)
          </h3>
          <div className="vrm-card-actions">
            <button className="vrm-btn vrm-btn-secondary vrm-btn-sm" onClick={handleExport}>
              Export CSV
            </button>
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
                          <div>{formatSex(event.sex)}</div>
                          <div style={{ color: 'var(--vrm-text-muted)', marginTop: 'var(--vrm-spacing-1)' }}>
                            Age: {formatAgeBucket(event.age_estimate)}
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
