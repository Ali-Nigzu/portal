import { useEffect, useMemo, useRef, useState } from "react";
import { responseJson, scopeParams, usePortal, verifyScope } from "../../../context/PortalContext";

export type DeviceView = CanonicalDevice & {
  displayed_enabled: boolean;
  pending: boolean;
  control_error?: string;
};

export function useCanonicalDeviceList() {
  const portal = usePortal();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; scopeKey: string; data?: DeviceListResponse; error?: string }>();
  const [overrides, setOverrides] = useState<Record<string, boolean>>(() =>
    portal.source.deviceControl.getOverrides(),
  );
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [controlErrors, setControlErrors] = useState<Record<string, string>>({});
  const controllers = useRef(new Map<string, AbortController>());
  const writeVersion = useRef(0);
  const acknowledgements = useRef(new Map<string, { version: number; enabled: boolean }>());
  const scopeKey = `${portal.key}:${portal.context?.clock.effective_now}`;
  const key = `${scopeKey}:${revision}`;

  useEffect(() => {
    const abort = new AbortController();
    Promise.resolve().then(async () => {
      try {
        const readVersion = writeVersion.current;
        const data = await responseJson(
          await portal.source.request("/devices", scopeParams(portal), abort.signal),
        );
        verifyScope(portal, data);
        if (!abort.signal.aborted) {
          if (portal.source.deviceControl.mode === "canonical") {
            const retained: Record<string, boolean> = {};
            for (const [ref, acknowledgement] of acknowledgements.current) {
              if (acknowledgement.version > readVersion) retained[ref] = acknowledgement.enabled;
              else acknowledgements.current.delete(ref);
            }
            setOverrides(retained);
          }
          setResult({ key, scopeKey, data });
        }
      } catch (error) {
        if (!abort.signal.aborted)
          setResult((previous) => ({
            key,
            scopeKey,
            data: previous?.scopeKey === scopeKey ? previous.data : undefined,
            error: error instanceof Error ? error.message : "Device data is unavailable.",
          }));
      }
    });
    return () => abort.abort();
  }, [key, portal.source]);

  useEffect(() => {
    acknowledgements.current.clear();
    setOverrides(portal.source.deviceControl.getOverrides());
    setPending({});
    setControlErrors({});
    return () => {
      controllers.current.forEach((controller) => controller.abort());
      controllers.current.clear();
    };
  }, [portal.key, portal.source]);
  const data = result?.scopeKey === scopeKey ? result.data : undefined;
  const items: DeviceView[] = (data?.items ?? []).map((item) => ({
    ...item,
    displayed_enabled: overrides[item.ref] ?? item.canonical_enabled,
    pending: Boolean(pending[item.ref]),
    control_error: controlErrors[item.ref],
  }));
  const groups = useMemo(() => {
    const grouped = new Map<string, { site_id: string; site_name: string; items: DeviceView[] }>();
    items.forEach((item) => {
      const group = grouped.get(item.site_id) ?? { site_id: item.site_id, site_name: item.site_name, items: [] };
      group.items.push(item);
      grouped.set(item.site_id, group);
    });
    return [...grouped.values()];
  }, [items]);

  async function setEnabled(item: DeviceView, enabled: boolean) {
    controllers.current.get(item.ref)?.abort();
    const abort = new AbortController();
    controllers.current.set(item.ref, abort);
    setPending((value) => ({ ...value, [item.ref]: true }));
    setControlErrors((value) => ({ ...value, [item.ref]: "" }));
    try {
      const confirmed = await portal.source.deviceControl.setSourceEnabled(item.ref, enabled, abort.signal);
      if (!abort.signal.aborted) {
        if (portal.source.deviceControl.mode === "canonical")
          acknowledgements.current.set(confirmed.ref, { version: ++writeVersion.current, enabled: confirmed.enabled });
        setOverrides((value) => ({ ...value, [confirmed.ref]: confirmed.enabled }));
      }
    } catch (error) {
      if (!abort.signal.aborted)
        setControlErrors((value) => ({ ...value, [item.ref]: error instanceof Error ? error.message : "State change failed." }));
    } finally {
      if (!abort.signal.aborted) setPending((value) => ({ ...value, [item.ref]: false }));
      if (controllers.current.get(item.ref) === abort) controllers.current.delete(item.ref);
    }
  }

  return {
    groups,
    items,
    recordsStatus: data?.records_status,
    loading: !data && result?.key !== key,
    refreshing: Boolean(data) && result?.key !== key,
    error: result?.key === key ? result.error : undefined,
    retry: () => setRevision((value) => value + 1),
    refresh: () => setRevision((value) => value + 1),
    setEnabled,
    summary: {
      total: items.length,
      enabled: items.filter((item) => item.displayed_enabled).length,
      disabled: items.filter((item) => !item.displayed_enabled).length,
      gateways: items.filter((item) => item.kind === "gateway").length,
    },
  };
}

type CanonicalDevice = {
  ref: string;
  kind: "device" | "gateway";
  site_id: string;
  site_name: string;
  name: string;
  canonical_enabled: boolean;
  last_activity: string | null;
  runtime_state: "online" | "offline";
  records: number | null;
  records_status: "available" | "unavailable";
};

type DeviceListResponse = {
  scope: { organisation_id: string; site_id: string | null };
  records_status: "available" | "unavailable";
  items: CanonicalDevice[];
};
