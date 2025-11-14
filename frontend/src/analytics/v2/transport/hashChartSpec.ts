import type { ChartSpec } from '../../schemas/charting';

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

const stableSerialize = (value: unknown): string =>
  JSON.stringify(value, (_key, nestedValue) => {
    if (!nestedValue || typeof nestedValue !== 'object' || Array.isArray(nestedValue)) {
      return nestedValue;
    }

    return Object.keys(nestedValue)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = (nestedValue as Record<string, unknown>)[key];
        return acc;
      }, {});
  });

// Lightweight FNV-1a hash for deterministic client-side spec hashing.
export function hashChartSpec(spec: ChartSpec): string {
  const serialized = stableSerialize(spec);
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < serialized.length; i += 1) {
    hash ^= serialized.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  // Convert to unsigned 32-bit hex.
  return `spec_${(hash >>> 0).toString(16)}`;
}
