import { optionalLocalStorage, optionalSessionStorage } from "../../common/optionalStorage";
import type { PortalDeviceControl } from "../../context/PortalContext";
import { requestFetch } from "../auth/transport/me";

const DEMO_SESSION_KEY = "camOS_demo_session";
const DEMO_DEFAULTS_APPLIED_KEY = "camOS_demo_defaults_applied";
const KEEP_MENU_EXPANDED_KEY = "vrm_keep_menu_expanded";
let activeInMemory = false;
let startRequest: { controller: AbortController; promise: Promise<void> } | null = null;

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
  return activeInMemory || optionalSessionStorage.getItem(DEMO_SESSION_KEY) === "true";
};

export const enableDemoSession = (): Promise<void> => {
  if (isDemoSessionActive()) {
    return Promise.resolve();
  }
  if (startRequest) return startRequest.promise;
  const controller = new AbortController();
  const promise = (async () => {
    const response = await requestFetch(`/api/demo/session`, {
      method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/json" }, credentials: "include",
    });
    if (!response.ok) throw new Error("Unable to start Demo.");
    if (controller.signal.aborted) return;
    clearDemoDeviceOverrides();
    activeInMemory = true;
    optionalSessionStorage.setItem(DEMO_SESSION_KEY, "true");
    notifyDemoSessionChanged();
  })();
  startRequest = { controller, promise };
  void promise.finally(() => { if (startRequest?.promise === promise) startRequest = null; }).catch(() => {});
  return promise;
};

export const clearDemoSessionLocal = (): void => {
  const wasActive = isDemoSessionActive();
  activeInMemory = false;
  startRequest?.controller.abort();
  startRequest = null;
  if (typeof window !== "undefined") {
    clearDemoDeviceOverrides();
    optionalSessionStorage.removeItem(DEMO_SESSION_KEY);
    optionalSessionStorage.removeItem(DEMO_DEFAULTS_APPLIED_KEY);
    optionalLocalStorage.removeItem(KEEP_MENU_EXPANDED_KEY);
  }
  if (wasActive) notifyDemoSessionChanged();
};

export const clearDemoSessionServer = async (): Promise<void> => {
  try {
    await requestFetch(`/api/demo/session/clear`, {
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
  if (optionalSessionStorage.getItem(DEMO_DEFAULTS_APPLIED_KEY) === "true") {
    return;
  }
  optionalLocalStorage.setItem(KEEP_MENU_EXPANDED_KEY, "false");
  optionalSessionStorage.setItem(DEMO_DEFAULTS_APPLIED_KEY, "true");
};

const DEMO_DEVICE_OVERRIDES_KEY = "camOS_demo_device_enabled_overrides";
const SOURCE_REF = /^(device|gateway):[1-9][0-9]*$/;

function readDemoDeviceOverrides(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const value = JSON.parse(
      optionalSessionStorage.getItem(DEMO_DEVICE_OVERRIDES_KEY) ?? "{}",
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
    optionalSessionStorage.removeItem(DEMO_DEVICE_OVERRIDES_KEY);
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
    optionalSessionStorage.setItem(
      DEMO_DEVICE_OVERRIDES_KEY,
      JSON.stringify(overrides),
    );
    return { ref, enabled };
  },
};
