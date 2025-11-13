import type { ChartResult, ChartSeries, ChartType } from "../../schemas/charting";

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

function validateSeriesData(series: ChartSeries[], chartType: ChartType): ValidationIssue[] {
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
        if (Number.isNaN(point.coverage) || point.coverage < 0 || point.coverage > 1) {
          issues.push({
            code: "coverage_range",
            message: `Coverage for ${seriesItem.id} bucket ${point.x} is outside 0–1.`,
          });
        }
      }

      if (point.value !== undefined && point.value !== null && Number.isNaN(point.value)) {
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
        (point.value !== undefined && point.value !== null && !Number.isFinite(point.value)) ||
        (point.y !== undefined && point.y !== null && !Number.isFinite(point.y))
      ) {
        issues.push({
          code: "value_range",
          message: `Series ${seriesItem.id} bucket ${point.x} must contain a finite value.`,
        });
      }
    });

    if (chartType !== "heatmap" && chartType !== "retention") {
      if (referenceOrder.length !== seriesItem.data.length) {
        issues.push({
          code: "bucket_mismatch",
          message: `Series ${seriesItem.id} has a different bucket count than the first series.`,
        });
      }

      seriesItem.data.forEach((point, idx) => {
        if (referenceOrder[idx] !== undefined && referenceOrder[idx] !== point.x) {
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

  if (chartType !== "heatmap" && chartType !== "retention") {
    if (referenceOrder.length !== seenBuckets.size) {
      issues.push({
        code: "duplicate_bucket",
        message: "Duplicate bucket keys detected in chart result.",
      });
    }
  }

  return issues;
}

function validateHeatmap(series: ChartSeries[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const heatmapSeries = series[0];
  if (!heatmapSeries) {
    return issues;
  }

  const rows = new Map<string, Set<string>>();
  const columns = new Set<string>();

  heatmapSeries.data.forEach((point, index) => {
    const row = point.group;
    const column = point.x;
    if (row === undefined || row === null || row === "") {
      issues.push({
        code: "missing_row",
        message: `Heatmap row dimension missing for bucket index ${index}.`,
      });
    }
    if (column === undefined || column === null) {
      issues.push({
        code: "missing_column",
        message: `Heatmap column dimension missing for bucket index ${index}.`,
      });
    }

    const rowKey = String(row);
    const columnKey = String(column);
    columns.add(columnKey);

    if (!rows.has(rowKey)) {
      rows.set(rowKey, new Set());
    }
    if (rows.get(rowKey)!.has(columnKey)) {
      issues.push({
        code: "duplicate_cell",
        message: `Heatmap cell ${rowKey} / ${columnKey} provided more than once.`,
      });
    }
    rows.get(rowKey)!.add(columnKey);
  });

  const columnCount = columns.size;
  rows.forEach((rowColumns, rowKey) => {
    if (rowColumns.size !== columnCount) {
      issues.push({
        code: "heatmap_grid_gap",
        message: `Heatmap row "${rowKey}" is missing one or more cohort columns.`,
      });
    }
  });

  return issues;
}

export function validateChartResult(result: ChartResult): ValidationIssue[] {
  if (!result || !result.series) {
    return [
      { code: "invalid_result", message: "Chart result payload missing series array." },
    ];
  }

  const issues = validateSeriesData(result.series, result.chartType);

  if (result.chartType === "heatmap" || result.chartType === "retention") {
    issues.push(...validateHeatmap(result.series));
  }

  return issues;
}
