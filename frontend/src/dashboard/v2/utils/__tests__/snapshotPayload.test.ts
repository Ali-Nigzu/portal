import { buildSnapshotWidgetResult } from "../snapshotPayload";
import type { SnapshotResponse } from "../snapshotPayload";

const buildSnapshot = (payload: unknown[]): SnapshotResponse => ({
  ts: "2026-01-19T00:00:00Z",
  payload,
  mode: "snapshots",
});

describe("buildSnapshotWidgetResult (legacy payload)", () => {
  it("uses the legacy rollup index for demographic widgets", () => {
    const rollups = Array.from({ length: 7 }, () => []);
    const targetRollup = [[], [], [], [], [], [1, 2, 3, 4, 5, 6], [], []];
    rollups[3] = targetRollup;

    const payload = [[], [], [], [], [], [], [], rollups];
    const snapshot = buildSnapshot(payload);

    const result = buildSnapshotWidgetResult("site-flow-demographics-age", snapshot, "last_month");

    const data = result.series[0].data.map((point) => point.y);
    expect(data).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("rejects block payloads when legacy rollups are missing", () => {
    const payload = [
      { version: "block" },
      { timestamps: ["2026-01-19T00:00:00Z"], series: { entrances: [1] } },
    ];
    const snapshot = buildSnapshot(payload);

    expect(() =>
      buildSnapshotWidgetResult("site-flow", snapshot, "today"),
    ).toThrow("payload[7]");
  });
});
