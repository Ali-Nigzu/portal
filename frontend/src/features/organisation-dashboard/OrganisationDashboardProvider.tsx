import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { DashboardSource, OrganisationContext, SelectedSnapshot } from "./types";
import { resolveSelection } from "./selection";

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

export function useOrganisationDashboard(source: DashboardSource, organisationSlug?: string, siteSlug?: string) {
  const [context, setContext] = useState<OrganisationContext>();
  const [contextError, setContextError] = useState<string>();
  const [retry, setRetry] = useState(0);
  const [loaded, setLoaded] = useState<{key: string; snapshot?: SelectedSnapshot; error?: string}>();
  useEffect(() => {
    const controller = new AbortController();
    setContext(undefined);
    setContextError(undefined);
    // Defer until after StrictMode's effect cleanup, avoiding duplicate requests.
    Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      try {
        const result = await source.context(controller.signal);
        if (!controller.signal.aborted) setContext(freeze(result));
      } catch {
        if (!controller.signal.aborted) setContextError("Organisation context is unavailable. Please retry.");
      }
    });
    return () => controller.abort();
  }, [source, retry]);
  const selection = useMemo(() => context ? resolveSelection(context, organisationSlug, siteSlug) : null,
    [context, organisationSlug, siteSlug]);
  const key = selection ? `${selection.scope}:${selection.id}` : "";
  useEffect(() => {
    if (!selection || contextError) return;
    const controller = new AbortController();
    setLoaded(undefined);
    Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      try {
        const snapshot = await source.snapshot(selection, controller.signal);
        if (snapshot.scope !== selection.scope || snapshot.entity_id !== selection.id) throw new Error("Snapshot selection mismatch.");
        if (!controller.signal.aborted) setLoaded({ key, snapshot: freeze(snapshot) });
      } catch (error) {
        if (!controller.signal.aborted) setLoaded({ key, error: error instanceof Error ? error.message : "Snapshot unavailable." });
      }
    });
    return () => controller.abort();
  }, [source, key, context]);
  return { context, selection, snapshot: loaded?.key === key ? loaded.snapshot : undefined,
    error: contextError ?? (loaded?.key === key ? loaded.error : undefined),
    notFound: Boolean(context && organisationSlug && !selection),
    retry: () => setRetry(value => value + 1) };
}

type View = ReturnType<typeof useOrganisationDashboard>;
const Context = createContext<View | null>(null);
export function OrganisationDashboardProvider({ source, organisationSlug, siteSlug, children }: {
  source: DashboardSource; organisationSlug?: string; siteSlug?: string; children: ReactNode;
}) {
  const value = useOrganisationDashboard(source, organisationSlug, siteSlug);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useDashboardSnapshot() {
  const value = useContext(Context);
  if (!value) throw new Error("Organisation dashboard provider is missing");
  return value;
}
