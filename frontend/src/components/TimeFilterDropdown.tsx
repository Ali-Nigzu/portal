import React, { useId, useState } from 'react';

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

  const dropdownId = useId();
  const startInputId = `${dropdownId}-start`;
  const endInputId = `${dropdownId}-end`;

  return (
    <div className={`time-filter-dropdown ${className}`} style={{ position: 'relative' }}>
      <select
        value={value.option}
        onChange={(e) => handleOptionChange(e.target.value as TimeFilterOption)}
        className="vrm-select"
      >
        {timeOptions.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {showCustomDatePicker && (
        <div className="vrm-popover">
          <div className="vrm-popover-content">
            <div className="vrm-field">
              <label className="vrm-label" htmlFor={startInputId}>
                Start date
              </label>
              <input
                id={startInputId}
                className="vrm-input"
                type="date"
                value={tempStartDate}
                onChange={(e) => setTempStartDate(e.target.value)}
              />
            </div>

            <div className="vrm-field">
              <label className="vrm-label" htmlFor={endInputId}>
                End date
              </label>
              <input
                id={endInputId}
                className="vrm-input"
                type="date"
                value={tempEndDate}
                onChange={(e) => setTempEndDate(e.target.value)}
              />
            </div>

            <div className="vrm-auth-actions">
              <button onClick={handleCustomDateCancel} className="vrm-btn vrm-btn-secondary vrm-btn-sm">
                Cancel
              </button>
              <button
                onClick={handleCustomDateApply}
                className="vrm-btn vrm-btn-primary vrm-btn-sm"
                disabled={!tempStartDate || !tempEndDate}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimeFilterDropdown;