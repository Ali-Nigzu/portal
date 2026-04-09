import type { TooltipContentProps } from "recharts";
import type { ChartSeries } from "../../../schemas/charting";
import type { SeriesMetaEntry } from "../primitives/utils";
import {
  formatCoverage,
  formatNumeric,
  formatValue,
  shouldShowRawCount,
} from "../utils/format";
import { formatSiteFlowTick } from "../utils/formatSiteFlowTick";
import { SITE_FLOW_ACTIVITY_COLORS } from "../../../../lib/siteFlowActivityColors";
type ChartTooltipProps = Partial<TooltipContentProps<number, string>> & {
  meta: Record<string, Record<string, SeriesMetaEntry>>;
  seriesMap: Map<string, ChartSeries>;
  variant?: "site_flow_activity";
  siteFlowTimeframe?: string;
  bucket?: string;
};
export const ChartTooltip = ({
  active,
  payload,
  label,
  meta,
  seriesMap,
  variant,
  siteFlowTimeframe,
  bucket,
}: ChartTooltipProps) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const xKey = String(payload[0]?.payload?.x ?? label ?? "");
  const xMeta = meta[xKey] ?? {};
  if (variant === "site_flow_activity") {
    // Site Flow Activity tooltip: top timeframe label + minimal rows.
    // Occupancy min/max block and pluralized Entrances/Exits labels are specific to this variant.
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
    const entranceColor = SITE_FLOW_ACTIVITY_COLORS.entrances;
    const exitColor = SITE_FLOW_ACTIVITY_COLORS.exits;
    const occupancyColor = SITE_FLOW_ACTIVITY_COLORS.occupancy;
    const rows: Array<JSX.Element> = [];
    if (entrancesEntry) {
      rows.push(
        <li key="entrances" className="tooltip-row">
          <span className="series-label" style={{ color: entranceColor }}>
            <span className="swatch" style={{ backgroundColor: entranceColor }} />
            Entrances
          </span>
          <span className="series-value" style={{ color: entranceColor }}>
            {formatNumeric(entrancesEntry.value as number | null | undefined)}
          </span>
        </li>,
      );
    }
    if (exitsEntry) {
      rows.push(
        <li key="exits" className="tooltip-row">
          <span className="series-label" style={{ color: exitColor }}>
            <span className="swatch" style={{ backgroundColor: exitColor }} />
            Exits
          </span>
          <span className="series-value" style={{ color: exitColor }}>
            {formatNumeric(exitsEntry.value as number | null | undefined)}
          </span>
        </li>,
      );
    }
    if (occupancyEntry) {
      const occupancyLabel = formatNumeric(
        occupancyEntry.value as number | null | undefined,
      );
      rows.push(
        <li key="occupancy" className="tooltip-row">
          <span className="series-label" style={{ color: occupancyColor }}>
            <span className="swatch" style={{ backgroundColor: occupancyColor }} />
            Occupancy
          </span>
          <span className="series-value" style={{ color: occupancyColor }}>
            <span className="tooltip-occupancy-value">
              <span className="tooltip-occupancy-number">{occupancyLabel}</span>
              <span className="tooltip-occupancy-range">
                <span className="tooltip-occupancy-max">
                  Max: {formatNumeric(occupancyMax)}
                </span>
                <span className="tooltip-occupancy-min">
                  Min: {formatNumeric(occupancyMin)}
                </span>
              </span>
            </span>
          </span>
        </li>,
      );
    }
    if (rows.length === 0) {
      return null;
    }
    const headerLabel = siteFlowTimeframe
      ? formatSiteFlowTick(siteFlowTimeframe, bucket, xKey)
      : xKey;
    return (
      <div className="analytics-chart-tooltip">
        <div className="tooltip-header">{headerLabel}</div>
        <ul>{rows}</ul>
      </div>
    );
  }
  return (
    <div className="analytics-chart-tooltip">
      <div className="tooltip-header">{label}</div>
      <ul>
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
                  />
                  {series?.label ?? seriesId}
                </span>
                <span className="series-value">
                  {formatValue(
                    (series?.tooltipValueKey
                      ? ((entry.payload as
                          | Record<string, unknown>
                          | undefined) ?? {})[series.tooltipValueKey]
                      : entry.value) as number | null | undefined,
                    series?.unit,
                  )}
                </span>
                {showRaw ? (
                  <span className="series-meta">raw: {rawCount}</span>
                ) : null}
                <span className={`series-coverage ${coverageClass ?? ""}`}>
                  coverage: {coverageInfo.label}
                </span>
              </li>
            );
          })
          .filter(Boolean)}
      </ul>
    </div>
  );
};
