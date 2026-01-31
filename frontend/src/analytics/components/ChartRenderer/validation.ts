import type {
  ChartResult,
  ChartSeries,
  ChartType,
} from "../../schemas/charting";
export interface ValidationIssue {
  code: string;
  message: string;
}
const SUPPORTED_UNITS = new Set<ChartSeries["unit"] | undefined | null>([
  "people",
  "events",
  "events/min",
  "minutes",
  "percentage",
  "count",
  undefined,
  null,
]);
interface ValidationOptions {
  allowMisalignedBuckets?: boolean;
}
const getSeriesBaseLabel = (series: ChartSeries): string => {
  const labelSource = series.label ?? series.id ?? "";
  const [base] = labelSource.split("|");
  return base.trim().toLowerCase();
};
const isSplitTimeSeries = (result: ChartResult): boolean => {
  if (!result?.series || result.series.length <= 1) {
    return false;
  }
  if (result.xDimension?.type !== "time") {
    return false;
  }
  const baseLabels = new Set(
    result.series.map((entry) => getSeriesBaseLabel(entry)),
  );
  const units = new Set(result.series.map((entry) => entry.unit ?? null));
  return baseLabels.size === 1 && units.size === 1;
};
function validateSeriesData(
  series: ChartSeries[],
  chartType: ChartType,
  options: ValidationOptions = {},
): ValidationIssue[] {
  if (series.length === 0) {
    return [
      {
        code: "no_series",
        message: "Chart result did not include any series to render.",
      },
    ];
  }
  const issues: ValidationIssue[] = [];
  const referenceOrder = series[0]?.data.map((point) => point.x) ?? [];
  const seenBuckets = new Set(referenceOrder);
  const allowMisalignedBuckets = options.allowMisalignedBuckets ?? false;
  series.forEach((seriesItem) => {
    if (!SUPPORTED_UNITS.has(seriesItem.unit)) {
      issues.push({
        code: "unsupported_unit",
        message: `Unsupported unit "${seriesItem.unit}" for series ${seriesItem.id}.`,
      });
    }
    seriesItem.data.forEach((point, index) => {
      if (point.x === undefined || point.x === null || point.x === "") {
        issues.push({
          code: "missing_bucket",
          message: `Series ${seriesItem.id} is missing an x bucket at position ${index}.`,
        });
      }
      if (point.coverage !== undefined && point.coverage !== null) {
        if (
          Number.isNaN(point.coverage) ||
          point.coverage < 0 ||
          point.coverage > 1
        ) {
          issues.push({
            code: "coverage_range",
            message: `Coverage for ${seriesItem.id} bucket ${point.x} is outside 0–1.`,
          });
        }
      }
      if (
        point.value !== undefined &&
        point.value !== null &&
        Number.isNaN(point.value)
      ) {
        issues.push({
          code: "value_nan",
          message: `Series ${seriesItem.id} bucket ${point.x} contains NaN value.`,
        });
      }
      if (point.y !== undefined && point.y !== null && Number.isNaN(point.y)) {
        issues.push({
          code: "value_nan",
          message: `Series ${seriesItem.id} bucket ${point.x} contains NaN value.`,
        });
      }
      if (
        (point.value !== undefined &&
          point.value !== null &&
          !Number.isFinite(point.value)) ||
        (point.y !== undefined && point.y !== null && !Number.isFinite(point.y))
      ) {
        issues.push({
          code: "value_range",
          message: `Series ${seriesItem.id} bucket ${point.x} must contain a finite value.`,
        });
      }
    });
    if (!allowMisalignedBuckets) {
      if (referenceOrder.length !== seriesItem.data.length) {
        issues.push({
          code: "bucket_mismatch",
          message: `Series ${seriesItem.id} has a different bucket count than the first series.`,
        });
      }
      seriesItem.data.forEach((point, idx) => {
        if (
          referenceOrder[idx] !== undefined &&
          referenceOrder[idx] !== point.x
        ) {
          issues.push({
            code: "bucket_mismatch",
            message: `Series ${seriesItem.id} bucket order differs at index ${idx}.`,
          });
        }
      });
    }
    seriesItem.data.forEach((point) => {
      seenBuckets.add(point.x);
    });
  });
  if (!allowMisalignedBuckets) {
    if (referenceOrder.length !== seenBuckets.size) {
      issues.push({
        code: "duplicate_bucket",
        message: "Duplicate bucket keys detected in chart result.",
      });
    }
  }
  return issues;
}
export function validateChartResult(result: ChartResult): ValidationIssue[] {
  if (!result || !result.series) {
    return [
      {
        code: "invalid_result",
        message: "Chart result payload missing series array.",
      },
    ];
  }
  const issues = validateSeriesData(result.series, result.chartType, {
    allowMisalignedBuckets: isSplitTimeSeries(result),
  });
  return issues;
}
