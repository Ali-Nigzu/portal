const RESERVED_SERIES_COLORS: Record<string, string> = {
  occupancy: "var(--chart-signal, #a77a21)",
  entrances: "var(--chart-series-2, #647080)",
  exits: "var(--chart-series-3, #7b8796)",
  throughput: "var(--chart-series-4, #8b887d)",
  dwell_mean: "var(--chart-series-5, #9f8a61)",
  dwell_p90: "var(--chart-series-6, #b49d74)",
};

const DEFAULT_PALETTE = [
  "var(--chart-series-2, #647080)",
  "var(--chart-series-3, #7b8796)",
  "var(--chart-series-4, #8f9aaa)",
  "var(--chart-series-5, #6f7c8d)",
  "var(--chart-series-6, #9ba5b2)",
  "var(--chart-series-7, #7a8798)",
  "var(--chart-series-8, #a9b3bf)",
  "var(--chart-series-9, #8793a3)",
  "var(--chart-series-10, #b5bdc7)",
  "var(--chart-signal, #a77a21)",
];

export class PaletteManager {
  private palette: string[];
  private reserved: Record<string, string>;
  private assignments = new Map<string, string>();
  private paletteIndex = 0;

  constructor(
    palette: string[] = DEFAULT_PALETTE,
    reserved: Record<string, string> = RESERVED_SERIES_COLORS,
  ) {
    this.palette = palette;
    this.reserved = reserved;
  }

  getColor(seriesId: string): string {
    if (this.assignments.has(seriesId)) {
      return this.assignments.get(seriesId)!;
    }

    const reservedMatch = this.getReservedColor(seriesId);
    if (reservedMatch) {
      this.assignments.set(seriesId, reservedMatch);
      return reservedMatch;
    }

    const color = this.palette[this.paletteIndex % this.palette.length];
    this.assignments.set(seriesId, color);
    this.paletteIndex += 1;
    return color;
  }

  private getReservedColor(seriesId: string): string | undefined {
    const normalized = seriesId.toLowerCase();
    const direct = this.reserved[normalized];
    if (direct) {
      return direct;
    }
    const key = Object.keys(this.reserved).find((reservedKey) =>
      normalized.includes(reservedKey),
    );
    return key ? this.reserved[key] : undefined;
  }
}
