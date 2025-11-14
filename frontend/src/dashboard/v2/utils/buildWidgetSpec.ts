import type { ChartSpec, ChartDimension } from "../../../analytics/schemas/charting";
import type { DashboardWidget, DashboardTimeRangeOption } from "../types";

export interface BuildWidgetSpecOptions {
  timeRange?: DashboardTimeRangeOption;
  timezone?: string;
  anchor?: Date;
}

const MINUTE_IN_MS = 60 * 1000;
const TIMESTAMP_DIMENSION_ID = "timestamp";

function cloneSpec(spec: ChartSpec): ChartSpec {
  return JSON.parse(JSON.stringify(spec)) as ChartSpec;
}

function applyTimeRange(
  spec: ChartSpec,
  option: DashboardTimeRangeOption,
  timezone: string | undefined,
  anchor: Date,
): void {
  const timeWindow: ChartSpec["timeWindow"] = {
    ...(spec.timeWindow ?? { from: "", to: "" }),
  };
  const to = anchor.toISOString();
  const from = new Date(anchor.getTime() - option.durationMinutes * MINUTE_IN_MS).toISOString();
  timeWindow.from = from;
  timeWindow.to = to;
  if (option.bucket) {
    timeWindow.bucket = option.bucket;
  }
  if (timezone) {
    timeWindow.timezone = timezone;
  }
  spec.timeWindow = timeWindow;

  if (Array.isArray(spec.dimensions)) {
    spec.dimensions = spec.dimensions.map((dimension) => {
      if ((dimension as { id?: string }).id === TIMESTAMP_DIMENSION_ID) {
        const nextDimension = { ...dimension } as ChartSpec["dimensions"][number];
        if (option.bucket) {
          (nextDimension as ChartDimension).bucket = option.bucket;
        }
        return nextDimension;
      }
      return dimension;
    });
  }
}

export function buildWidgetSpec(
  widget: DashboardWidget,
  options: BuildWidgetSpecOptions = {},
): ChartSpec {
  if (!widget.inlineSpec) {
    throw new Error(`Widget ${widget.id} is missing inline spec`);
  }

  const spec = cloneSpec(widget.inlineSpec);

  if (options.timeRange) {
    applyTimeRange(spec, options.timeRange, options.timezone, options.anchor ?? new Date());
  }

  return spec;
}
