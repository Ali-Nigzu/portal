const PAD = (value: number): string => value.toString().padStart(2, "0");

const DEMO_TS_REGEX = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:\s*UTC|Z|[+-]\d{2}:?\d{2})?$/i;
const DEMO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

export const demoNow = (): Date => new Date();

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

export const formatDemoDateKey = (value: Date): string =>
  `${value.getFullYear()}-${PAD(value.getMonth() + 1)}-${PAD(value.getDate())}`;

export const startOfDemoDay = (value: Date): Date =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);

export const getDemoHour = (value: Date): number => value.getHours();

export const isSameDemoDate = (left: Date, right: Date): boolean =>
  left.getFullYear() === right.getFullYear()
  && left.getMonth() === right.getMonth()
  && left.getDate() === right.getDate();
