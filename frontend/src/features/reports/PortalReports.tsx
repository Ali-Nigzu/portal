import { useEffect, useState } from "react";
import {
  scopeParams,
  usePortal,
  verifyScope,
} from "../../context/PortalContext";
import { parseSnapshot } from "../organisation-dashboard/api";
import ReportsPage from "./ReportsPage";
import type { ReportSnapshotResponse } from "./types";

export default function PortalReports() {
  const portal = usePortal();
  const [state, setState] = useState<{
    key: string;
    snapshot?: ReportSnapshotResponse["snapshot"];
    error?: string;
    missing?: boolean;
  }>({ key: "" });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setState({ key: portal.key });
    Promise.resolve().then(async () => {
      if (!portal.selection || !portal.context) return;
      try {
        const response = await portal.source.request(
          "/reports/snapshot",
          scopeParams(portal),
          abort.signal,
        );
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            body?.detail?.message ??
            "Reports are temporarily unavailable. Please retry.";
          if (!abort.signal.aborted)
            setState({
              key: portal.key,
              error: message,
              missing: response.status === 404,
            });
          return;
        }
        verifyScope(portal, body);
        const snapshot = parseSnapshot(body?.snapshot);
        if (
          snapshot.scope !== portal.selection.scope ||
          snapshot.entity_id !== portal.selection.id
        )
          throw new Error("Report snapshot selection mismatch.");
        if (!abort.signal.aborted) setState({ key: portal.key, snapshot });
      } catch (error) {
        if (!abort.signal.aborted)
          setState({
            key: portal.key,
            error:
              error instanceof Error
                ? error.message
                : "Reports are temporarily unavailable. Please retry.",
          });
      }
    });
    return () => abort.abort();
  }, [portal.key, portal.source, portal.context, revision]);
  const site =
    portal.selection?.scope === "site"
      ? portal.context?.sites.find((s) => s.id === portal.selection?.id)
      : undefined;
  const identity = {
    organisationName: portal.context!.organisation.name,
    siteName: site?.name,
    heading: site
      ? `${portal.context!.organisation.name} - ${site.name}`
      : portal.context!.organisation.name,
  };
  const current = state.key === portal.key ? state : { key: portal.key };
  return (
    <ReportsPage
      identity={identity}
      snapshot={current.snapshot}
      effectiveNow={new Date(portal.context!.clock.effective_now)}
      loading={!current.snapshot && !current.error}
      error={current.error}
      missing={current.missing}
      retry={() => setRevision((v) => v + 1)}
    />
  );
}
