import type { ChartSeries } from "../../../schemas/charting";
import type { SeriesVisibilityMap } from "../managers";
interface SeriesLegendProps {
  series: ChartSeries[];
  visibility: SeriesVisibilityMap;
  onToggleSeries?: (seriesId: string) => void;
  hideInactive?: boolean;
}
export const SeriesLegend = ({
  series,
  visibility,
  onToggleSeries,
  hideInactive = false,
}: SeriesLegendProps) => {
  if (!onToggleSeries) {
    return null;
  }
  const visibleSeries = series.filter((item) => {
    if (item.hideInLegend) {
      return false;
    }
    if (hideInactive) {
      return visibility[item.id] !== false;
    }
    return true;
  });
  return (
    <div className="analytics-series-legend">
      {" "}
      {visibleSeries.map((item) => {
        const active = visibility[item.id] ?? true;
        return (
          <button
            key={item.id}
            type="button"
            className={`legend-item ${active ? "active" : "inactive"}`}
            onClick={() => onToggleSeries(item.id)}
            aria-pressed={active}
            title={active ? "Hide series" : "Show series"}
          >
            <span
              className="legend-swatch"
              style={{
                backgroundColor:
                  item.color ?? "var(--vrm-color-accent-occupancy, #9b7420)",
              }}
            />
            <span className="legend-label">{item.label ?? item.id}</span>
          </button>
        );
      })}{" "}
    </div>
  );
};
