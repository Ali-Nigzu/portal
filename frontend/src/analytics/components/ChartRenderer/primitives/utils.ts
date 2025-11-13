import type { ChartSeries } from "../../../schemas/charting";

interface CartesianDatum {
  x: string;
  [key: string]: unknown;
}

export interface SeriesMetaEntry {
  coverage?: number | null;
  rawCount?: number | null;
}

export interface CartesianDataset {
  data: CartesianDatum[];
  meta: Record<string, Record<string, SeriesMetaEntry>>;
}

export function buildCartesianDataset(series: ChartSeries[]): CartesianDataset {
  const pointMap = new Map<string, CartesianDatum>();
  const ordering: string[] = [];
  const metaMap: Record<string, Record<string, SeriesMetaEntry>> = {};

  series.forEach((seriesItem) => {
    seriesItem.data.forEach((point) => {
      const key = point.x;
      if (!pointMap.has(key)) {
        pointMap.set(key, { x: key });
        ordering.push(key);
      }
      const datum = pointMap.get(key)!;
      if (point.y !== undefined) {
        datum[seriesItem.id] = point.y;
      } else if (point.value !== undefined) {
        datum[seriesItem.id] = point.value;
      } else {
        datum[seriesItem.id] = point.y ?? point.value ?? null;
      }

      if (!metaMap[key]) {
        metaMap[key] = {};
      }
      metaMap[key][seriesItem.id] = {
        coverage: point.coverage ?? null,
        rawCount: (point as unknown as { rawCount?: number | null }).rawCount ?? null,
      };
    });
  });

  const data = ordering.map((key) => pointMap.get(key)!).filter(Boolean);

  return { data, meta: metaMap };
}
