import { useMemo, useState } from "react";
import type { SelectedSnapshot } from "../organisation-dashboard/types";
import { buildReportData, type ReportType } from "./engine/ReportsEngine";
import { renderReportPdf } from "./pdf/renderReportPdf";
import { TIMEFRAME_OPTIONS, type ReportTimeframe } from "./utils/reportUtils";
import "./ReportsPage.css";

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
export default function ReportsPage({
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
  const download = () => {
    if (!valid || valid instanceof Error) return;
    setGenerating(true);
    setGenerationError(undefined);
    try {
      const { doc, filename } = renderReportPdf(valid, identity, new Date());
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
              <p>{missing
                ? "Reports will become available after a Site is connected and analytics data has been collected."
                : invalid ?? error}</p>
            </div>
            {!missing && <button className="portal-reports-secondary" onClick={retry}>
              Retry
            </button>}
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

export type ReportIdentity = { organisationName: string; siteName?: string; heading: string };
