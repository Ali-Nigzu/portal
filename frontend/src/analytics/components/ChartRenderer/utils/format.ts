const decimalFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
});

export function formatValue(
  value: number | null | undefined,
  unit?: string
): string {
  if (value === null || value === undefined) {
    return "—";
  }
  const formatted = decimalFormatter.format(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

export function formatNumeric(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }
  return decimalFormatter.format(value);
}

export function formatCoverage(coverage: number | null | undefined): {
  label: string;
  tone: "critical" | "low" | "normal";
} {
  if (coverage === null || coverage === undefined) {
    return { label: "—", tone: "normal" };
  }
  const percentage = Math.round(coverage * 100);
  if (coverage < 0.5) {
    return { label: `${percentage}% (low confidence)`, tone: "critical" };
  }
  if (coverage < 1) {
    return { label: `${percentage}% (warning)`, tone: "low" };
  }
  return { label: `${percentage}%`, tone: "normal" };
}

export function shouldShowRawCount(rawCount: number | null | undefined): boolean {
  if (rawCount === null || rawCount === undefined) {
    return false;
  }
  if (Number.isNaN(rawCount)) {
    return false;
  }
  return rawCount > 0;
}
