import type { PortalDeviceControl } from "../../context/PortalContext";

const DEMO_SESSION_KEY = "camOS_demo_session";
const DEMO_DEFAULTS_APPLIED_KEY = "camOS_demo_defaults_applied";
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
  const response = await fetch(`/api/demo/session`, {
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
    clearDemoDeviceOverrides();
    window.sessionStorage.setItem(DEMO_SESSION_KEY, "true");
  }
  notifyDemoSessionChanged();
};

export const clearDemoSessionLocal = (): void => {
  if (typeof window !== "undefined") {
    clearDemoDeviceOverrides();
    window.sessionStorage.removeItem(DEMO_SESSION_KEY);
    window.sessionStorage.removeItem(DEMO_DEFAULTS_APPLIED_KEY);
    window.localStorage.removeItem(KEEP_MENU_EXPANDED_KEY);
  }
  notifyDemoSessionChanged();
};

export const clearDemoSessionServer = async (): Promise<void> => {
  try {
    await fetch(`/api/demo/session/clear`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
  } catch {
    // best-effort cleanup
  }
};

export const applyDemoDefaultsOnce = (): void => {
  if (typeof window === "undefined") {
    return;
  }
  if (window.sessionStorage.getItem(DEMO_DEFAULTS_APPLIED_KEY) === "true") {
    return;
  }
  window.localStorage.setItem(KEEP_MENU_EXPANDED_KEY, "false");
  window.sessionStorage.setItem(DEMO_DEFAULTS_APPLIED_KEY, "true");
};

const DEMO_DEVICE_OVERRIDES_KEY = "camOS_demo_device_enabled_overrides";
const SOURCE_REF = /^(device|gateway):[1-9][0-9]*$/;

function readDemoDeviceOverrides(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const value = JSON.parse(
      window.sessionStorage.getItem(DEMO_DEVICE_OVERRIDES_KEY) ?? "{}",
    );
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        ([ref, enabled]) =>
          SOURCE_REF.test(ref) && typeof enabled === "boolean",
      ),
    ) as Record<string, boolean>;
  } catch {
    return {};
  }
}

function clearDemoDeviceOverrides() {
  if (typeof window !== "undefined")
    window.sessionStorage.removeItem(DEMO_DEVICE_OVERRIDES_KEY);
}

export const demoDeviceControl: PortalDeviceControl = {
  mode: "simulated",
  getOverrides: readDemoDeviceOverrides,
  async setSourceEnabled(ref, enabled, signal) {
    if (!SOURCE_REF.test(ref)) throw new Error("Invalid source identity.");
    await Promise.resolve();
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const overrides = readDemoDeviceOverrides();
    overrides[ref] = enabled;
    window.sessionStorage.setItem(
      DEMO_DEVICE_OVERRIDES_KEY,
      JSON.stringify(overrides),
    );
    return { ref, enabled };
  },
};
