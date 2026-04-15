export type RangePreset =
  | "last_2_days"
  | "last_7_days"
  | "last_30_days"
  | "last_12_weeks"
  | "last_6_months"
  | "last_12_months"
  | "today"
  | "yesterday"
  | "this_week"
  | "this_month"
  | "this_year"
  | "previous_week"
  | "previous_month"
  | "last_hour"
  | "last_3_hours"
  | "last_6_hours"
  | "last_12_hours"
  | "last_24_hours"
  | "last_48_hours"
  | "custom";
export const designTokens = {
  color: {
    "surface-0": "#f7f7f3",
    "surface-1": "#fbfbf8",
    "surface-2": "#e8edf2",
    "surface-3": "#d8dfe7",
    "text-primary": "#16181b",
    "text-secondary": "#39414a",
    "text-muted": "#6b7380",
    "accent-occupancy": "#9b7420",
    "accent-entrances": "#57616d",
    "accent-exits": "#6b747f",
    "accent-dwell": "#768190",
    "accent-alert-high": "#7a3030",
    "accent-alert-med": "#8f6b24",
    "accent-alert-low": "#57616d",
    "status-chip-bg": "rgba(98, 108, 120, 0.12)",
    "status-chip-action-bg": "rgba(155, 116, 32, 0.14)",
    "status-chip-action-hover-bg": "rgba(155, 116, 32, 0.2)",
    "site-chip-bg": "rgba(155, 116, 32, 0.12)",
    "site-chip-hover-bg": "rgba(155, 116, 32, 0.18)",
    "site-chip-active-bg": "rgba(155, 116, 32, 0.24)",
    "status-online-bg": "rgba(87, 97, 109, 0.18)",
    "status-warning-bg": "rgba(143, 107, 36, 0.18)",
    "status-offline-bg": "rgba(122, 48, 48, 0.18)",
    border: "#c2cbd6",
    hover: "#ebf0f5",
    active: "#e1e8f0",
    focus: "#a77a21",
    skeleton: "rgba(98, 108, 120, 0.16)",
  },
  spacing: {
    "0": "0px",
    "1": "4px",
    "2": "8px",
    "3": "12px",
    "4": "16px",
    "5": "20px",
    "6": "24px",
    "7": "32px",
    "8": "40px",
  },
  typography: {
    "font-family-base": "'Inter', 'Segoe UI', sans-serif",
    "font-family-mono": "'Roboto Mono', 'SFMono-Regular', monospace",
    "font-size-display": "28px",
    "font-size-heading": "24px",
    "font-size-title": "18px",
    "font-size-subtitle": "16px",
    "font-size-body": "14px",
    "font-size-caption": "12px",
    "font-size-metric": "48px",
    "font-size-kpi": "36px",
    "line-height-tight": "1.2",
    "line-height-base": "1.5",
  },
  radii: {
    card: "12px",
    chip: "16px",
    input: "8px",
    button: "8px",
    badge: "6px",
    full: "9999px",
  },
  motion: {
    "duration-sm": "120ms",
    "duration-md": "200ms",
    "duration-lg": "320ms",
    "easing-standard": "cubic-bezier(0.4, 0, 0.2, 1)",
    "easing-decelerate": "cubic-bezier(0, 0, 0.2, 1)",
  },
  elevation: {
    card: "0 8px 20px rgba(52, 61, 74, 0.09)",
    popover: "0 16px 30px rgba(52, 61, 74, 0.13)",
    header: "0 1px 0 rgba(124, 136, 150, 0.24)",
  },
  layout: {
    "sidebar-width": "256px",
    "sidebar-width-collapsed": "72px",
    "header-height": "64px",
    "status-strip-height": "40px",
    "toolbar-height": "72px",
    "content-max-width": "1440px",
    "search-width": "280px",
    "search-icon-offset": "36px",
    "toolbar-select-min-width": "160px",
    "search-width-compact": "180px",
    "grid-min-xl": "400px",
    "grid-min-lg": "300px",
    "grid-min-md": "250px",
    "grid-min-sm": "200px",
    "select-small-width": "120px",
    "popover-min-width": "280px",
    "auth-card-max-width": "400px",
    "auth-card-logo-size": "48px",
    "content-gap": "24px",
    "auth-min-height": "100vh",
    "modal-width": "500px",
    "table-cell-md": "240px",
    "table-cell-lg": "320px",
    "empty-state-padding": "40px",
  },
  size: {
    "icon-md": "20px",
    "icon-lg": "24px",
    "indicator-sm": "8px",
    "indicator-md": "10px",
    "chip-height": "28px",
    "button-sm": "32px",
    "spinner-diameter": "40px",
    "spinner-border": "4px",
  },
  borderWidth: { thin: "1px", thick: "3px" },
} as const;
const categories = Object.entries(designTokens) as [
  string,
  Record<string, string>,
][];
export const applyDesignTokens = () => {
  if (typeof window === "undefined") {
    return;
  }
  const root = document.documentElement;
  categories.forEach(([group, values]) => {
    Object.entries(values).forEach(([token, value]) => {
      root.style.setProperty(`--vrm-${group}-${token}`, value);
    });
  });
};
export type GranularityOption = "auto" | "5m" | "15m" | "hour" | "day" | "week";
export type CompareOption =
  | "off"
  | "previous_period"
  | "same_day_last_week"
  | "same_period_last_year";
export type SegmentOption = "sex" | "age";
export type ScopeOption = "all_cameras" | "per_camera";
export const rangePresets: { value: RangePreset; label: string }[] = [
  { value: "last_2_days", label: "Last 2 days" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "last_12_weeks", label: "Last 12 weeks" },
  { value: "last_6_months", label: "Last 6 months" },
  { value: "last_12_months", label: "Last 12 months" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "this_year", label: "This year" },
  { value: "previous_week", label: "Previous week" },
  { value: "previous_month", label: "Previous month" },
  { value: "last_hour", label: "Last hour" },
  { value: "last_3_hours", label: "Last 3 hours" },
  { value: "last_6_hours", label: "Last 6 hours" },
  { value: "last_12_hours", label: "Last 12 hours" },
  { value: "last_24_hours", label: "Last 24 hours" },
  { value: "last_48_hours", label: "Last 48 hours" },
  { value: "custom", label: "Custom range…" },
];
export const granularityOptions: { value: GranularityOption; label: string }[] =
  [
    { value: "auto", label: "Auto" },
    { value: "5m", label: "5 minutes" },
    { value: "15m", label: "15 minutes" },
    { value: "hour", label: "Hourly" },
    { value: "day", label: "Daily" },
    { value: "week", label: "Weekly" },
  ];
export const compareOptions: { value: CompareOption; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "previous_period", label: "Previous period" },
  { value: "same_day_last_week", label: "Same day last week" },
  { value: "same_period_last_year", label: "Same period last year" },
];
