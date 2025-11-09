import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CompareOption,
  GranularityOption,
  RangePreset,
  compareOptions,
  granularityOptions,
  rangePresets,
  ScopeOption,
  SegmentOption,
} from '../styles/designTokens';
import { CardControlState } from '../hooks/useCardControls';
import { CustomRange } from '../context/GlobalControlsContext';

interface SeriesToggleConfig {
  key: string;
  label: string;
  color: string;
}

interface CardControlHeaderProps {
  cardId: string;
  title: string;
  subtitle?: string;
  controls: CardControlState;
  isSynced: boolean;
  setRangePreset: (preset: RangePreset) => void;
  setCustomRange: (range?: CustomRange) => void;
  setGranularity: (granularity: GranularityOption) => void;
  setScope: (scope: ScopeOption) => void;
  toggleSegment: (segment: SegmentOption) => void;
  setCompare: (compare: CompareOption) => void;
  resync: () => void;
  onExportPNG?: () => void;
  onExportCSV?: () => void;
  exportDisabled?: boolean;
  seriesConfig?: SeriesToggleConfig[];
  visibleSeries?: Record<string, boolean>;
  onToggleSeries?: (key: string) => void;
  disablePerCamera?: boolean;
  actions?: React.ReactNode;
}

const SEGMENT_LABELS: Record<SegmentOption, string> = {
  sex: 'Sex',
  age: 'Age bands',
};

const SCOPE_LABELS: Record<ScopeOption, string> = {
  all_cameras: 'All cameras',
  per_camera: 'Per camera',
};

const formatRangeLabel = (rangePreset: string) => {
  const preset = rangePresets.find(item => item.value === rangePreset);
  return preset?.label ?? 'Custom';
};

const CardControlHeader: React.FC<CardControlHeaderProps> = ({
  cardId,
  title,
  subtitle,
  controls,
  isSynced,
  setRangePreset,
  setCustomRange,
  setGranularity,
  setScope,
  toggleSegment,
  setCompare,
  resync,
  onExportPNG,
  onExportCSV,
  exportDisabled,
  seriesConfig,
  visibleSeries,
  onToggleSeries,
  disablePerCamera = false,
  actions,
}) => {
  const [isCustomPopoverOpen, setIsCustomPopoverOpen] = useState(false);
  const [draftRange, setDraftRange] = useState<{ from?: string; to?: string } | undefined>(controls.customRange ?? undefined);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const exportButtonRef = useRef<HTMLButtonElement | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const customButtonRef = useRef<HTMLButtonElement | null>(null);
  const customPopoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDraftRange(controls.customRange ?? undefined);
  }, [controls.customRange]);

  useEffect(() => {
    if (!isCustomPopoverOpen) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) {
        return;
      }
      if (customButtonRef.current?.contains(event.target)) {
        return;
      }
      if (customPopoverRef.current?.contains(event.target)) {
        return;
      }
      setIsCustomPopoverOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isCustomPopoverOpen]);

  useEffect(() => {
    if (!isExportOpen) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) {
        return;
      }
      if (exportButtonRef.current?.contains(event.target)) {
        return;
      }
      if (exportMenuRef.current?.contains(event.target)) {
        return;
      }
      setIsExportOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isExportOpen]);

  const handleApplyCustomRange = () => {
    if (draftRange?.from && draftRange?.to) {
      setCustomRange({ from: draftRange.from, to: draftRange.to });
      setIsCustomPopoverOpen(false);
    }
  };

  const scopeOptions = useMemo(() => Object.keys(SCOPE_LABELS) as ScopeOption[], []);
  const segmentOptions = useMemo(() => Object.keys(SEGMENT_LABELS) as SegmentOption[], []);

  return (
    <div className="vrm-card-header vrm-card-header--controls">
      <div className="vrm-card-heading">
        <div className="vrm-card-heading-text">
          <h3 className="vrm-card-title">{title}</h3>
          {subtitle && <p className="vrm-card-subtitle">{subtitle}</p>}
          {!isSynced && (
            <div className="vrm-card-desync" role="status" aria-live="polite">
              <span className="vrm-card-desync-dot" aria-hidden="true" />
              <span className="vrm-text-secondary">Overrides in effect</span>
              <button type="button" className="vrm-btn vrm-btn-text" onClick={resync}>
                Re-sync
              </button>
            </div>
          )}
        </div>
        {actions && <div className="vrm-card-extra-actions">{actions}</div>}
      </div>

      <div className="vrm-card-controls">
        <div className="vrm-card-control-group vrm-card-control-group--range">
          <label className="vrm-label" htmlFor={`${cardId}-range`}>
            Range
          </label>
          <div className="vrm-card-range-control">
            <select
              id={`${cardId}-range`}
              className="vrm-select"
              value={controls.rangePreset}
              onChange={event => {
                const nextValue = event.target.value as RangePreset;
                setRangePreset(nextValue);
                if (nextValue === 'custom') {
                  setIsCustomPopoverOpen(true);
                } else {
                  setIsCustomPopoverOpen(false);
                }
              }}
            >
              {rangePresets
                .filter(item => item.value !== 'custom')
                .map(item => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              <option value="custom">Custom…</option>
            </select>
            <button
              type="button"
              className="vrm-btn vrm-btn-tertiary vrm-btn-sm"
              onClick={() => setIsCustomPopoverOpen(value => !value)}
              ref={customButtonRef}
            >
              {controls.customRange ? `${controls.customRange.from} → ${controls.customRange.to}` : 'Set custom'}
            </button>
            {isCustomPopoverOpen && (
              <div
                className="vrm-popover"
                role="dialog"
                aria-label="Custom range"
                ref={customPopoverRef}
              >
                <div className="vrm-popover-content">
                  <div className="vrm-field">
                    <label className="vrm-label" htmlFor={`${cardId}-range-from`}>
                      From
                    </label>
                    <input
                      id={`${cardId}-range-from`}
                      className="vrm-input"
                      type="date"
                      value={draftRange?.from ?? ''}
                      onChange={event =>
                        setDraftRange(prev => ({ ...prev, from: event.target.value }))
                      }
                    />
                  </div>
                  <div className="vrm-field">
                    <label className="vrm-label" htmlFor={`${cardId}-range-to`}>
                      To
                    </label>
                    <input
                      id={`${cardId}-range-to`}
                      className="vrm-input"
                      type="date"
                      value={draftRange?.to ?? ''}
                      onChange={event =>
                        setDraftRange(prev => ({ ...prev, to: event.target.value }))
                      }
                    />
                  </div>
                  <div className="vrm-popover-actions">
                    <button
                      type="button"
                      className="vrm-btn vrm-btn-secondary"
                    onClick={() => {
                        setDraftRange(controls.customRange);
                        setIsCustomPopoverOpen(false);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="vrm-btn"
                      disabled={!draftRange?.from || !draftRange?.to}
                      onClick={handleApplyCustomRange}
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <span className="vrm-help-text">
            {controls.rangePreset === 'custom'
              ? controls.customRange
                ? `${controls.customRange.from} → ${controls.customRange.to}`
                : 'Custom range'
              : formatRangeLabel(controls.rangePreset)}
          </span>
        </div>

        <div className="vrm-card-control-group">
          <label className="vrm-label" htmlFor={`${cardId}-granularity`}>
            Granularity
          </label>
          <select
            id={`${cardId}-granularity`}
            className="vrm-select"
            value={controls.granularity}
            onChange={event => setGranularity(event.target.value as GranularityOption)}
          >
            {granularityOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="vrm-card-control-group">
          <span className="vrm-label">Scope</span>
          <div className="vrm-card-chip-row">
            {scopeOptions.map(option => (
              <button
                key={option}
                type="button"
                className={`vrm-toolbar-chip ${controls.scope === option ? 'active' : ''}`}
                onClick={() => setScope(option)}
                disabled={disablePerCamera && option === 'per_camera'}
              >
                {SCOPE_LABELS[option]}
              </button>
            ))}
          </div>
        </div>

        <div className="vrm-card-control-group">
          <span className="vrm-label">Segments</span>
          <div className="vrm-card-chip-row">
            {segmentOptions.map(segment => (
              <button
                key={segment}
                type="button"
                className={`vrm-toolbar-chip ${controls.segments.includes(segment) ? 'active' : ''}`}
                onClick={() => toggleSegment(segment)}
              >
                {SEGMENT_LABELS[segment]}
              </button>
            ))}
          </div>
        </div>

        <div className="vrm-card-control-group">
          <label className="vrm-label" htmlFor={`${cardId}-compare`}>
            Compare
          </label>
          <select
            id={`${cardId}-compare`}
            className="vrm-select"
            value={controls.compare}
            onChange={event => setCompare(event.target.value as CompareOption)}
          >
            {compareOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="vrm-card-control-group vrm-card-control-group--export">
          <span className="vrm-label">Export</span>
          <div className="vrm-card-export">
            <button
              type="button"
              className="vrm-btn vrm-btn-secondary vrm-btn-sm"
              onClick={() => setIsExportOpen(value => !value)}
              ref={exportButtonRef}
              aria-expanded={isExportOpen}
              aria-haspopup="menu"
            >
              Export
            </button>
            {isExportOpen && (
              <div className="vrm-popover" role="menu" ref={exportMenuRef}>
                <div className="vrm-popover-content">
                  <button
                    type="button"
                    className="vrm-btn vrm-btn-text"
                    disabled={exportDisabled}
                    onClick={() => {
                      setIsExportOpen(false);
                      onExportPNG?.();
                    }}
                  >
                    PNG snapshot
                  </button>
                  <button
                    type="button"
                    className="vrm-btn vrm-btn-text"
                    disabled={exportDisabled}
                    onClick={() => {
                      setIsExportOpen(false);
                      onExportCSV?.();
                    }}
                  >
                    CSV data
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {seriesConfig && visibleSeries && onToggleSeries && (
        <div className="vrm-card-series">
          <span className="vrm-label">Series</span>
          <div className="vrm-card-chip-row">
            {seriesConfig.map(series => (
              <button
                key={series.key}
                type="button"
                className={`vrm-toolbar-chip ${visibleSeries[series.key] ? 'active' : ''}`}
                onClick={() => onToggleSeries(series.key)}
                style={visibleSeries[series.key] ? { borderColor: series.color, color: series.color } : undefined}
              >
                {series.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CardControlHeader;
