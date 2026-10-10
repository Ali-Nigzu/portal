const decimalFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
});
export function formatValue(
  value: number | null | undefined,
  unit?: string,
): string {
  if (value === null || value === undefined) {
    return "—";
  }
  const formatted = decimalFormatter.format(value);
  if (unit === "percentage") {
    return `${formatted}%`;
  }
  return unit ? `${formatted} ${unit}` : formatted;
}
export function formatNumeric(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }
  return decimalFormatter.format(value);
}
export function formatTimeOfDay(date: Date | null, timezone?: string): string {
  if (!date) {
    return "";
  }
  try {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone ?? undefined,
    });
  } catch {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
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
export function shouldShowRawCount(
  rawCount: number | null | undefined,
): boolean {
  if (rawCount === null || rawCount === undefined) {
    return false;
  }
  if (Number.isNaN(rawCount)) {
    return false;
  }
  return rawCount > 0;
}

const PAD = (value: number): string => value.toString().padStart(2, "0");

const DEMO_TS_REGEX = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:\s*UTC|Z|[+-]\d{2}:?\d{2})?$/i;
const DEMO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

export const parseDemoTimestamp = (value: string): Date | null => {
  const raw = value.trim();
  const tsMatch = raw.match(DEMO_TS_REGEX);
  if (tsMatch) {
    const [, y, m, d, hh, mm, ss] = tsMatch;
    return new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      Number(ss),
      0,
    );
  }
  const dateMatch = raw.match(DEMO_DATE_REGEX);
  if (dateMatch) {
    const [, y, m, d] = dateMatch;
    return new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0);
  }
  return null;
};

export const formatDemoTimestamp = (value: Date): string =>
  `${value.getFullYear()}-${PAD(value.getMonth() + 1)}-${PAD(value.getDate())} ${PAD(value.getHours())}:${PAD(value.getMinutes())}:${PAD(value.getSeconds())}`;

export const startOfDemoDay = (value: Date): Date =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);

export const getDemoHour = (value: Date): number => value.getHours();
