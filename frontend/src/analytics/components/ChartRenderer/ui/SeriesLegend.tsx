import type { ChartSeries } from "../../../schemas/charting";
import type { SeriesVisibilityMap } from "../managers";

interface SeriesLegendProps {
  series: ChartSeries[];
  visibility: SeriesVisibilityMap;
  onToggleSeries?: (seriesId: string) => void;
}

export const SeriesLegend = ({
  series,
  visibility,
  onToggleSeries,
}: SeriesLegendProps) => {
  if (!onToggleSeries) {
    return null;
  }

  return (
    <div className="analytics-series-legend">
      {series.map((item) => {
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
                  item.color ?? "var(--vrm-color-accent-occupancy, #2685ff)",
              }}
            />
            <span className="legend-label">{item.label ?? item.id}</span>
          </button>
        );
      })}
    </div>
  );
};
