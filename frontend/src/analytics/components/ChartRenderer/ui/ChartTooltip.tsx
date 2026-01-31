import type { TooltipContentProps } from "recharts";
import type { ChartSeries } from "../../../schemas/charting";
import type { SeriesMetaEntry } from "../primitives/utils";
import {
  formatCoverage,
  formatNumeric,
  formatValue,
  shouldShowRawCount,
} from "../utils/format";
type ChartTooltipProps = Partial<TooltipContentProps<number, string>> & {
  meta: Record<string, Record<string, SeriesMetaEntry>>;
  seriesMap: Map<string, ChartSeries>;
  variant?: "site_flow_activity";
};
export const ChartTooltip = ({
  active,
  payload,
  label,
  meta,
  seriesMap,
  variant,
}: ChartTooltipProps) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const xKey = String(payload[0]?.payload?.x ?? label ?? "");
  const xMeta = meta[xKey] ?? {};
  if (variant === "site_flow_activity") {
    const entryById = new Map(
      payload.map((entry) => [String(entry.dataKey), entry]),
    );
    const exitsEntry = entryById.get("exits");
    const entrancesEntry = entryById.get("entrances");
    const occupancyEntry = entryById.get("occupancy");
    const occupancyPayload =
      (occupancyEntry?.payload as Record<string, number | null | undefined>) ??
      {};
    const occupancyMin = occupancyPayload.occupancy_min ?? null;
    const occupancyMax = occupancyPayload.occupancy_max ?? null;
    return (
      <div className="analytics-chart-tooltip">
        <ul>
          <li>
            <span className="series-label">Exit</span>
            <span className="series-value">
              {formatNumeric(exitsEntry?.value as number | null | undefined)}
            </span>
          </li>
          <li>
            <span className="series-label">Entrance</span>
            <span className="series-value">
              {formatNumeric(entrancesEntry?.value as number | null | undefined)}
            </span>
          </li>
          <li>
            <span className="series-label">Occupancy</span>
            <span className="series-value">
              {formatNumeric(
                occupancyEntry?.value as number | null | undefined,
              )}
            </span>
          </li>
          <li>
            <span className="series-label">min</span>
            <span className="series-value">{formatNumeric(occupancyMin)}</span>
          </li>
          <li>
            <span className="series-label">max</span>
            <span className="series-value">{formatNumeric(occupancyMax)}</span>
          </li>
        </ul>
      </div>
    );
  }
  return (
    <div className="analytics-chart-tooltip">
      <div className="tooltip-header">{label}</div>
      <ul>
        {" "}
        {payload
          .map((entry) => {
            const seriesId = String(entry.dataKey);
            const series = seriesMap.get(seriesId);
            if (series?.hideInTooltip) {
              return null;
            }
            const datumMeta = xMeta[seriesId];
            const coverage = datumMeta?.coverage ?? null;
            const rawCount = datumMeta?.rawCount ?? null;
            const coverageInfo = formatCoverage(coverage);
            const showRaw = shouldShowRawCount(rawCount);
            const coverageClass =
              coverageInfo.tone === "critical"
                ? "coverage-critical"
                : coverageInfo.tone === "low"
                  ? "coverage-low"
                  : undefined;
            const highlight = coverageInfo.tone !== "normal";
            return (
              <li key={seriesId} className={highlight ? "low" : undefined}>
                <span className="series-label">
                  <span
                    className="swatch"
                    style={{
                      backgroundColor:
                        entry.color ?? series?.color ?? "#2d6cdf",
                    }}
                  />{" "}
                  {series?.label ?? seriesId}{" "}
                </span>
                <span className="series-value">
                  {" "}
                  {formatValue(
                    (series?.tooltipValueKey
                      ? ((entry.payload as
                          | Record<string, unknown>
                          | undefined) ?? {})[series.tooltipValueKey]
                      : entry.value) as number | null | undefined,
                    series?.unit,
                  )}{" "}
                </span>{" "}
                {showRaw ? (
                  <span className="series-meta">raw: {rawCount}</span>
                ) : null}{" "}
                <span className={`series-coverage ${coverageClass ?? ""}`}>
                  {" "}
                  coverage: {coverageInfo.label}{" "}
                </span>
              </li>
            );
          })
          .filter(Boolean)}{" "}
      </ul>
    </div>
  );
};
