import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  OrganisationContext,
  Selection,
  SelectedSnapshot,
} from "../features/organisation-dashboard/types";
import { resolveSelection } from "../features/organisation-dashboard/selection";

export type Source = {
  ref: string;
  kind: "device" | "gateway";
  site_id: string;
  label: string;
  analyzed_until: string | null;
};
export type PortalMetadata = OrganisationContext & {
  sources: Source[];
  clock: { server_now: string; effective_now: string; time_zone: string };
};
export type PortalSource = {
  context(signal: AbortSignal): Promise<PortalMetadata>;
  snapshot(
    selection: Selection,
    signal: AbortSignal,
  ): Promise<SelectedSnapshot>;
  request(
    path: string,
    params: URLSearchParams,
    signal: AbortSignal,
  ): Promise<Response>;
  deviceControl: PortalDeviceControl;
};
export type PortalDeviceControl = {
  mode: "simulated" | "canonical" | "read-only";
  getOverrides(): Record<string, boolean>;
  setSourceEnabled(
    ref: string,
    enabled: boolean,
    signal: AbortSignal,
  ): Promise<{ ref: string; enabled: boolean }>;
};
type PortalView = {
  context?: PortalMetadata;
  selection: Selection | null;
  source: PortalSource;
  key: string;
  error?: string;
  retry: () => void;
};
const Context = createContext<PortalView | null>(null);
export function PortalProvider({
  source,
  organisationSlug,
  siteSlug,
  children,
}: {
  source: PortalSource;
  organisationSlug?: string;
  siteSlug?: string;
  children: ReactNode;
}) {
  const [result, setResult] = useState<{
    source: PortalSource;
    context?: PortalMetadata;
    error?: string;
  }>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setResult(undefined);
    Promise.resolve().then(async () => {
      if (abort.signal.aborted) return;
      try {
        const context = await source.context(abort.signal);
        if (
          !context.organisation?.id ||
          !Array.isArray(context.sites) ||
          !Array.isArray(context.sources) ||
          !context.clock?.effective_now
        )
          throw new Error();
        if (!abort.signal.aborted) setResult({ source, context });
      } catch {
        if (!abort.signal.aborted)
          setResult({
            source,
            error: "Organisation context is unavailable. Please retry.",
          });
      }
    });
    return () => abort.abort();
  }, [source, revision]);
  const context = result?.source === source ? result.context : undefined;
  const selection = useMemo(
    () =>
      context ? resolveSelection(context, organisationSlug, siteSlug) : null,
    [context, organisationSlug, siteSlug],
  );
  const key =
    context && selection
      ? `${context.organisation.id}:${selection.scope}:${selection.id}`
      : "";
  return (
    <Context.Provider
      value={{
        context,
        selection,
        source,
        key,
        error: result?.error,
        retry: () => setRevision((v) => v + 1),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useOptionalPortal = () => useContext(Context);
export function usePortal() {
  const value = useOptionalPortal();
  if (!value) throw new Error("Portal context required");
  return value;
}
export function scopeParams(view: PortalView) {
  const params = new URLSearchParams();
  if (view.selection?.scope === "site")
    params.set("site_id", view.selection.id);
  if (view.context)
    params.set("effective_now", view.context.clock.effective_now);
  return params;
}
export function verifyScope(
  view: PortalView,
  value: { scope?: { organisation_id: string; site_id: string | null } },
) {
  if (
    value.scope?.organisation_id !== view.context?.organisation.id ||
    value.scope?.site_id !==
      (view.selection?.scope === "site" ? view.selection.id : null)
  )
    throw new Error("Response scope mismatch");
}
export async function responseJson(response: Response) {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      body?.detail?.message ?? "Data source unavailable. Please retry.",
    );
  }
  return response.json();
}
