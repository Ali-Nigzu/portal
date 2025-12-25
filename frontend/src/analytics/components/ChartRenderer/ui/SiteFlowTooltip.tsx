import type { TooltipContentProps } from "recharts";
import type { ChartSeries } from "../../../schemas/charting";
import type { SeriesVisibilityMap } from "../managers";
import { formatValue } from "../utils/format";
import { formatTooltipTimestamp } from "../utils/formatTooltipTimestamp";

type SiteFlowTooltipProps = Partial<TooltipContentProps<number, string>> & {
  seriesMap: Map<string, ChartSeries>;
  visibility: SeriesVisibilityMap;
};

type OccupancyValues = {
  avg?: number | null;
  min?: number | null;
  max?: number | null;
};

const OCCUPANCY_IDS = new Set(["occupancy_avg", "occupancy_min", "occupancy_max"]);

const resolveOccupancyValues = (
  payload: NonNullable<TooltipContentProps<number, string>["payload"]>,
): OccupancyValues => {
  const values: OccupancyValues = {};
  payload.forEach((entry) => {
    const seriesId = String(entry.dataKey);
    if (!OCCUPANCY_IDS.has(seriesId)) {
      return;
    }
    if (seriesId === "occupancy_avg") {
      values.avg = entry.value as number | null | undefined;
    }
    if (seriesId === "occupancy_min") {
      values.min = entry.value as number | null | undefined;
    }
    if (seriesId === "occupancy_max") {
      values.max = entry.value as number | null | undefined;
    }
  });
  return values;
};

export const SiteFlowTooltip = ({
  active,
  payload,
  label,
  seriesMap,
  visibility,
}: SiteFlowTooltipProps) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const formattedLabel = formatTooltipTimestamp(String(label ?? ""));
  const occupancyVisible = visibility.occupancy_avg ?? visibility.occupancy ?? false;
  const occupancyValues = occupancyVisible ? resolveOccupancyValues(payload) : {};

  const rows = payload
    .filter((entry) => visibility[String(entry.dataKey)] !== false)
    .filter((entry) => {
      const seriesId = String(entry.dataKey);
      if (OCCUPANCY_IDS.has(seriesId)) {
        return false;
      }
      const series = seriesMap.get(seriesId);
      return !series?.hideInTooltip;
    });

  return (
    <div className="analytics-chart-tooltip">
      <div className="tooltip-header">{formattedLabel}</div>
      <ul>
        {rows.map((entry) => {
          const seriesId = String(entry.dataKey);
          const series = seriesMap.get(seriesId);
          return (
            <li key={seriesId}>
              <span className="series-label">
                <span
                  className="swatch"
                  style={{ backgroundColor: entry.color ?? series?.color ?? "#2d6cdf" }}
                />
                {series?.label ?? seriesId}
              </span>
              <span className="series-value">
                {formatValue(entry.value as number | null | undefined, series?.unit)}
              </span>
            </li>
          );
        })}
        {occupancyVisible ? (
          <li key="occupancy-summary">
            <span className="series-label">
              <span
                className="swatch"
                style={{
                  backgroundColor:
                    seriesMap.get("occupancy_avg")?.color ??
                    seriesMap.get("occupancy_min")?.color ??
                    "var(--vrm-color-accent-occupancy, #2d6cdf)",
                }}
              />
              Occupancy
            </span>
            <span className="series-value">
              {formatValue(occupancyValues.avg, "people")}
            </span>
            <span className="series-meta">
              Min: {formatValue(occupancyValues.min, "people")} &nbsp; Max:{" "}
              {formatValue(occupancyValues.max, "people")}
            </span>
          </li>
        ) : null}
      </ul>
    </div>
  );
};
