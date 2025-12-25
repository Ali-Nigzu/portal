import { formatTooltipTimestamp } from "../formatTooltipTimestamp";

describe("formatTooltipTimestamp", () => {
  it("formats ISO timestamps without timezone", () => {
    const formatted = formatTooltipTimestamp("2025-12-24T20:35:00Z");
    expect(formatted).toBe("24 Dec 2025, 20:35");
  });

  it("falls back to the label when invalid", () => {
    expect(formatTooltipTimestamp("not-a-date")).toBe("not-a-date");
  });
});
