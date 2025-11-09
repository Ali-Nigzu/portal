import { useCallback, useEffect, useMemo, useState } from 'react';

export interface SeriesConfig {
  key: string;
  defaultVisible?: boolean;
}

const STORAGE_NAMESPACE = 'camOS.seriesVisibility';

const createStorageKey = (routeKey: string, cardId: string) =>
  `${STORAGE_NAMESPACE}.${routeKey}.${cardId}`;

interface StoredVisibility {
  [seriesKey: string]: boolean;
}

export const useSeriesVisibility = (
  routeKey: string,
  cardId: string,
  series: SeriesConfig[],
) => {
  const storageKey = useMemo(() => createStorageKey(routeKey, cardId), [routeKey, cardId]);
  const defaultState = useMemo(() => {
    return series.reduce<StoredVisibility>((acc, item) => {
      acc[item.key] = item.defaultVisible !== false;
      return acc;
    }, {});
  }, [series]);

  const [visibility, setVisibility] = useState<StoredVisibility>(() => {
    if (typeof window === 'undefined') {
      return defaultState;
    }
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        return defaultState;
      }
      const parsed = JSON.parse(raw) as StoredVisibility;
      return {
        ...defaultState,
        ...parsed,
      };
    } catch (error) {
      console.warn('Failed to load series visibility', error);
      return defaultState;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(storageKey, JSON.stringify(visibility));
  }, [storageKey, visibility]);

  useEffect(() => {
    setVisibility(prev => ({ ...defaultState, ...prev }));
  }, [defaultState]);

  const toggleSeries = useCallback((key: string) => {
    setVisibility(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const setAll = useCallback((nextVisibility: StoredVisibility) => {
    setVisibility(nextVisibility);
  }, []);

  return {
    visibility,
    toggleSeries,
    setAll,
  };
};
