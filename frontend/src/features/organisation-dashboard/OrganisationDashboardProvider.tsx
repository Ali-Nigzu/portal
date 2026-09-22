import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { OrganisationContext, Selection, SelectedSnapshot } from "./types";
import { usePortal } from "../../context/PortalContext";

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

type View = {
  context?: OrganisationContext;
  selection: Selection | null;
  snapshot?: SelectedSnapshot;
  error?: string;
  notFound: boolean;
  retry: () => void;
};
export function PortalDashboardProvider({ children }: { children: ReactNode }) {
  const portal = usePortal();
  const { context, selection, key, source } = portal;
  const [loaded, setLoaded] = useState<{
    key: string;
    snapshot?: SelectedSnapshot;
    error?: string;
  }>();
  useEffect(() => {
    const abort = new AbortController();
    setLoaded(undefined);
    Promise.resolve().then(async () => {
      if (!selection || abort.signal.aborted) return;
      try {
        const snapshot = await source.snapshot(selection, abort.signal);
        if (
          snapshot.scope !== selection.scope ||
          snapshot.entity_id !== selection.id
        )
          throw new Error("Snapshot selection mismatch.");
        if (!abort.signal.aborted)
          setLoaded({ key, snapshot: freeze(snapshot) });
      } catch (error) {
        if (!abort.signal.aborted)
          setLoaded({
            key,
            error:
              error instanceof Error ? error.message : "Snapshot unavailable.",
          });
      }
    });
    return () => abort.abort();
  }, [key, source, context]);
  const value = {
    context,
    selection,
    snapshot: loaded?.key === key ? loaded.snapshot : undefined,
    error: loaded?.key === key ? loaded.error : undefined,
    notFound: false,
    retry: portal.retry,
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
const Context = createContext<View | null>(null);
export function useDashboardSnapshot() {
  const value = useContext(Context);
  if (!value) throw new Error("Organisation dashboard provider is missing");
  return value;
}
