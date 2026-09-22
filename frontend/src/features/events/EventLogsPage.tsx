import { useEffect, useRef, useState } from "react";
import {
  useOptionalPortal,
  usePortal,
  scopeParams,
  responseJson,
} from "../../context/PortalContext";
import {
  PortalFilters,
  emptyFilters,
  filterParams,
  type Filters,
} from "../../components/PortalFilters";
import { useEventLogsQuery } from "./hooks/useEventLogsQuery";
import type { Credentials } from "../../types/credentials";
import "./EventLogsPage.css";
import "../../styles/PortalLogs.css";

function Results({ filters }: { filters: string }) {
  const query = useEventLogsQuery(filters);
  const portal = usePortal();
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState(false);
  const controller = useRef<AbortController>();
  useEffect(() => () => controller.current?.abort(), []);
  async function exportCsv() {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setExporting(true);
    setExportError("");
    try {
      const params = scopeParams(portal);
      new URLSearchParams(filters).forEach((v, k) => params.append(k, v));
      const response = await portal.source.request(
        "/events/export",
        params,
        abort.signal,
      );
      if (!response.ok) await responseJson(response);
      const blob = await response.blob();
      if (abort.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "events.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      if (!abort.signal.aborted)
        setExportError(
          error instanceof Error ? error.message : "Export unavailable.",
        );
    } finally {
      if (!abort.signal.aborted) setExporting(false);
    }
  }
  if (query.loading) return <p role="status">Loading events…</p>;
  if (query.error)
    return (
      <div role="alert">
        {query.error}
        <button className="vrm-btn" onClick={query.retry}>
          Retry
        </button>
      </div>
    );
  return (
    <div className="vrm-card">
      <div className="vrm-card-header">
        <h3>Events ({query.total ?? "—"})</h3>
        <button className="vrm-btn" onClick={exportCsv} disabled={exporting}>
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>
      {exportError && <p role="alert">{exportError}</p>}
      <div className="vrm-table-scroll event-logs-table-scroll">
        <table className="vrm-table portal-log-table">
          <thead>
            <tr>
              {[
                "Site",
                "Source",
                "Event ID",
                "Event Type",
                "Timestamp",
                "Sex",
                "Age",
              ].map((t) => (
                <th key={t}>{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {query.data?.items.map((row) => (
              <tr key={row.event_id}>
                <td>{row.site.name}</td>
                <td>{row.source.label}</td>
                <td>
                  <span
                    className="portal-event-id"
                    title={row.event_id}
                    tabIndex={0}
                  >
                    {row.event_id}
                  </span>
                </td>
                <td>{row.event.label}</td>
                <td>{new Date(row.timestamp).toLocaleString()}</td>
                <td>{row.sex.label}</td>
                <td>{row.age.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!query.data?.items.length && (
        <p className="vrm-card-body">No events match these filters.</p>
      )}
      <div className="vrm-card-body vrm-pagination">
        <button
          className="vrm-btn"
          disabled={!query.page}
          onClick={query.previous}
        >
          Previous
        </button>
        <span>
          Page {query.page + 1} of{" "}
          {Math.max(1, Math.ceil((query.total ?? 0) / 20))}
        </span>
        <button
          className="vrm-btn"
          disabled={!query.data?.page.next_cursor}
          onClick={query.next}
        >
          Next
        </button>
      </div>
    </div>
  );
}
function CanonicalEvents() {
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [applied, setApplied] = useState("");
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  return (
    <div className="event-logs-page">
      <h1>Event Logs</h1>
      <form
        className="vrm-card vrm-card-body"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            setApplied(filterParams(draft).toString());
            setRevision((v) => v + 1);
            setError("");
          } catch {
            setError("Invalid date range.");
          }
        }}
      >
        <PortalFilters value={draft} onChange={setDraft} />
        <p>Gateway selection includes all device events for that site.</p>
        <button className="vrm-btn" type="submit">
          Search
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
      <Results key={`${applied}:${revision}`} filters={applied} />
    </div>
  );
}
export default function EventLogsPage(_props: { credentials?: Credentials }) {
  return useOptionalPortal() ? (
    <CanonicalEvents />
  ) : (
    <div role="alert">An authorised Portal context is required.</div>
  );
}
