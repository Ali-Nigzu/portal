import type { SiteView } from "./siteView";

export const DEMO_SITE_LABELS: Record<SiteView, string> = {
  all: "All Sites",
  "site-a": "Alis Barber",
  "site-b": "Tokis Takeout",
};

const TRAFFIC_LABELS_BY_SITE_VIEW: Record<SiteView, string[]> = {
  all: [DEMO_SITE_LABELS["site-a"], DEMO_SITE_LABELS["site-b"]],
  "site-a": ["Main", "Back"],
  "site-b": ["Main", "Delivery", "Back"],
};

export const getDemoTrafficLabel = (
  siteView: SiteView,
  index: number,
): string | undefined => TRAFFIC_LABELS_BY_SITE_VIEW[siteView]?.[index];

export const getExpectedDemoTrafficLabels = (siteView: SiteView): string[] =>
  TRAFFIC_LABELS_BY_SITE_VIEW[siteView] ?? [];

export const getDemoTrafficLabels = (siteView: SiteView, count: number): string[] =>
  Array.from({ length: count }, (_, index) =>
    getDemoTrafficLabel(siteView, index) ?? `Segment ${index + 1}`,
  );
