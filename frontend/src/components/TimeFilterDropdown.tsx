import React, { useState } from 'react';

export type TimeFilterOption = 'last24h' | 'last7days' | 'last30days' | 'alltime' | 'custom';

export interface TimeFilterValue {
  option: TimeFilterOption;
  startDate?: string;
  endDate?: string;
}

interface TimeFilterDropdownProps {
  value: TimeFilterValue;
  onChange: (value: TimeFilterValue) => void;
  className?: string;
}

const TimeFilterDropdown: React.FC<TimeFilterDropdownProps> = ({ value, onChange, className = '' }) => {
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  const [tempStartDate, setTempStartDate] = useState(value.startDate || '');
  const [tempEndDate, setTempEndDate] = useState(value.endDate || '');

  const timeOptions = [
    { value: 'last24h', label: 'Last 24 Hours' },
    { value: 'last7days', label: 'Last 7 Days' },
    { value: 'last30days', label: 'Last 30 Days' },
    { value: 'alltime', label: 'All Time' },
    { value: 'custom', label: 'Custom Period' }
  ];

  const handleOptionChange = (option: TimeFilterOption) => {
    if (option === 'custom') {
      setShowCustomDatePicker(true);
      // Don't change the value immediately for custom - wait for date selection
    } else {
      setShowCustomDatePicker(false);
      onChange({ option });
    }
  };

  const handleCustomDateApply = () => {
    if (tempStartDate && tempEndDate) {
      onChange({
        option: 'custom',
        startDate: tempStartDate,
        endDate: tempEndDate
      });
      setShowCustomDatePicker(false);
    }
  };

  const handleCustomDateCancel = () => {
    setShowCustomDatePicker(false);
    setTempStartDate(value.startDate || '');
    setTempEndDate(value.endDate || '');
  };

  const getDisplayLabel = () => {
    if (value.option === 'custom' && value.startDate && value.endDate) {
      const start = new Date(value.startDate).toLocaleDateString();
      const end = new Date(value.endDate).toLocaleDateString();
      return `${start} - ${end}`;
    }
    return timeOptions.find(opt => opt.value === value.option)?.label || 'Last 7 Days';
  };

  return (
    <div className={`time-filter-dropdown ${className}`} style={{ position: 'relative' }}>
      <select 
        value={value.option} 
        onChange={(e) => handleOptionChange(e.target.value as TimeFilterOption)}
        className="vrm-select"
        style={{
          padding: '6px 12px',
          backgroundColor: 'var(--vrm-bg-secondary)',
          border: '1px solid var(--vrm-border)',
          borderRadius: '4px',
          color: 'var(--vrm-text-primary)',
          fontSize: '12px',
          minWidth: '120px'
        }}
      >
        {timeOptions.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {/* Custom Date Picker Modal */}
      {showCustomDatePicker && (
        <div 
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 1000,
            backgroundColor: 'var(--vrm-bg-secondary)',
            border: '1px solid var(--vrm-border)',
            borderRadius: '6px',
            padding: '16px',
            minWidth: '280px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
          }}
        >
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--vrm-text-secondary)' }}>
              Start Date:
            </label>
            <input
              type="date"
              value={tempStartDate}
              onChange={(e) => setTempStartDate(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 8px',
                backgroundColor: 'var(--vrm-bg-primary)',
                border: '1px solid var(--vrm-border)',
                borderRadius: '4px',
                color: 'var(--vrm-text-primary)',
                fontSize: '12px'
              }}
            />
          </div>
          
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--vrm-text-secondary)' }}>
              End Date:
            </label>
            <input
              type="date"
              value={tempEndDate}
              onChange={(e) => setTempEndDate(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 8px',
                backgroundColor: 'var(--vrm-bg-primary)',
                border: '1px solid var(--vrm-border)',
                borderRadius: '4px',
                color: 'var(--vrm-text-primary)',
                fontSize: '12px'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              onClick={handleCustomDateCancel}
              className="vrm-btn vrm-btn-secondary vrm-btn-sm"
              style={{ fontSize: '11px' }}
            >
              Cancel
            </button>
            <button
              onClick={handleCustomDateApply}
              className="vrm-btn vrm-btn-primary vrm-btn-sm"
              style={{ fontSize: '11px' }}
              disabled={!tempStartDate || !tempEndDate}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimeFilterDropdown;