type FormatBrushTimestampOptions = { compact?: boolean };
export const formatBrushTimestamp = (
  label: string,
  options: FormatBrushTimestampOptions = {},
): string => {
  const parsed = new Date(label);
  if (Number.isNaN(parsed.getTime())) {
    return label;
  }
  const { compact = false } = options;
  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    ...(compact ? {} : { year: "numeric" }),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};
