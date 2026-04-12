export const SITE_FLOW_ACTIVITY_COLORS = {
  entrances: "#47c96f",
  exits: "#ff5964",
  occupancy: "#2685ff",
} as const;

export type SiteFlowActivitySeriesId = keyof typeof SITE_FLOW_ACTIVITY_COLORS;
