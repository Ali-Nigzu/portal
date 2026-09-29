import type { PortalDeviceControl } from "../context/PortalContext";

export const DEMO_DEVICE_OVERRIDES_KEY = "camOS_demo_device_enabled_overrides";
const SOURCE_REF = /^(device|gateway):[1-9][0-9]*$/;

export function readDemoDeviceOverrides(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const value = JSON.parse(
      window.sessionStorage.getItem(DEMO_DEVICE_OVERRIDES_KEY) ?? "{}",
    );
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        ([ref, enabled]) => SOURCE_REF.test(ref) && typeof enabled === "boolean",
      ),
    );
  } catch {
    return {};
  }
}

export function clearDemoDeviceOverrides() {
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
