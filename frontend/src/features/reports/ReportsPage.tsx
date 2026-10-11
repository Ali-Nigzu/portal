import type { SelectedSnapshot } from "../organisation-dashboard/types";
import { useMemo, useState, useEffect } from "react";

import { buildReportData, type ReportType } from "./engine/ReportsEngine";
import { TIMEFRAME_OPTIONS, type ReportTimeframe } from "./utils/reportUtils";
import "./ReportsPage.css";
import {
  scopeParams,
  usePortal,
  verifyScope,
} from "../../context/PortalContext";
import { parseSnapshot } from "../organisation-dashboard/api";

type Props = {
  identity?: ReportIdentity;
  snapshot?: SelectedSnapshot;
  effectiveNow?: Date;
  loading?: boolean;
  error?: string;
  missing?: boolean;
  retry?: () => void;
};
const templates: Array<{
  id: ReportType;
  name: string;
  description: string;
  eyebrow: string;
}> = [
  {
    id: "site-activity",
    name: "Site Activity",
    description: "Entrances, exits, occupancy and operational activity.",
    eyebrow: "Operational report",
  },
  {
    id: "visitor-profile",
    name: "Visitor Profile",
    description: "Age and sex distribution across recorded entrances.",
    eyebrow: "Demographics report",
  },
];
function ReportsView({
  identity = { organisationName: "Reports", heading: "Reports" },
  snapshot,
  effectiveNow = new Date(),
  loading = false,
  error,
  missing,
  retry = () => {},
}: Props) {
  const [type, setType] = useState<ReportType>("site-activity");
  const [period, setPeriod] = useState<ReportTimeframe>("today");
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string>();
  const valid = useMemo(() => {
    if (!snapshot) return undefined;
    try {
      return buildReportData(snapshot, type, period, effectiveNow);
    } catch (error) {
      return error instanceof Error
        ? error
        : new Error("Report snapshot data is invalid.");
    }
  }, [snapshot, type, period, effectiveNow]);
  const invalid = valid instanceof Error ? valid.message : undefined;
  const download = async () => {
    if (!valid || valid instanceof Error) return;
    setGenerating(true);
    setGenerationError(undefined);
    const generatedAt = new Date();
    try {
      const { renderReportPdf } = await import("./pdf/renderReportPdf");
      const { doc, filename } = renderReportPdf(valid, identity, generatedAt);
      doc.save(filename);
    } catch (error) {
      setGenerationError(
        error instanceof Error
          ? error.message
          : "The report could not be generated.",
      );
    } finally {
      setGenerating(false);
    }
  };
  return (
    <main className="portal-reports">
      <header className="portal-reports-header">
        <h1>Reports</h1>
        <div className="portal-reports-scope-pill">
          {identity.siteName ?? identity.organisationName}
        </div>
      </header>
      <section
        className="portal-reports-surface"
        aria-label="Report configuration"
      >
        {loading && (
          <div className="portal-reports-loading" aria-live="polite">
            <span className="portal-reports-spinner" />
            Loading report data…
          </div>
        )}
        {(error || invalid) && (
          <div
            className={`portal-reports-message ${missing ? "is-empty" : "is-error"}`}
            role={missing ? undefined : "alert"}
          >
            <div>
              <h3>
                {missing ? "No report data yet" : "Reports are unavailable"}
              </h3>
              <p>
                {missing
                  ? "Reports will become available after a Site is connected and analytics data has been collected."
                  : (invalid ?? error)}
              </p>
            </div>
            {!missing && (
              <button className="portal-reports-secondary" onClick={retry}>
                Retry
              </button>
            )}
          </div>
        )}
        {!loading && !snapshot && !error && (
          <div className="portal-reports-message is-empty">
            <div>
              <h3>No report available</h3>
              <p>No Sites Connected</p>
            </div>
          </div>
        )}
        {snapshot && !invalid && (
          <>
            <fieldset
              className="portal-reports-fieldset"
              aria-label="Choose a report"
            >
              <div className="portal-reports-types">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={type === t.id}
                    className={`portal-reports-type ${type === t.id ? "is-selected" : ""}`}
                    onClick={() => setType(t.id)}
                  >
                    <span>{t.eyebrow}</span>
                    <strong>{t.name}</strong>
                    <small>{t.description}</small>
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="portal-reports-actions">
              <label>
                Period
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as ReportTimeframe)}
                >
                  {TIMEFRAME_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="portal-reports-download"
                onClick={download}
                disabled={generating}
              >
                {generating ? "Generating…" : "Download Report"}
              </button>
            </div>
            {generationError && (
              <p className="portal-reports-inline-error" role="alert">
                {generationError}
              </p>
            )}
          </>
        )}
      </section>
    </main>
  );
}

export type ReportIdentity = {
  organisationName: string;
  siteName?: string;
  heading: string;
};

type ReportSnapshotResponse = {
  scope: { organisation_id: string; site_id: string | null };
  snapshot: SelectedSnapshot;
};

function ReportsPage() {
  const portal = usePortal();
  const effectiveNow = useMemo(
    () => new Date(portal.context!.clock.effective_now),
    [portal.context?.clock.effective_now],
  );
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
              missing:
                response.status === 404 &&
                body?.detail?.error === "report_snapshot_not_found",
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
    <ReportsView
      identity={identity}
      snapshot={current.snapshot}
      effectiveNow={effectiveNow}
      loading={!current.snapshot && !current.error}
      error={current.error}
      missing={current.missing}
      retry={() => setRevision((v) => v + 1)}
    />
  );
}

export default ReportsPage;
