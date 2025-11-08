import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  CompareOption,
  GranularityOption,
  RangePreset,
  ScopeOption,
  SegmentOption,
} from '../styles/designTokens';

export interface CustomRange {
  from: string;
  to: string;
}

export type SystemStatus = 'ok' | 'warning' | 'critical';

interface GlobalControlsState {
  rangePreset: RangePreset;
  customRange?: CustomRange;
  granularity: GranularityOption;
  scope: ScopeOption;
  segments: SegmentOption[];
  compare: CompareOption;
  realtime: boolean;
  lastUpdated?: string;
  systemStatus: SystemStatus;
  localTime: string;
}

interface GlobalControlsContextValue extends GlobalControlsState {
  setRangePreset: (preset: RangePreset) => void;
  setCustomRange: (range?: CustomRange) => void;
  setGranularity: (value: GranularityOption) => void;
  setScope: (value: ScopeOption) => void;
  toggleSegment: (segment: SegmentOption) => void;
  setCompare: (value: CompareOption) => void;
  setRealtime: (value: boolean) => void;
  stepRange: (direction: 'forward' | 'backward') => void;
  updateLastUpdated: (isoString: string) => void;
  setSystemStatus: (status: SystemStatus) => void;
}

const GlobalControlsContext = createContext<GlobalControlsContextValue | undefined>(undefined);

const formatLocalTime = () => new Date().toLocaleString();
const STORAGE_KEY = 'camOS.globalControls';

interface PersistedState {
  rangePreset: RangePreset;
  customRange?: CustomRange;
  granularity: GranularityOption;
  scope: ScopeOption;
  segments: SegmentOption[];
  compare: CompareOption;
  realtime: boolean;
  lastUpdated?: string;
  systemStatus: SystemStatus;
}

const getInitialState = (): PersistedState => {
  if (typeof window === 'undefined') {
    return {
      rangePreset: 'last_7_days',
      customRange: undefined,
      granularity: 'auto',
      scope: 'all_cameras',
      segments: [],
      compare: 'off',
      realtime: false,
      lastUpdated: new Date().toISOString(),
      systemStatus: 'ok',
    };
  }

  const defaultState: PersistedState = {
    rangePreset: 'last_7_days',
    customRange: undefined,
    granularity: 'auto',
    scope: 'all_cameras',
    segments: [],
    compare: 'off',
    realtime: false,
    lastUpdated: new Date().toISOString(),
    systemStatus: 'ok',
  };

  const persisted = window.sessionStorage.getItem(STORAGE_KEY);
  if (!persisted) {
    return defaultState;
  }

  try {
    const parsed = JSON.parse(persisted) as Partial<PersistedState> | undefined;
    if (!parsed) {
      return defaultState;
    }

    return {
      rangePreset: parsed.rangePreset ?? defaultState.rangePreset,
      customRange: parsed.customRange,
      granularity: parsed.granularity ?? defaultState.granularity,
      scope: parsed.scope ?? defaultState.scope,
      segments: Array.isArray(parsed.segments) ? parsed.segments : defaultState.segments,
      compare: parsed.compare ?? defaultState.compare,
      realtime: typeof parsed.realtime === 'boolean' ? parsed.realtime : defaultState.realtime,
      lastUpdated: parsed.lastUpdated ?? defaultState.lastUpdated,
      systemStatus: parsed.systemStatus ?? defaultState.systemStatus,
    };
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.info('Using default global controls state');
    }
    return defaultState;
  }
};

export const GlobalControlsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialState = useMemo(getInitialState, []);

  const [rangePreset, setRangePresetState] = useState<RangePreset>(initialState.rangePreset);
  const [customRange, setCustomRangeState] = useState<CustomRange | undefined>(initialState.customRange);
  const [granularity, setGranularityState] = useState<GranularityOption>(initialState.granularity);
  const [scope, setScopeState] = useState<ScopeOption>(initialState.scope);
  const [segments, setSegments] = useState<SegmentOption[]>(initialState.segments);
  const [compare, setCompareState] = useState<CompareOption>(initialState.compare);
  const [realtime, setRealtimeState] = useState<boolean>(initialState.realtime);
  const [lastUpdated, setLastUpdated] = useState<string | undefined>(initialState.lastUpdated);
  const [systemStatus, setSystemStatusState] = useState<SystemStatus>(initialState.systemStatus);
  const [localTime, setLocalTime] = useState<string>(formatLocalTime());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLocalTime(formatLocalTime());
    }, 1000 * 60);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const persistable: PersistedState = {
      rangePreset,
      customRange,
      granularity,
      scope,
      segments,
      compare,
      realtime,
      lastUpdated,
      systemStatus,
    };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
  }, [
    rangePreset,
    customRange,
    granularity,
    scope,
    segments,
    compare,
    realtime,
    lastUpdated,
    systemStatus,
  ]);

  const toggleSegment = useCallback((segment: SegmentOption) => {
    setSegments((prev) =>
      prev.includes(segment) ? prev.filter((item) => item !== segment) : [...prev, segment]
    );
  }, []);

  const stepRange = useCallback(
    (direction: 'forward' | 'backward') => {
      const directionValue = direction === 'forward' ? 1 : -1;
      const presets: RangePreset[] = [
        'last_2_days',
        'last_7_days',
        'last_30_days',
        'last_12_weeks',
        'last_6_months',
        'last_12_months',
        'today',
        'yesterday',
        'this_week',
        'this_month',
        'this_year',
        'previous_week',
        'previous_month',
        'last_hour',
        'last_3_hours',
        'last_6_hours',
        'last_12_hours',
        'last_24_hours',
        'last_48_hours',
      ];

      const currentIndex = presets.indexOf(rangePreset);
      if (currentIndex === -1) {
        return;
      }

      const nextIndex = Math.min(Math.max(currentIndex + directionValue, 0), presets.length - 1);
      setRangePresetState(presets[nextIndex]);
    },
    [rangePreset]
  );

  const value = useMemo<GlobalControlsContextValue>(
    () => ({
      rangePreset,
      customRange,
      granularity,
      scope,
      segments,
      compare,
      realtime,
      lastUpdated,
      systemStatus,
      localTime,
      setRangePreset: setRangePresetState,
      setCustomRange: setCustomRangeState,
      setGranularity: setGranularityState,
      setScope: setScopeState,
      toggleSegment,
      setCompare: setCompareState,
      setRealtime: setRealtimeState,
      stepRange,
      updateLastUpdated: setLastUpdated,
      setSystemStatus: setSystemStatusState,
    }),
    [
      rangePreset,
      customRange,
      granularity,
      scope,
      segments,
      compare,
      realtime,
      lastUpdated,
      systemStatus,
      localTime,
      stepRange,
      toggleSegment,
    ]
  );

  return <GlobalControlsContext.Provider value={value}>{children}</GlobalControlsContext.Provider>;
};

export const useGlobalControls = () => {
  const context = useContext(GlobalControlsContext);
  if (!context) {
    throw new Error('useGlobalControls must be used within a GlobalControlsProvider');
  }
  return context;
};
