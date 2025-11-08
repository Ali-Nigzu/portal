import React, { useCallback, useState } from 'react';
import {
  compareOptions,
  granularityOptions,
  rangePresets,
  RangePreset,
  ScopeOption,
  SegmentOption,
} from '../styles/designTokens';
import { useGlobalControls } from '../context/GlobalControlsContext';

const segmentsCopy: Record<SegmentOption, string> = {
  sex: 'Sex',
  age: 'Age bands',
};

const scopeCopy: Record<ScopeOption, string> = {
  all_cameras: 'All cameras',
  per_camera: 'Per-camera',
};

const GlobalToolbar: React.FC = () => {
  const {
    rangePreset,
    setRangePreset,
    setCustomRange,
    granularity,
    setGranularity,
    scope,
    setScope,
    segments,
    toggleSegment,
    compare,
    setCompare,
    realtime,
    setRealtime,
    stepRange,
  } = useGlobalControls();
  const [showCustomRangeNotice, setShowCustomRangeNotice] = useState(false);

  const handleRangeChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value as RangePreset;
      if (value === 'custom') {
        const from = window.prompt('Start date (ISO 8601)');
        const to = window.prompt('End date (ISO 8601)');
        if (from && to) {
          setRangePreset(value);
          setCustomRange({ from, to });
          setShowCustomRangeNotice(false);
        } else {
          setShowCustomRangeNotice(true);
        }
      } else {
        setRangePreset(value);
        setCustomRange(undefined);
        setShowCustomRangeNotice(false);
      }
    },
    [setRangePreset, setCustomRange]
  );

  const handleScopeChange = (nextScope: ScopeOption) => {
    setScope(nextScope);
  };

  const toggleRealtime = () => setRealtime(!realtime);

  const isSegmentActive = (segment: SegmentOption) => segments.includes(segment);

  return (
    <div className="vrm-toolbar" role="toolbar" aria-label="Global analytics controls">
      <div className="vrm-toolbar-main">
        <div className="vrm-toolbar-group" aria-label="Range controls">
          <button
            type="button"
            className="vrm-toolbar-chevron"
            onClick={() => stepRange('backward')}
            aria-label="Step backward"
          >
            ◀
          </button>
          <select
            className="vrm-toolbar-select"
            value={rangePreset}
            onChange={handleRangeChange}
            aria-label="Quick ranges"
          >
            {rangePresets.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="vrm-toolbar-chevron"
            onClick={() => stepRange('forward')}
            aria-label="Step forward"
          >
            ▶
          </button>
        </div>

        <div className="vrm-toolbar-group" aria-label="Granularity">
          <span className="vrm-toolbar-label">Granularity</span>
          <select
            className="vrm-toolbar-select"
            value={granularity}
            onChange={(event) => setGranularity(event.target.value as typeof granularity)}
          >
            {granularityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="vrm-toolbar-group" aria-label="Scope">
          <span className="vrm-toolbar-label">Scope</span>
          {Object.entries(scopeCopy).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`vrm-toolbar-chip ${scope === value ? 'active' : ''}`}
              onClick={() => handleScopeChange(value as ScopeOption)}
              disabled={value === 'per_camera'}
            >
              {label}
              {value === 'all_cameras' ? ' · 1 of 1' : ''}
            </button>
          ))}
        </div>
      </div>

      <div className="vrm-toolbar-secondary">
        <div className="vrm-toolbar-group" aria-label="Segments">
          <span className="vrm-toolbar-label">Segments</span>
          {(Object.keys(segmentsCopy) as SegmentOption[]).map((segment) => (
            <button
              key={segment}
              type="button"
              className={`vrm-toolbar-chip ${isSegmentActive(segment) ? 'active' : ''}`}
              onClick={() => toggleSegment(segment)}
            >
              {segmentsCopy[segment]}
            </button>
          ))}
        </div>

        <div className="vrm-toolbar-group" aria-label="Comparison mode">
          <span className="vrm-toolbar-label">Compare</span>
          <select
            className="vrm-toolbar-select"
            value={compare}
            onChange={(event) => setCompare(event.target.value as typeof compare)}
          >
            {compareOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="vrm-toolbar-group" aria-label="Realtime toggle">
          <span className="vrm-toolbar-label">Realtime</span>
          <button
            type="button"
            className={`vrm-toolbar-chip ${realtime ? 'active' : ''}`}
            onClick={toggleRealtime}
            aria-pressed={realtime}
          >
            <span className="vrm-toolbar-live">
              <span className="vrm-toolbar-live-indicator" aria-hidden />
              {realtime ? 'On' : 'Off'}
            </span>
          </button>
        </div>
      </div>

      {showCustomRangeNotice && (
        <div className="vrm-toolbar-notice" role="alert">
          Custom range requires valid start and end dates.
        </div>
      )}
    </div>
  );
};

export default GlobalToolbar;
