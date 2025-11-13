import { ChartSeries } from "../../../schemas/charting";

export type AxisBindingConfig = Record<string, "Y1" | "Y2" | "Y3">;

export interface AxisDescriptor {
  id: "Y1" | "Y2" | "Y3";
  unit: string;
  label?: string;
  visible: boolean;
  seriesIds: string[];
}

export interface AxisConfig {
  axes: AxisDescriptor[];
  bindings: AxisBindingConfig;
}

const AXIS_ORDER: Array<"Y1" | "Y2" | "Y3"> = ["Y1", "Y2", "Y3"];

export class AxisManager {
  private series: ChartSeries[];
  private maxAxes: number;

  constructor(series: ChartSeries[], maxAxes = 3) {
    this.series = series;
    this.maxAxes = maxAxes;
  }

  build(visibleSeries?: Set<string>): AxisConfig {
    const effectiveVisible = visibleSeries ?? new Set(this.series.map((s) => s.id));
    const units = this.collectUnits(effectiveVisible);
    const axes: AxisDescriptor[] = [];
    const bindings: AxisBindingConfig = {};

    const unitEntries = Array.from(units.entries()).slice(0, this.maxAxes);
    unitEntries.forEach(([unit, seriesIds], index) => {
      const axisId = AXIS_ORDER[index];
      const filteredSeries = seriesIds.filter((id) => effectiveVisible.has(id));
      const visible = filteredSeries.length > 0;
      const label = this.buildAxisLabel(unit);

      const descriptor: AxisDescriptor = {
        id: axisId,
        unit,
        label,
        visible,
        seriesIds: filteredSeries,
      };
      axes.push(descriptor);
      filteredSeries.forEach((seriesId) => {
        bindings[seriesId] = axisId;
      });
    });

    return { axes, bindings };
  }

  private collectUnits(visibleSeries: Set<string>): Map<string, string[]> {
    const map = new Map<string, string[]>();
    this.series.forEach((series) => {
      const unit = series.unit ?? "count";
      if (!map.has(unit)) {
        map.set(unit, []);
      }
      if (visibleSeries.has(series.id)) {
        map.get(unit)!.push(series.id);
      }
    });
    return map;
  }

  private buildAxisLabel(unit: string): string {
    switch (unit) {
      case "people":
        return "People";
      case "events":
        return "Events";
      case "events/min":
        return "Events / min";
      case "minutes":
        return "Minutes";
      case "percentage":
        return "%";
      case "count":
      default:
        return "Count";
    }
  }
}
