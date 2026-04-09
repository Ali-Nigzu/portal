import type { ChartSeries } from "../../../schemas/charting";
import type { SeriesVisibilityMap } from "../managers";

const SITE_FLOW_ACTIVITY_COLORS: Record<string, string> = {
  entrances: "#47c96f",
  exits: "#ff5964",
  occupancy: "#2685ff",
};
interface SeriesLegendProps {
  series: ChartSeries[];
  visibility: SeriesVisibilityMap;
  onToggleSeries?: (seriesId: string) => void;
  hideInactive?: boolean;
  siteFlowActivity?: boolean;
}
export const SeriesLegend = ({
  series,
  visibility,
  onToggleSeries,
  hideInactive = false,
  siteFlowActivity = false,
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
        const swatchColor =
          siteFlowActivity && SITE_FLOW_ACTIVITY_COLORS[item.id]
            ? SITE_FLOW_ACTIVITY_COLORS[item.id]
            : (item.color ?? "#2685ff");
        const itemStyle = siteFlowActivity
          ? {
              borderColor: active ? swatchColor : "var(--line-default)",
              background: active
                ? `color-mix(in srgb, ${swatchColor} 18%, transparent)`
                : undefined,
            }
          : undefined;
        return (
          <button
            key={item.id}
            type="button"
            className={`legend-item ${active ? "active" : "inactive"}`}
            onClick={() => onToggleSeries(item.id)}
            aria-pressed={active}
            title={active ? "Hide series" : "Show series"}
            style={itemStyle}
          >
            <span
              className="legend-swatch"
              style={{
                backgroundColor: swatchColor,
              }}
            />
            <span className="legend-label">{item.label ?? item.id}</span>
          </button>
        );
      })}{" "}
    </div>
  );
};
