import { API_BASE_URL } from "../config";

const DEMO_SESSION_KEY = "camOS_demo_session";
const DEMO_DEFAULTS_APPLIED_KEY = "camOS_demo_defaults_applied";
const DEMO_TIME_RANGE_KEY = "camOS_demo_time_range";
const DEMO_SITEFLOW_TIMEFRAME_KEY = "camOS_demo_siteflow_timeframe";
const DEMO_SITEFLOW_MODE_KEY = "camOS_demo_siteflow_mode";
const SELECTED_SITE_KEY = "camOS_selected_site";
const KEEP_MENU_EXPANDED_KEY = "vrm_keep_menu_expanded";

const notifyDemoSessionChanged = () => {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent("demo-session-changed"));
};

export const isDemoSessionActive = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  return window.sessionStorage.getItem(DEMO_SESSION_KEY) === "true";
};

export const enableDemoSession = async (): Promise<void> => {
  if (isDemoSessionActive()) {
    return;
  }
  const response = await fetch(`${API_BASE_URL}/api/demo/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to start demo session (${response.status}). ${text}`.trim(),
    );
  }
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(DEMO_SESSION_KEY, "true");
  }
  notifyDemoSessionChanged();
};

export const clearDemoSessionLocal = (): void => {
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(DEMO_SESSION_KEY);
    window.sessionStorage.removeItem(DEMO_DEFAULTS_APPLIED_KEY);
    window.sessionStorage.removeItem(DEMO_TIME_RANGE_KEY);
    window.sessionStorage.removeItem(DEMO_SITEFLOW_TIMEFRAME_KEY);
    window.sessionStorage.removeItem(DEMO_SITEFLOW_MODE_KEY);
    window.sessionStorage.removeItem(SELECTED_SITE_KEY);
    window.localStorage.removeItem(KEEP_MENU_EXPANDED_KEY);
  }
  notifyDemoSessionChanged();
};

export const clearDemoSessionServer = async (): Promise<void> => {
  try {
    await fetch(`${API_BASE_URL}/api/demo/session/clear`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
  } catch {
    // best-effort cleanup
  }
};

export const clearDemoSession = async (): Promise<void> => {
  await clearDemoSessionServer();
  clearDemoSessionLocal();
};

export const applyDemoDefaultsOnce = (): void => {
  if (typeof window === "undefined") {
    return;
  }
  if (window.sessionStorage.getItem(DEMO_DEFAULTS_APPLIED_KEY) === "true") {
    return;
  }
  window.sessionStorage.setItem(SELECTED_SITE_KEY, "site-a");
  window.localStorage.setItem(KEEP_MENU_EXPANDED_KEY, "false");
  window.sessionStorage.setItem(DEMO_TIME_RANGE_KEY, "today");
  window.sessionStorage.setItem(DEMO_SITEFLOW_TIMEFRAME_KEY, "today");
  window.sessionStorage.setItem(DEMO_SITEFLOW_MODE_KEY, "activity");
  window.sessionStorage.setItem(DEMO_DEFAULTS_APPLIED_KEY, "true");
};

export const consumeDemoTimeRangeOverride = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const value = window.sessionStorage.getItem(DEMO_TIME_RANGE_KEY);
  if (value) {
    window.sessionStorage.removeItem(DEMO_TIME_RANGE_KEY);
  }
  return value;
};

export const consumeDemoSiteFlowTimeframeOverride = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const value = window.sessionStorage.getItem(DEMO_SITEFLOW_TIMEFRAME_KEY);
  if (value) {
    window.sessionStorage.removeItem(DEMO_SITEFLOW_TIMEFRAME_KEY);
  }
  return value;
};

export const getDemoSiteFlowTimeframe = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }
  return window.sessionStorage.getItem(DEMO_SITEFLOW_TIMEFRAME_KEY);
};

export const setDemoSiteFlowTimeframe = (value: string): void => {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(DEMO_SITEFLOW_TIMEFRAME_KEY, value);
};

export const consumeDemoSiteFlowModeOverride = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const value = window.sessionStorage.getItem(DEMO_SITEFLOW_MODE_KEY);
  if (value) {
    window.sessionStorage.removeItem(DEMO_SITEFLOW_MODE_KEY);
  }
  return value;
};
