import { AxisManager } from "../managers/AxisManager";
import type { ChartSeries } from "../../../schemas/charting";

describe("AxisManager", () => {
  const baseSeries: ChartSeries[] = [
    { id: "occupancy", label: "Occupancy", geometry: "line", unit: "people", data: [] },
    { id: "activity", label: "Activity", geometry: "column", unit: "events", data: [] },
    { id: "throughput", label: "Throughput", geometry: "line", unit: "events/min", data: [] },
    { id: "dwell", label: "Dwell", geometry: "line", unit: "minutes", data: [] },
  ];

  it("limits axes to three unique units", () => {
    const manager = new AxisManager(baseSeries);
    const config = manager.build(new Set(baseSeries.map((series) => series.id)));

    expect(config.axes).toHaveLength(3);
    expect(config.axes[0].unit).toBe("people");
    expect(config.axes[1].unit).toBe("events");
    expect(config.axes[2].unit).toBe("events/min");
    expect(config.bindings.dwell).toBeUndefined();
  });

  it("auto-hides axes with no visible series", () => {
    const manager = new AxisManager(baseSeries);
    const visible = new Set(["occupancy", "throughput"]);
    const config = manager.build(visible);

    const activityAxis = config.axes.find((axis) => axis.unit === "events");
    expect(activityAxis?.visible).toBe(false);
  });
});
