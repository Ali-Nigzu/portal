import React, { useCallback, useEffect, useMemo, useState } from 'react';
import CardControlHeader from '../CardControlHeader';
import AnalyticsChart from './AnalyticsChart';
import { useCardControls } from '../../hooks/useCardControls';
import { useSeriesVisibility } from '../../hooks/useSeriesVisibility';
import {
  AnalyticsBuilderState,
  AnalyticsFilterNode,
  AnalyticsFilterGroup,
  AnalyticsFilterCondition,
  AnalyticsResult,
  AnalyticsChartType,
  AnalyticsFilterField,
  AnalyticsFilterOperator,
  RelativePreset,
  buildAnalyticsResult,
  defaultAnalyticsBuilderState,
  normalizeBuilderState,
  createFilterGroup,
  createFilterCondition,
  getAvailableSplitOptions,
  getAvailableXAxisOptions,
  getAvailableMetrics,
  getAvailableAggregates,
  getAvailableChartTypes,
  AnalyticsAxisKey,
} from '../../utils/analyticsBuilder';
import { ChartData } from '../../utils/dataProcessing';
import { IntelligencePayload } from '../../types/analytics';
import { GranularityOption } from '../../styles/designTokens';
import { exportChartAsPNG, exportDataAsCSV, generateChartId } from '../../utils/exportUtils';

interface SavedAnalyticsView {
  id: string;
  name: string;
  description?: string;
  state: AnalyticsBuilderState;
}

interface AnalyticsExplorerProps {
  data: ChartData[];
  intelligence: IntelligencePayload | null;
}

const STORAGE_KEY_VIEWS = 'camOS.analytics.views';
const STORAGE_KEY_PINS = 'camOS.analytics.pins';
const QUERY_PARAM_STATE = 'analytics_state';

const RELATIVE_PRESETS: { label: string; value: { preset: RelativePreset; amount?: number } }[] = [
  { label: 'Last 7 days', value: { preset: 'last_7_days' } },
  { label: 'Last 30 days', value: { preset: 'last_30_days' } },
  { label: 'Last 12 weeks', value: { preset: 'last_12_weeks', amount: 12 } },
  { label: 'Same day last week', value: { preset: 'same_day_last_week' } },
  { label: 'Same period last year', value: { preset: 'same_period_last_year' } },
];

const WEEKDAY_OPTIONS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const DEFAULT_OPERATOR_BY_FIELD: Record<AnalyticsFilterField, AnalyticsFilterOperator> = {
  event_type: 'equals',
  sex: 'equals',
  age_band: 'equals',
  camera_id: 'equals',
  site_id: 'equals',
  index: 'gte',
  track_id: 'equals',
  timestamp: 'between',
  weekday: 'in',
};

const OPERATORS_BY_FIELD: Record<AnalyticsFilterField, AnalyticsFilterOperator[]> = {
  event_type: ['equals', 'not_equals', 'in', 'not_in'],
  sex: ['equals', 'not_equals', 'in', 'not_in'],
  age_band: ['equals', 'not_equals', 'in', 'not_in'],
  camera_id: ['equals', 'not_equals', 'in', 'not_in'],
  site_id: ['equals', 'not_equals', 'in', 'not_in'],
  index: ['gte', 'lte'],
  track_id: ['equals', 'not_equals', 'in', 'not_in'],
  timestamp: ['between', 'relative', 'gte', 'lte'],
  weekday: ['equals', 'not_equals', 'in', 'not_in'],
};

const AXIS_OPTIONS: Array<{ value: AnalyticsAxisKey; label: string }> = [
  { value: 'people', label: 'Occupancy (people)' },
  { value: 'events', label: 'Events (count)' },
  { value: 'throughput', label: 'Throughput (events/min)' },
  { value: 'dwell', label: 'Dwell (minutes)' },
];

const encodeState = (state: AnalyticsBuilderState): string => {
  try {
    return window.btoa(encodeURIComponent(JSON.stringify(state)));
  } catch (error) {
    console.warn('Failed to encode analytics state', error);
    return '';
  }
};

const decodeState = (encoded: string): AnalyticsBuilderState | null => {
  try {
    const json = decodeURIComponent(window.atob(encoded));
    const parsed = JSON.parse(json) as AnalyticsBuilderState;
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
    return null;
  } catch (error) {
    console.warn('Failed to decode analytics state', error);
    return null;
  }
};

const loadSavedViews = (): SavedAnalyticsView[] => {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_VIEWS);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as SavedAnalyticsView[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed;
  } catch (error) {
    console.warn('Failed to parse saved analytics views', error);
    return [];
  }
};

const persistSavedViews = (views: SavedAnalyticsView[]) => {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY_VIEWS, JSON.stringify(views));
};

const updateQueryString = (state: AnalyticsBuilderState) => {
  if (typeof window === 'undefined') {
    return;
  }
  const params = new URLSearchParams(window.location.search);
  const encoded = encodeState(state);
  if (encoded) {
    params.set(QUERY_PARAM_STATE, encoded);
  } else {
    params.delete(QUERY_PARAM_STATE);
  }
  const nextUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, '', nextUrl);
};

const addConditionToGroup = (group: AnalyticsFilterGroup): AnalyticsFilterGroup => ({
  ...group,
  children: [...group.children, createFilterCondition()],
});

const addGroupToGroup = (group: AnalyticsFilterGroup): AnalyticsFilterGroup => ({
  ...group,
  children: [...group.children, createFilterGroup('AND')],
});

const renderValueInput = (
  condition: AnalyticsFilterCondition,
  onChange: (value: AnalyticsFilterCondition['value']) => void,
) => {
  const { field, operator, value } = condition;

  if (operator === 'between' && typeof value === 'object' && value != null && 'from' in value && 'to' in value) {
    const from = value.from ? value.from.slice(0, 16) : '';
    const to = value.to ? value.to.slice(0, 16) : '';
    return (
      <div className="vrm-filter-range">
        <input
          type="datetime-local"
          className="vrm-input"
          value={from}
          onChange={event => onChange({ ...value, from: event.target.value })}
        />
        <span className="vrm-text-muted">to</span>
        <input
          type="datetime-local"
          className="vrm-input"
          value={to}
          onChange={event => onChange({ ...value, to: event.target.value })}
        />
      </div>
    );
  }

  if (operator === 'relative') {
    const current = typeof value === 'object' && value != null && 'preset' in value ? value : RELATIVE_PRESETS[0].value;
    return (
      <select
        className="vrm-select"
        value={`${current.preset}:${current.amount ?? ''}`}
        onChange={event => {
          const [preset, rawAmount] = event.target.value.split(':');
          const amount = rawAmount ? Number(rawAmount) : undefined;
          onChange({ preset: preset as RelativePreset, amount });
        }}
      >
        {RELATIVE_PRESETS.map(option => (
          <option key={option.value.preset} value={`${option.value.preset}:${option.value.amount ?? ''}`}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if ((operator === 'in' || operator === 'not_in') && field === 'weekday') {
    const current = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',').map(token => token.trim()) : [];
    return (
      <select
        className="vrm-select"
        value={current}
        multiple
        onChange={event => {
          const selected: string[] = Array.from(event.target.selectedOptions).map(option => option.value);
          onChange(selected);
        }}
      >
        {WEEKDAY_OPTIONS.map(option => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (operator === 'in' || operator === 'not_in') {
    const text = Array.isArray(value) ? value.join(',') : String(value ?? '');
    return (
      <input
        className="vrm-input"
        type="text"
        placeholder="Comma separated values"
        value={text}
        onChange={event => onChange(event.target.value.split(',').map(token => token.trim()).filter(Boolean))}
      />
    );
  }

  if (field === 'timestamp') {
    const val = value ? String(value).slice(0, 16) : '';
    return (
      <input
        className="vrm-input"
        type="datetime-local"
        value={val}
        onChange={event => onChange(event.target.value)}
      />
    );
  }

  return (
    <input
      className="vrm-input"
      type="text"
      value={typeof value === 'string' ? value : Array.isArray(value) ? value.join(',') : String(value ?? '')}
      onChange={event => onChange(event.target.value)}
    />
  );
};

const FilterNodeEditor: React.FC<{
  node: AnalyticsFilterNode;
  onUpdate: (node: AnalyticsFilterNode) => void;
  onRemove: () => void;
}> = ({ node, onUpdate, onRemove }) => {
  if (node.type === 'group') {
    return (
      <div className="vrm-filter-group">
        <div className="vrm-filter-group-header">
          <div className="vrm-card-chip-row">
            <button
              type="button"
              className={`vrm-toolbar-chip ${node.logic === 'AND' ? 'active' : ''}`}
              onClick={() => onUpdate({ ...node, logic: 'AND' })}
            >
              AND
            </button>
            <button
              type="button"
              className={`vrm-toolbar-chip ${node.logic === 'OR' ? 'active' : ''}`}
              onClick={() => onUpdate({ ...node, logic: 'OR' })}
            >
              OR
            </button>
          </div>
          <div className="vrm-filter-group-actions">
            <button type="button" className="vrm-btn vrm-btn-tertiary vrm-btn-sm" onClick={() => onUpdate(addConditionToGroup(node))}>
              Add condition
            </button>
            <button type="button" className="vrm-btn vrm-btn-tertiary vrm-btn-sm" onClick={() => onUpdate(addGroupToGroup(node))}>
              Add group
            </button>
            <button type="button" className="vrm-btn vrm-btn-text" onClick={onRemove}>
              Remove
            </button>
          </div>
        </div>
        <div className="vrm-filter-group-body">
          {node.children.length === 0 && <p className="vrm-text-secondary">Empty group</p>}
          {node.children.map(child => (
            <FilterNodeEditor
              key={child.id}
              node={child}
              onUpdate={updated => {
                const nextChildren = node.children.map(existing => (existing.id === updated.id ? updated : existing));
                onUpdate({ ...node, children: nextChildren });
              }}
              onRemove={() => {
                const nextChildren = node.children.filter(existing => existing.id !== child.id);
                onUpdate({ ...node, children: nextChildren });
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  const availableOperators = OPERATORS_BY_FIELD[node.field];
  const currentOperator = availableOperators.includes(node.operator) ? node.operator : availableOperators[0];

  return (
    <div className="vrm-filter-row">
      <select
        className="vrm-select"
        value={node.field}
        onChange={event => {
          const field = event.target.value as AnalyticsFilterField;
          const operator = DEFAULT_OPERATOR_BY_FIELD[field];
          const baseCondition: AnalyticsFilterCondition = {
            ...node,
            field,
            operator,
            value:
              operator === 'between'
                ? { from: new Date().toISOString(), to: new Date().toISOString() }
                : operator === 'relative'
                ? RELATIVE_PRESETS[0].value
                : '',
          };
          onUpdate(baseCondition);
        }}
      >
        <option value="event_type">Event type</option>
        <option value="sex">Sex</option>
        <option value="age_band">Age band</option>
        <option value="camera_id">Camera</option>
        <option value="site_id">Site</option>
        <option value="index">Index</option>
        <option value="track_id">Track ID</option>
        <option value="timestamp">Timestamp</option>
        <option value="weekday">Weekday</option>
      </select>
      <select
        className="vrm-select"
        value={currentOperator}
        onChange={event => {
          const operator = event.target.value as AnalyticsFilterOperator;
          let nextValue: AnalyticsFilterCondition['value'] = '';
          if (operator === 'between') {
            nextValue = { from: new Date().toISOString(), to: new Date().toISOString() };
          } else if (operator === 'relative') {
            nextValue = RELATIVE_PRESETS[0].value;
          } else if (operator === 'in' || operator === 'not_in') {
            nextValue = [];
          }
          onUpdate({ ...node, operator, value: nextValue });
        }}
      >
        {availableOperators.map(option => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {renderValueInput({ ...node, operator: currentOperator }, value => onUpdate({ ...node, operator: currentOperator, value }))}
      <button type="button" className="vrm-btn vrm-btn-text" onClick={onRemove}>
        Remove
      </button>
    </div>
  );
};

const AnalyticsExplorer: React.FC<AnalyticsExplorerProps> = ({ data, intelligence }) => {
  const {
    state: controls,
    isSynced,
    setRangePreset,
    setCustomRange,
    setGranularity,
    setScope,
    toggleSegment,
    setCompare,
    resync,
  } = useCardControls('analytics', 'explorer');

  const [builderState, setBuilderState] = useState<AnalyticsBuilderState>(() => normalizeBuilderState(defaultAnalyticsBuilderState(), data));
  const [draftState, setDraftState] = useState<AnalyticsBuilderState>(() => builderState);
  const [editMode, setEditMode] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [savedViews, setSavedViews] = useState<SavedAnalyticsView[]>(() => loadSavedViews());
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [newViewName, setNewViewName] = useState('');
  const [newViewDescription, setNewViewDescription] = useState('');

  const chartDomId = useMemo(() => generateChartId('analytics-explorer'), []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const encodedState = params.get(QUERY_PARAM_STATE);
    if (encodedState) {
      const restored = decodeState(encodedState);
      if (restored) {
        const normalized = normalizeBuilderState(restored, data);
        setBuilderState(normalized);
        setDraftState(normalized);
      }
    }
  }, [data]);

  useEffect(() => {
    setBuilderState(prev => normalizeBuilderState(prev, data));
    setDraftState(prev => normalizeBuilderState(prev, data));
  }, [data]);

  useEffect(() => {
    setSavedViews(prev =>
      prev.map(view => ({
        ...view,
        state: normalizeBuilderState(view.state ?? defaultAnalyticsBuilderState(), data),
      })),
    );
  }, [data]);

  useEffect(() => {
    setDraftState(builderState);
    updateQueryString(builderState);
  }, [builderState]);

  const availableXAxisOptions = useMemo(() => getAvailableXAxisOptions(data), [data]);
  const availableSplitOptions = useMemo(() => getAvailableSplitOptions(data), [data]);
  const availableMetrics = useMemo(() => getAvailableMetrics(draftState.xAxis, draftState.dataset), [draftState.dataset, draftState.xAxis]);
  const availableAggregates = useMemo(() => getAvailableAggregates(draftState.yMetrics), [draftState.yMetrics]);
  const availableChartTypes = useMemo(() => getAvailableChartTypes(draftState.xAxis, draftState.yMetrics), [draftState.xAxis, draftState.yMetrics]);

  useEffect(() => {
    setDraftState(prev => {
      const normalized = normalizeBuilderState(prev, data);
      const cleanedMetrics = normalized.yMetrics.filter(metric => getAvailableMetrics(normalized.xAxis, normalized.dataset).includes(metric));
      const fallbackMetrics = cleanedMetrics.length ? cleanedMetrics : [getAvailableMetrics(normalized.xAxis, normalized.dataset)[0]];
      const nextAssignments = { ...normalized.axisAssignments };
      fallbackMetrics.forEach(metric => {
        if (!nextAssignments[metric]) {
          nextAssignments[metric] = 'events';
        }
      });
      return {
        ...normalized,
        yMetrics: fallbackMetrics,
        axisAssignments: nextAssignments,
      };
    });
  }, [availableXAxisOptions, availableMetrics, data]);

  const analyticsResult: AnalyticsResult = useMemo(
    () => buildAnalyticsResult(data, controls, builderState, intelligence),
    [data, controls, builderState, intelligence],
  );

  const seriesDefinitions = useMemo(() => analyticsResult.series, [analyticsResult.series]);
  const { visibility, toggleSeries } = useSeriesVisibility(
    'analytics',
    'explorer',
    seriesDefinitions.map(descriptor => ({ key: descriptor.key, defaultVisible: !descriptor.isComparison })),
  );

  const seriesConfig = useMemo(
    () =>
      seriesDefinitions.map(descriptor => ({
        key: descriptor.key,
        label: descriptor.label,
        color: descriptor.color,
      })),
    [seriesDefinitions],
  );

  const exportFilename = useMemo(
    () => `${controls.rangePreset}_analytics_${builderState.xAxis}`,
    [controls.rangePreset, builderState.xAxis],
  );

  const handleExportPNG = useCallback(() => {
    exportChartAsPNG(chartDomId, exportFilename);
  }, [chartDomId, exportFilename]);

  const handleExportCSV = useCallback(() => {
    const rows = analyticsResult.data.map(row => row);
    exportDataAsCSV(rows, exportFilename);
  }, [analyticsResult.data, exportFilename]);

  const handlePreview = () => {
    const normalized = normalizeBuilderState(draftState, data);
    setBuilderState(normalized);
    setIsPreviewing(true);
  };

  const handleApply = () => {
    const normalized = normalizeBuilderState(draftState, data);
    setBuilderState(normalized);
    setIsPreviewing(false);
    setEditMode(false);
  };

  const handleCancel = () => {
    setDraftState(builderState);
    setIsPreviewing(false);
    setEditMode(false);
  };

  const handleSelectView = (view: SavedAnalyticsView) => {
    const normalized = normalizeBuilderState(view.state, data);
    setBuilderState(normalized);
    setDraftState(normalized);
    setActiveViewId(view.id);
    setEditMode(false);
    setIsPreviewing(false);
  };

  const handleSaveView = () => {
    if (!newViewName.trim()) {
      return;
    }
    const normalized = normalizeBuilderState(draftState, data);
    const view: SavedAnalyticsView = {
      id: Date.now().toString(36),
      name: newViewName.trim(),
      description: newViewDescription.trim() || undefined,
      state: normalized,
    };
    const nextViews = [...savedViews, view];
    setSavedViews(nextViews);
    persistSavedViews(nextViews);
    setActiveViewId(view.id);
    setNewViewName('');
    setNewViewDescription('');
    setBuilderState(normalized);
    setEditMode(false);
  };

  const handleDeleteView = (id: string) => {
    const nextViews = savedViews.filter(view => view.id !== id);
    setSavedViews(nextViews);
    persistSavedViews(nextViews);
    if (activeViewId === id) {
      setActiveViewId(null);
    }
  };

  const handlePinToDashboard = () => {
    if (typeof window === 'undefined') {
      return;
    }
    const raw = window.localStorage.getItem(STORAGE_KEY_PINS);
    let pins: Array<{ id: string; state: AnalyticsBuilderState; createdAt: string }> = [];
    if (raw) {
      try {
        pins = JSON.parse(raw) as typeof pins;
      } catch (error) {
        console.warn('Failed to parse pinned analytics views', error);
      }
    }
    pins.push({ id: Date.now().toString(36), state: builderState, createdAt: new Date().toISOString() });
    window.localStorage.setItem(STORAGE_KEY_PINS, JSON.stringify(pins));
  };

  const handleZoomToRange = useCallback(
    (from: string, to: string) => {
      setCustomRange({ from, to });
    },
    [setCustomRange],
  );

  const pillItems = useMemo(() => {
    const items: { key: string; label: string }[] = [];
    items.push({ key: 'dataset', label: `Dataset: ${builderState.dataset}` });
    items.push({ key: 'chart', label: `Type: ${builderState.chartType}` });
    if (builderState.xAxis === 'time_bucket') {
      items.push({ key: 'x', label: `X: Time (${builderState.granularity})` });
    } else {
      items.push({ key: 'x', label: `X: ${builderState.xAxis}` });
    }
    items.push({ key: 'y', label: `Measures: ${builderState.yMetrics.join(', ')}` });
    if (builderState.splitBy !== 'none') {
      items.push({ key: 'split', label: `Split: ${builderState.splitBy}` });
    }
    items.push({ key: 'aggregate', label: `Aggregate: ${builderState.aggregate}` });
    if (builderState.window !== 'range') {
      items.push({ key: 'window', label: `Window: ${builderState.window.replace('_', ' ')}` });
    }
    if (builderState.filters.children.length) {
      items.push({ key: 'filters', label: `Filters: ${builderState.filters.children.length}` });
    }
    return items;
  }, [builderState]);

  const updateDraft = (partial: Partial<AnalyticsBuilderState>) => {
    setDraftState(prev => ({ ...prev, ...partial }));
  };

  return (
    <div className="vrm-analytics-layout">
      <aside className="vrm-analytics-rail">
        <div className="vrm-analytics-rail-header">
          <h2 className="vrm-text-secondary">Saved views</h2>
          <button
            type="button"
            className="vrm-btn vrm-btn-tertiary vrm-btn-sm"
            onClick={() => {
              setDraftState(builderState);
              setEditMode(true);
            }}
          >
            Edit
          </button>
        </div>
        <ul className="vrm-analytics-view-list">
          {savedViews.map(view => (
            <li key={view.id} className={view.id === activeViewId ? 'active' : undefined}>
              <button type="button" onClick={() => handleSelectView(view)}>
                <span>{view.name}</span>
                {view.description && <small>{view.description}</small>}
              </button>
              <button
                type="button"
                className="vrm-btn vrm-btn-text vrm-btn-sm"
                onClick={() => handleDeleteView(view.id)}
                aria-label={`Delete view ${view.name}`}
              >
                Remove
              </button>
            </li>
          ))}
          {!savedViews.length && <li className="vrm-text-secondary">No saved views yet</li>}
        </ul>
        <button type="button" className="vrm-btn vrm-btn-secondary" onClick={handlePinToDashboard}>
          Add to dashboard
        </button>
      </aside>

      <section className="vrm-analytics-main">
        <CardControlHeader
          cardId="analytics-explorer"
          title="Analytics explorer"
          subtitle={isPreviewing ? 'Previewing changes' : undefined}
          controls={controls}
          isSynced={isSynced}
          setRangePreset={setRangePreset}
          setCustomRange={setCustomRange}
          setGranularity={setGranularity}
          setScope={setScope}
          toggleSegment={toggleSegment}
          setCompare={setCompare}
          resync={resync}
          onExportPNG={handleExportPNG}
          onExportCSV={handleExportCSV}
          exportDisabled={!analyticsResult.data.length}
          seriesConfig={seriesConfig}
          visibleSeries={visibility}
          onToggleSeries={toggleSeries}
          showGranularity={false}
          showSegments={false}
          showScope={data.some(item => item.camera_id != null)}
          disablePerCamera={!data.some(item => item.camera_id != null)}
          showCompare={builderState.xAxis === 'time_bucket'}
          showSeries={seriesConfig.length > 0}
        />

        <div className="vrm-analytics-pills">
          {pillItems.map(item => (
            <button
              key={item.key}
              type="button"
              className="vrm-pill"
              onClick={() => {
                setDraftState(builderState);
                setEditMode(true);
                setIsPreviewing(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {editMode && (
          <div className="vrm-analytics-builder" role="region" aria-label="Analytics builder">
            <div className="vrm-builder-grid">
              <div className="vrm-field">
                <label className="vrm-label" htmlFor="builder-dataset">Dataset</label>
                <select
                  id="builder-dataset"
                  className="vrm-select"
                  value={draftState.dataset}
                  onChange={event => updateDraft({ dataset: event.target.value as AnalyticsBuilderState['dataset'] })}
                >
                  <option value="events">Events</option>
                  <option value="dwell">Dwell sessions</option>
                  <option value="occupancy">Occupancy series</option>
                </select>
              </div>

              <div className="vrm-field">
                <label className="vrm-label" htmlFor="builder-chart-type">Chart type</label>
                <select
                  id="builder-chart-type"
                  className="vrm-select"
                  value={draftState.chartType}
                  onChange={event => updateDraft({ chartType: event.target.value as AnalyticsChartType })}
                >
                  {availableChartTypes.map(option => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="vrm-field">
                <label className="vrm-label" htmlFor="builder-x-axis">X-axis</label>
                <select
                  id="builder-x-axis"
                  className="vrm-select"
                  value={draftState.xAxis}
                  onChange={event => updateDraft({ xAxis: event.target.value as AnalyticsBuilderState['xAxis'] })}
                >
                  {availableXAxisOptions.map(option => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="vrm-field">
                <label className="vrm-label" htmlFor="builder-granularity">Granularity</label>
                <select
                  id="builder-granularity"
                  className="vrm-select"
                  value={draftState.granularity}
                  onChange={event => updateDraft({ granularity: event.target.value as GranularityOption })}
                  disabled={draftState.xAxis !== 'time_bucket'}
                >
                  <option value="5m">5 minutes</option>
                  <option value="15m">15 minutes</option>
                  <option value="hour">Hourly</option>
                  <option value="day">Daily</option>
                  <option value="week">Weekly</option>
                  <option value="auto">Auto</option>
                </select>
              </div>

              <div className="vrm-field">
                <label className="vrm-label">Measures</label>
                <div className="vrm-card-chip-row">
                  {availableMetrics.map(metric => {
                    const active = draftState.yMetrics.includes(metric);
                    return (
                      <button
                        type="button"
                        key={metric}
                        className={`vrm-toolbar-chip ${active ? 'active' : ''}`}
                        onClick={() => {
                          setDraftState(prev => {
                            const exists = prev.yMetrics.includes(metric);
                            if (exists) {
                              const nextMetrics = prev.yMetrics.filter(item => item !== metric);
                              return { ...prev, yMetrics: nextMetrics.length ? nextMetrics : [metric] };
                            }
                            return { ...prev, yMetrics: [...prev.yMetrics, metric] };
                          });
                        }}
                      >
                        {metric}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="vrm-field">
                <label className="vrm-label" htmlFor="builder-split">Split by</label>
                <select
                  id="builder-split"
                  className="vrm-select"
                  value={draftState.splitBy}
                  onChange={event => updateDraft({ splitBy: event.target.value as AnalyticsBuilderState['splitBy'] })}
                >
                  {availableSplitOptions.map(option => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="vrm-field">
                <label className="vrm-label" htmlFor="builder-aggregate">Aggregate</label>
                <select
                  id="builder-aggregate"
                  className="vrm-select"
                  value={draftState.aggregate}
                  onChange={event => updateDraft({ aggregate: event.target.value as AnalyticsBuilderState['aggregate'] })}
                >
                  {availableAggregates.map(option => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="vrm-field">
                <label className="vrm-label" htmlFor="builder-window">Window</label>
                <select
                  id="builder-window"
                  className="vrm-select"
                  value={draftState.window}
                  onChange={event => updateDraft({ window: event.target.value as AnalyticsBuilderState['window'] })}
                >
                  <option value="range">Use card range</option>
                  <option value="trailing_7_days">Trailing 7 days</option>
                  <option value="trailing_30_days">Trailing 30 days</option>
                </select>
              </div>
            </div>

            <div className="vrm-field-group">
              <label className="vrm-label">Axis assignments</label>
              <div className="vrm-axis-grid">
                {draftState.yMetrics.map(metric => (
                  <div key={metric} className="vrm-axis-row">
                    <span className="vrm-text-secondary">{metric}</span>
                    <select
                      className="vrm-select"
                      value={draftState.axisAssignments[metric] ?? 'events'}
                      onChange={event => {
                        const axis = event.target.value as AnalyticsAxisKey;
                        setDraftState(prev => ({
                          ...prev,
                          axisAssignments: { ...prev.axisAssignments, [metric]: axis },
                        }));
                      }}
                    >
                      {AXIS_OPTIONS.map(option => (
                        <option key={`${metric}-${option.value}`} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div className="vrm-builder-filters">
              <div className="vrm-builder-filters-header">
                <span className="vrm-label">Filters</span>
              </div>
              <FilterNodeEditor
                node={draftState.filters}
                onUpdate={node => setDraftState(prev => ({ ...prev, filters: node as AnalyticsFilterGroup }))}
                onRemove={() => setDraftState(prev => ({ ...prev, filters: createFilterGroup('AND') }))}
              />
            </div>

            <div className="vrm-builder-actions">
              <button type="button" className="vrm-btn vrm-btn-secondary" onClick={handlePreview}>
                Preview
              </button>
              <button type="button" className="vrm-btn" onClick={handleApply}>
                Apply
              </button>
              <button type="button" className="vrm-btn vrm-btn-tertiary" onClick={handleCancel}>
                Cancel
              </button>
              <div className="vrm-builder-save">
                <input
                  className="vrm-input"
                  type="text"
                  placeholder="View name"
                  value={newViewName}
                  onChange={event => setNewViewName(event.target.value)}
                />
                <input
                  className="vrm-input"
                  type="text"
                  placeholder="Description (optional)"
                  value={newViewDescription}
                  onChange={event => setNewViewDescription(event.target.value)}
                />
                <button type="button" className="vrm-btn vrm-btn-secondary" onClick={handleSaveView}>
                  Save view
                </button>
              </div>
            </div>
          </div>
        )}

        <div id={chartDomId}>
          <AnalyticsChart
            cardId="analytics-explorer-chart"
            result={analyticsResult}
            series={seriesDefinitions}
            visibility={visibility}
            isLoading={false}
            onZoomToRange={builderState.xAxis === 'time_bucket' ? handleZoomToRange : undefined}
          />
        </div>
      </section>
    </div>
  );
};

export default AnalyticsExplorer;
