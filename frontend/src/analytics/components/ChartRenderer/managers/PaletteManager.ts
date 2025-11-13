const RESERVED_SERIES_COLORS: Record<string, string> = {
  occupancy: "#2685FF",
  entrances: "#47C96F",
  exits: "#FF5964",
  throughput: "#8A5BE8",
  dwell_mean: "#F6A609",
  dwell_p90: "#F2C94C",
};

const DEFAULT_PALETTE = [
  "#2685FF",
  "#47C96F",
  "#FF5964",
  "#8A5BE8",
  "#F6A609",
  "#56CCF2",
  "#BB6BD9",
  "#6FCF97",
  "#F2C94C",
  "#BDBDBD",
];

export class PaletteManager {
  private palette: string[];
  private reserved: Record<string, string>;
  private assignments = new Map<string, string>();
  private paletteIndex = 0;

  constructor(
    palette: string[] = DEFAULT_PALETTE,
    reserved: Record<string, string> = RESERVED_SERIES_COLORS
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
      normalized.includes(reservedKey)
    );
    return key ? this.reserved[key] : undefined;
  }
}
