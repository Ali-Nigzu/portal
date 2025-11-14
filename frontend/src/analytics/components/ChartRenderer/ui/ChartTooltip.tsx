import type { TooltipContentProps } from "recharts";
import type { ChartSeries } from "../../../schemas/charting";
import type { SeriesMetaEntry } from "../primitives/utils";
import { formatCoverage, formatValue, shouldShowRawCount } from "../utils/format";

type ChartTooltipProps = Partial<TooltipContentProps<number, string>> & {
  meta: Record<string, Record<string, SeriesMetaEntry>>;
  seriesMap: Map<string, ChartSeries>;
};

export const ChartTooltip = ({
  active,
  payload,
  label,
  meta,
  seriesMap,
}: ChartTooltipProps) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const xKey = String(payload[0]?.payload?.x ?? label ?? "");
  const xMeta = meta[xKey] ?? {};

  return (
    <div className="analytics-chart-tooltip">
      <div className="tooltip-header">{label}</div>
      <ul>
        {payload.map((entry) => {
          const seriesId = String(entry.dataKey);
          const series = seriesMap.get(seriesId);
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
                  style={{ backgroundColor: entry.color ?? series?.color ?? "#2d6cdf" }}
                />
                {series?.label ?? seriesId}
              </span>
              <span className="series-value">
                {formatValue(entry.value as number | null | undefined, series?.unit)}
              </span>
              {showRaw ? (
                <span className="series-meta">raw: {rawCount}</span>
              ) : null}
              <span className={`series-coverage ${coverageClass ?? ""}`}>
                coverage: {coverageInfo.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
