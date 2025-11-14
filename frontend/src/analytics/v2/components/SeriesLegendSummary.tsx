import { useMemo, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { ChartResult } from '../../schemas/charting';
import type { SeriesVisibilityMap } from '../../components/ChartRenderer/managers';
import { PaletteManager } from '../../components/ChartRenderer/managers';

interface SeriesLegendSummaryProps {
  result?: ChartResult;
  visibility?: SeriesVisibilityMap | null;
}

interface SeriesSummaryItem {
  id: string;
  label: string;
  color: string;
  visible: boolean;
}

export const SeriesLegendSummary = ({ result, visibility }: SeriesLegendSummaryProps) => {
  const listRef = useRef<HTMLUListElement>(null);
  const items = useMemo<SeriesSummaryItem[]>(() => {
    if (!result || !result.series.length) {
      return [];
    }
    const palette = new PaletteManager();
    return result.series.map((series) => ({
      id: series.id,
      label: series.label ?? series.id,
      color: series.color ?? palette.getColor(series.id),
      visible: visibility?.[series.id] ?? true,
    }));
  }, [result, visibility]);

  if (!items.length) {
    return null;
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLLIElement>, index: number) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }
    event.preventDefault();
    const listNode = listRef.current;
    if (!listNode) {
      return;
    }
    const focusables = Array.from(listNode.querySelectorAll<HTMLLIElement>('li[tabindex="0"]'));
    const targetIndex = event.key === 'ArrowDown' ? index + 1 : index - 1;
    if (targetIndex >= 0 && targetIndex < focusables.length) {
      focusables[targetIndex]?.focus();
    }
  };

  return (
    <div className="analyticsV2Inspector__section">
      <h4>Series</h4>
      <ul className="analyticsV2SeriesSummary" ref={listRef}>
        {items.map((item, index) => (
          <li
            key={item.id}
            tabIndex={0}
            onKeyDown={(event) => handleKeyDown(event, index)}
            aria-label={`${item.label} series ${item.visible ? 'visible' : 'hidden'}`}
          >
            <span className="analyticsV2SeriesSummary__swatch" style={{ backgroundColor: item.color }} />
            <span className="analyticsV2SeriesSummary__label">{item.label}</span>
            <span className={`analyticsV2SeriesSummary__status ${item.visible ? 'is-visible' : 'is-hidden'}`}>
              {item.visible ? 'Visible' : 'Hidden'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
