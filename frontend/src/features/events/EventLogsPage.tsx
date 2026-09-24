import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
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
  const formattedTotal =
    query.total == null ? "—" : query.total.toLocaleString();
  return (
    <section className="vrm-card portal-log-results" aria-busy={query.loading}>
      <div className="vrm-card-header portal-log-results__header">
        <div className="portal-log-results__heading">
          <h2>Events</h2>
          <span className="portal-log-results__count">{formattedTotal}</span>
        </div>
        <button
          className="vrm-btn vrm-btn-secondary portal-log-secondary-action"
          onClick={exportCsv}
          disabled={exporting || query.loading || Boolean(query.error)}
        >
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>
      {exportError && (
        <div className="portal-log-inline-error" role="alert">
          {exportError}
        </div>
      )}
      {query.loading ? (
        <div
          className="portal-log-state portal-log-state--loading"
          role="status"
        >
          <span className="portal-log-spinner" aria-hidden="true" />
          <span>Loading events…</span>
        </div>
      ) : query.error ? (
        <div className="portal-log-state portal-log-state--error" role="alert">
          <div>
            <strong>Events are unavailable</strong>
            <p>{query.error}</p>
          </div>
          <button className="vrm-btn vrm-btn-secondary" onClick={query.retry}>
            Retry
          </button>
        </div>
      ) : query.data?.items.length ? (
        <div className="vrm-table-scroll event-logs-table-scroll">
          <table className="vrm-table portal-log-table event-logs-table">
            <thead>
              <tr>
                <th className="event-logs-col-site" scope="col">
                  Site
                </th>
                <th className="event-logs-col-source" scope="col">
                  Source
                </th>
                <th className="event-logs-col-id" scope="col">
                  Event ID
                </th>
                <th className="event-logs-col-type" scope="col">
                  Event Type
                </th>
                <th className="event-logs-col-timestamp" scope="col">
                  Timestamp
                </th>
                <th className="event-logs-col-sex" scope="col">
                  Sex
                </th>
                <th className="event-logs-col-age" scope="col">
                  Age
                </th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((row) => (
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
      ) : (
        <div className="portal-log-state portal-log-state--empty" role="status">
          <strong>No events found</strong>
          <p>No events match these filters.</p>
        </div>
      )}
      <div className="vrm-card-body vrm-pagination portal-log-pagination">
        <button
          className="vrm-btn portal-log-utility-action"
          disabled={!query.page || query.loading || Boolean(query.error)}
          onClick={query.previous}
        >
          Previous
        </button>
        <span className="portal-log-pagination__label">
          Page {query.page + 1} of{" "}
          {Math.max(1, Math.ceil((query.total ?? 0) / 20))}
        </span>
        <button
          className="vrm-btn portal-log-utility-action"
          disabled={
            !query.data?.page.next_cursor ||
            query.loading ||
            Boolean(query.error)
          }
          onClick={query.next}
        >
          Next
        </button>
      </div>
    </section>
  );
}
function CanonicalEvents() {
  const portal = usePortal();
  const location = useLocation();
  const requestedSources = new URLSearchParams(location.search).getAll("source");
  const allowedSources = new Set(
    portal.context!.sources
      .filter((source) => portal.selection?.scope !== "site" || source.site_id === portal.selection.id)
      .map((source) => source.ref),
  );
  const validSources = requestedSources.filter((source) => allowedSources.has(source));
  const invalidDeepLink = requestedSources.length !== validSources.length;
  const initialFilters = { ...emptyFilters, sources: validSources };
  const initialApplied = filterParams(initialFilters).toString();
  const [draft, setDraft] = useState<Filters>(initialFilters);
  const [applied, setApplied] = useState(initialApplied);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState(
    invalidDeepLink ? "The requested source is unavailable in this Portal scope." : "",
  );
  return (
    <div className="event-logs-page">
      <header className="portal-log-page-header">
        <h1 className="portal-log-page-title">Event Logs</h1>
      </header>
      <form
        className="vrm-card portal-log-filter-card"
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
        <div className="portal-log-filter-header">
          <h2>Filters</h2>
        </div>
        <div className="portal-log-filter-body">
          <PortalFilters value={draft} onChange={setDraft} />
        </div>
        <div className="portal-log-filter-actions">
          {error && (
            <p className="portal-log-form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="vrm-btn vrm-btn-primary portal-log-primary-action"
            type="submit"
          >
            Search
          </button>
        </div>
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
