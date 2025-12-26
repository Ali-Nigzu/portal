/* eslint-disable testing-library/await-async-query */
import React from "react";
import renderer from "react-test-renderer";

import type { ChartSeries } from "../../../schemas/charting";
import type { SeriesVisibilityMap } from "../../managers";
import { SiteFlowTooltip } from "../SiteFlowTooltip";

const series: ChartSeries[] = [
  { id: "entrances", label: "Entrances", unit: "events", geometry: "bar", data: [] },
  { id: "exits", label: "Exits", unit: "events", geometry: "bar", data: [] },
  {
    id: "occupancy_avg",
    label: "Occupancy (avg)",
    unit: "people",
    geometry: "line",
    seriesGroup: "occupancy",
    data: [],
  },
  {
    id: "occupancy_min",
    label: "Occupancy (min)",
    unit: "people",
    geometry: "line",
    seriesGroup: "occupancy",
    data: [],
  },
  {
    id: "occupancy_max",
    label: "Occupancy (max)",
    unit: "people",
    geometry: "line",
    seriesGroup: "occupancy",
    data: [],
  },
];

const seriesMap = new Map<string, ChartSeries>(series.map((item) => [item.id, item]));

const payload = [
  { dataKey: "entrances", value: 5, color: "#111", payload: { x: "2025-12-24T20:35:00Z" } },
  { dataKey: "exits", value: 3, color: "#222", payload: { x: "2025-12-24T20:35:00Z" } },
  { dataKey: "occupancy_min", value: 1, color: "#333", payload: { x: "2025-12-24T20:35:00Z" } },
  { dataKey: "occupancy_max", value: 7, color: "#444", payload: { x: "2025-12-24T20:35:00Z" } },
  { dataKey: "occupancy_avg", value: 4, color: "#555", payload: { x: "2025-12-24T20:35:00Z" } },
];

const baseVisibility: SeriesVisibilityMap = {
  entrances: true,
  exits: true,
  occupancy_avg: true,
  occupancy_min: true,
  occupancy_max: true,
};

describe("SiteFlowTooltip", () => {
  it("renders grouped occupancy and hides raw/coverage lines", () => {
    const tree = renderer.create(
      <SiteFlowTooltip
        active
        payload={payload as any}
        label="2025-12-24T20:35:00Z"
        seriesMap={seriesMap}
        visibility={baseVisibility}
      />,
    );
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain("Occupancy");
    expect(text).toContain("Min:");
    expect(text).toContain("Max:");
    expect(text).not.toContain("raw:");
    expect(text).not.toContain("coverage:");
    expect(text).not.toContain("events");
    expect(text).not.toContain("people");
    expect(text).not.toContain("Occupancy (min)");
    expect(text).not.toContain("Occupancy (max)");
    expect(text).not.toContain("Occupancy (avg)");
    const exitsIndex = text.indexOf("Exits");
    const entrancesIndex = text.indexOf("Entrances");
    expect(exitsIndex).toBeGreaterThanOrEqual(0);
    expect(entrancesIndex).toBeGreaterThanOrEqual(0);
    expect(exitsIndex).toBeLessThan(entrancesIndex);
    const listItems = tree.root.findAllByType("li");
    expect(listItems).toHaveLength(3);
  });

  it("respects legend toggles for entrances/exits/occupancy", () => {
    const visibility: SeriesVisibilityMap = {
      ...baseVisibility,
      entrances: false,
      exits: true,
      occupancy_avg: false,
      occupancy_min: false,
      occupancy_max: false,
    };
    const tree = renderer.create(
      <SiteFlowTooltip
        active
        payload={payload as any}
        label="2025-12-24T20:35:00Z"
        seriesMap={seriesMap}
        visibility={visibility}
      />,
    );
    const text = JSON.stringify(tree.toJSON());
    expect(text).not.toContain("Entrances");
    expect(text).toContain("Exits");
    expect(text).not.toContain("Occupancy");
  });
});
