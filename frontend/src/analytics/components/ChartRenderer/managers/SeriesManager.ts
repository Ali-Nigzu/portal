import { ChartSeries } from "../../../schemas/charting";
export type SeriesVisibilityMap = Record<string, boolean>;
export class SeriesManager {
  private visibility: Map<string, boolean>;
  private seriesById: Map<string, ChartSeries>;
  private seriesByGroup: Map<string, string[]>;
  constructor(series: ChartSeries[], initial?: SeriesVisibilityMap) {
    this.seriesById = new Map(series.map((item) => [item.id, item]));
    this.seriesByGroup = new Map();
    series.forEach((item) => {
      if (!item.seriesGroup) {
        return;
      }
      const ids = this.seriesByGroup.get(item.seriesGroup) ?? [];
      ids.push(item.id);
      this.seriesByGroup.set(item.seriesGroup, ids);
    });
    this.visibility = new Map(
      series.map((s) => [s.id, initial?.[s.id] ?? true] as const),
    );
  }
  isVisible(seriesId: string): boolean {
    return this.visibility.get(seriesId) ?? false;
  }
  toggle(seriesId: string): void {
    const series = this.seriesById.get(seriesId);
    if (!series || !this.visibility.has(seriesId)) {
      return;
    }
    const group = series.seriesGroup;
    if (group && this.seriesByGroup.has(group)) {
      const nextVisibility = !this.visibility.get(seriesId);
      (this.seriesByGroup.get(group) ?? []).forEach((id) => {
        if (this.visibility.has(id)) {
          this.visibility.set(id, nextVisibility);
        }
      });
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
        .map(([id]) => id),
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
