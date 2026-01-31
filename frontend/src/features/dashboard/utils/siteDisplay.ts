export const formatTitleCase = (value?: string | null) => {
  if (!value) return "Site";
  const parts = value.split(/[\s._-]+/).filter(Boolean);
  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

export const deriveSiteDisplayId = (raw?: string | null) => {
  if (!raw) return "—";
  const cleaned = raw.split(".")[0];
  const numericMatch = cleaned.match(/(\d+)/);
  if (numericMatch) {
    return numericMatch[1];
  }
  return cleaned;
};
