import { formatBrushTimestamp } from "../formatBrushTimestamp";

describe("formatBrushTimestamp", () => {
  it("formats ISO timestamps without timezone text", () => {
    const formatted = formatBrushTimestamp("2025-12-21T20:00:00Z");
    expect(formatted).toContain("21 Dec 2025");
    expect(formatted).toContain("20:00");
    expect(formatted).not.toContain("T");
    expect(formatted).not.toContain("Z");
  });

  it("supports a compact format", () => {
    const formatted = formatBrushTimestamp("2025-12-21T20:00:00Z", { compact: true });
    expect(formatted).toContain("21 Dec");
    expect(formatted).toContain("20:00");
    expect(formatted).not.toContain("2025");
  });
});
