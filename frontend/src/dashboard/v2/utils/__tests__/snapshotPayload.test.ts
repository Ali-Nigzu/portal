import { computeRollingKpiDelta } from "../snapshotPayload";

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

describe("computeRollingKpiDelta", () => {
  it("includes only the current bucket just after midnight", () => {
    const values = Array.from({ length: 96 }, (_, index) => (index === 95 ? 7 : 0));
    const anchor = new Date("2026-01-19T00:01:00");

    const { delta, startIndex, k } = computeRollingKpiDelta(values, anchor, FIFTEEN_MINUTES_MS);

    expect(k).toBe(1);
    expect(startIndex).toBe(95);
    expect(delta).toBe(7);
  });

  it("sums the tail buckets through the current 15-minute bucket", () => {
    const values = Array.from({ length: 96 }, () => 0);
    for (let index = 82; index <= 95; index += 1) {
      values[index] = 1;
    }
    const anchor = new Date("2026-01-19T03:20:00");

    const { delta, startIndex, k } = computeRollingKpiDelta(values, anchor, FIFTEEN_MINUTES_MS);

    expect(k).toBe(14);
    expect(startIndex).toBe(82);
    expect(delta).toBe(14);
  });
});
