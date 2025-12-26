export const formatTooltipTimestamp = (label: string): string => {
  const parsed = new Date(label);
  if (Number.isNaN(parsed.getTime())) {
    return label;
  }
  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};
