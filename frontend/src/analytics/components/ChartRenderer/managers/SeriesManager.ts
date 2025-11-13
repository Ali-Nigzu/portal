import { ChartSeries } from "../../../schemas/charting";

export type SeriesVisibilityMap = Record<string, boolean>;

export class SeriesManager {
  private visibility: Map<string, boolean>;

  constructor(series: ChartSeries[], initial?: SeriesVisibilityMap) {
    this.visibility = new Map(
      series.map((s) => [s.id, initial?.[s.id] ?? true] as const)
    );
  }

  isVisible(seriesId: string): boolean {
    return this.visibility.get(seriesId) ?? false;
  }

  toggle(seriesId: string): void {
    if (!this.visibility.has(seriesId)) {
      return;
    }
    this.visibility.set(seriesId, !this.visibility.get(seriesId));
  }

  setVisibility(seriesId: string, visible: boolean): void {
    if (!this.visibility.has(seriesId)) {
      return;
    }
    this.visibility.set(seriesId, visible);
  }

  getVisibleSeries(): Set<string> {
    return new Set(
      Array.from(this.visibility.entries())
        .filter(([, visible]) => visible)
        .map(([id]) => id)
    );
  }

  toObject(): SeriesVisibilityMap {
    const result: SeriesVisibilityMap = {};
    this.visibility.forEach((visible, id) => {
      result[id] = visible;
    });
    return result;
  }
}
