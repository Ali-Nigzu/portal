import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CompareOption,
  GranularityOption,
  RangePreset,
  ScopeOption,
  SegmentOption,
} from '../styles/designTokens';
import { CustomRange, useGlobalControls } from '../context/GlobalControlsContext';

export interface CardControlState {
  rangePreset: RangePreset;
  customRange?: CustomRange;
  granularity: GranularityOption;
  scope: ScopeOption;
  segments: SegmentOption[];
  compare: CompareOption;
}

const STORAGE_NAMESPACE = 'camOS.cardControls';

type CardControlHandlers = {
  state: CardControlState;
  isSynced: boolean;
  setRangePreset: (preset: RangePreset) => void;
  setCustomRange: (range?: CustomRange) => void;
  setGranularity: (granularity: GranularityOption) => void;
  setScope: (scope: ScopeOption) => void;
  toggleSegment: (segment: SegmentOption) => void;
  setCompare: (compare: CompareOption) => void;
  resync: () => void;
};

const createStorageKey = (routeKey: string, cardId: string) =>
  `${STORAGE_NAMESPACE}.${routeKey}.${cardId}`;

const areArraysEqual = <T,>(a: T[], b: T[]) => {
  if (a.length !== b.length) {
    return false;
  }
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
};

const statesEqual = (a: CardControlState, b: CardControlState) =>
  a.rangePreset === b.rangePreset &&
  a.granularity === b.granularity &&
  a.scope === b.scope &&
  a.compare === b.compare &&
  areArraysEqual(a.segments, b.segments) &&
  ((a.customRange?.from ?? null) === (b.customRange?.from ?? null)) &&
  ((a.customRange?.to ?? null) === (b.customRange?.to ?? null));

const loadPersistedState = (
  storageKey: string,
  fallback: CardControlState,
): CardControlState => {
  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as Partial<CardControlState>;
    if (!parsed) {
      return fallback;
    }
    return {
      rangePreset: parsed.rangePreset ?? fallback.rangePreset,
      customRange: parsed.customRange ?? fallback.customRange,
      granularity: parsed.granularity ?? fallback.granularity,
      scope: parsed.scope ?? fallback.scope,
      segments: Array.isArray(parsed.segments) ? (parsed.segments as SegmentOption[]) : fallback.segments,
      compare: parsed.compare ?? fallback.compare,
    };
  } catch (error) {
    console.warn('Failed to load card controls state', error);
    return fallback;
  }
};

const persistState = (storageKey: string, state: CardControlState) => {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(storageKey, JSON.stringify(state));
};

export const useCardControls = (
  routeKey: string,
  cardId: string,
  onChange?: (state: CardControlState) => void,
): CardControlHandlers => {
  const {
    rangePreset: globalRangePreset,
    customRange: globalCustomRange,
    granularity: globalGranularity,
    scope: globalScope,
    segments: globalSegments,
    compare: globalCompare,
  } = useGlobalControls();

  const defaultState = useMemo<CardControlState>(
    () => ({
      rangePreset: globalRangePreset,
      customRange: globalCustomRange,
      granularity: globalGranularity,
      scope: globalScope,
      segments: globalSegments,
      compare: globalCompare,
    }),
    [
      globalRangePreset,
      globalCustomRange,
      globalGranularity,
      globalScope,
      globalSegments,
      globalCompare,
    ],
  );

  const storageKey = useMemo(() => createStorageKey(routeKey, cardId), [routeKey, cardId]);
  const [state, setState] = useState<CardControlState>(() => loadPersistedState(storageKey, defaultState));

  const isSynced = statesEqual(state, defaultState);

  useEffect(() => {
    if (isSynced) {
      setState(defaultState);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultState]);
  useEffect(() => {
    persistState(storageKey, state);
    if (onChange) {
      onChange(state);
    }
  }, [state, storageKey, onChange]);

  const setRangePreset = useCallback((preset: RangePreset) => {
    setState(prev => ({
      ...prev,
      rangePreset: preset,
      customRange: preset === 'custom' ? prev.customRange : undefined,
    }));
  }, []);

  const setCustomRange = useCallback((range?: CustomRange) => {
    setState(prev => ({
      ...prev,
      rangePreset: range ? 'custom' : prev.rangePreset,
      customRange: range,
    }));
  }, []);

  const setGranularity = useCallback((granularity: GranularityOption) => {
    setState(prev => ({ ...prev, granularity }));
  }, []);

  const setScope = useCallback((scope: ScopeOption) => {
    setState(prev => ({ ...prev, scope }));
  }, []);

  const toggleSegment = useCallback((segment: SegmentOption) => {
    setState(prev => ({
      ...prev,
      segments: prev.segments.includes(segment)
        ? prev.segments.filter(item => item !== segment)
        : [...prev.segments, segment],
    }));
  }, []);

  const setCompare = useCallback((compare: CompareOption) => {
    setState(prev => ({ ...prev, compare }));
  }, []);

  const resync = useCallback(() => {
    setState(defaultState);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(storageKey);
    }
  }, [defaultState, storageKey]);

  return {
    state,
    isSynced,
    setRangePreset,
    setCustomRange,
    setGranularity,
    setScope,
    toggleSegment,
    setCompare,
    resync,
  };
};
