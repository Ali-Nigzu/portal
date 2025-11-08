export type RangePreset =
  | 'last_2_days'
  | 'last_7_days'
  | 'last_30_days'
  | 'last_12_weeks'
  | 'last_6_months'
  | 'last_12_months'
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'this_month'
  | 'this_year'
  | 'previous_week'
  | 'previous_month'
  | 'last_hour'
  | 'last_3_hours'
  | 'last_6_hours'
  | 'last_12_hours'
  | 'last_24_hours'
  | 'last_48_hours'
  | 'custom';

export const designTokens = {
  color: {
    'surface-0': '#0f131a',
    'surface-1': '#151a22',
    'surface-2': '#1d2430',
    'surface-3': '#242d3b',
    'text-primary': '#ffffff',
    'text-secondary': '#c9d2e1',
    'text-muted': '#8290a6',
    'accent-occupancy': '#2685ff',
    'accent-entrances': '#47c96f',
    'accent-exits': '#ff5964',
    'accent-dwell': '#f6a609',
    'accent-alert-high': '#ff5f5f',
    'accent-alert-med': '#f4b63d',
    'accent-alert-low': '#4bcf9f',
    'status-chip-bg': 'rgba(255, 255, 255, 0.06)',
    'status-chip-action-bg': 'rgba(38, 133, 255, 0.15)',
    'status-chip-action-hover-bg': 'rgba(38, 133, 255, 0.25)',
    'site-chip-bg': 'rgba(38, 133, 255, 0.2)',
    'site-chip-hover-bg': 'rgba(59, 130, 246, 0.25)',
    'site-chip-active-bg': 'rgba(59, 130, 246, 0.35)',
    'status-online-bg': 'rgba(76, 175, 80, 0.2)',
    'status-warning-bg': 'rgba(255, 152, 0, 0.2)',
    'status-offline-bg': 'rgba(244, 67, 54, 0.2)',
    border: '#2d3748',
    hover: '#202938',
    active: '#2f3b52',
    focus: '#3b82f6',
    skeleton: 'rgba(255, 255, 255, 0.08)',
  },
  spacing: {
    '0': '0px',
    '1': '4px',
    '2': '8px',
    '3': '12px',
    '4': '16px',
    '5': '20px',
    '6': '24px',
    '7': '32px',
    '8': '40px',
  },
  typography: {
    'font-family-base': "'Inter', 'Segoe UI', sans-serif",
    'font-family-mono': "'Roboto Mono', 'SFMono-Regular', monospace",
    'font-size-display': '28px',
    'font-size-heading': '24px',
    'font-size-title': '18px',
    'font-size-subtitle': '16px',
    'font-size-body': '14px',
    'font-size-caption': '12px',
    'line-height-tight': '1.2',
    'line-height-base': '1.5',
  },
  radii: {
    card: '12px',
    chip: '16px',
    input: '8px',
    button: '8px',
    badge: '6px',
    full: '9999px',
  },
  motion: {
    'duration-sm': '120ms',
    'duration-md': '200ms',
    'duration-lg': '320ms',
    'easing-standard': 'cubic-bezier(0.4, 0, 0.2, 1)',
    'easing-decelerate': 'cubic-bezier(0, 0, 0.2, 1)',
  },
  elevation: {
    'card': '0 12px 24px rgba(0, 0, 0, 0.25)',
    'popover': '0 20px 30px rgba(0, 0, 0, 0.35)',
    'header': '0 1px 0 rgba(255, 255, 255, 0.04)',
  },
  layout: {
    'sidebar-width': '256px',
    'sidebar-width-collapsed': '72px',
    'header-height': '64px',
    'status-strip-height': '40px',
    'toolbar-height': '72px',
    'content-max-width': '1440px',
    'search-width': '280px',
    'search-icon-offset': '36px',
    'toolbar-select-min-width': '160px',
    'search-width-compact': '180px',
    'grid-min-xl': '400px',
    'grid-min-lg': '300px',
    'grid-min-md': '250px',
    'grid-min-sm': '200px',
    'select-small-width': '120px',
    'popover-min-width': '280px',
    'auth-card-max-width': '400px',
    'auth-card-logo-size': '48px',
    'content-gap': '24px',
    'auth-min-height': '100vh',
  },
  size: {
    'icon-md': '20px',
    'icon-lg': '24px',
    'indicator-sm': '8px',
    'indicator-md': '10px',
    'chip-height': '28px',
    'button-sm': '32px',
    'spinner-diameter': '40px',
    'spinner-border': '4px',
  },
  borderWidth: {
    thin: '1px',
    thick: '3px',
  },
} as const;

const categories = Object.entries(designTokens) as [string, Record<string, string>][];

export const applyDesignTokens = () => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = document.documentElement;
  categories.forEach(([group, values]) => {
    Object.entries(values).forEach(([token, value]) => {
      root.style.setProperty(`--vrm-${group}-${token}`, value);
    });
  });
};

export type GranularityOption = 'auto' | '5m' | '15m' | 'hour' | 'day' | 'week';
export type CompareOption =
  | 'off'
  | 'previous_period'
  | 'same_day_last_week'
  | 'same_period_last_year';
export type SegmentOption = 'sex' | 'age';
export type ScopeOption = 'all_cameras' | 'per_camera';

export const rangePresets: { value: RangePreset; label: string }[] = [
  { value: 'last_2_days', label: 'Last 2 days' },
  { value: 'last_7_days', label: 'Last 7 days' },
  { value: 'last_30_days', label: 'Last 30 days' },
  { value: 'last_12_weeks', label: 'Last 12 weeks' },
  { value: 'last_6_months', label: 'Last 6 months' },
  { value: 'last_12_months', label: 'Last 12 months' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This week' },
  { value: 'this_month', label: 'This month' },
  { value: 'this_year', label: 'This year' },
  { value: 'previous_week', label: 'Previous week' },
  { value: 'previous_month', label: 'Previous month' },
  { value: 'last_hour', label: 'Last hour' },
  { value: 'last_3_hours', label: 'Last 3 hours' },
  { value: 'last_6_hours', label: 'Last 6 hours' },
  { value: 'last_12_hours', label: 'Last 12 hours' },
  { value: 'last_24_hours', label: 'Last 24 hours' },
  { value: 'last_48_hours', label: 'Last 48 hours' },
  { value: 'custom', label: 'Custom range…' },
];

export const granularityOptions: { value: GranularityOption; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: '5m', label: '5 minutes' },
  { value: '15m', label: '15 minutes' },
  { value: 'hour', label: 'Hourly' },
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
];

export const compareOptions: { value: CompareOption; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'previous_period', label: 'Previous period' },
  { value: 'same_day_last_week', label: 'Same day last week' },
  { value: 'same_period_last_year', label: 'Same period last year' },
];
