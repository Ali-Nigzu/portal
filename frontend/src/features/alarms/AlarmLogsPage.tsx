import { useState } from "react";
import { useOptionalPortal } from "../../context/PortalContext";
import {
  PortalFilters,
  emptyFilters,
  filterParams,
  type Filters,
} from "../../components/PortalFilters";
import { useAlarmLogs } from "./hooks/useAlarmLogs";
import type { AlarmEvent } from "./types";
import type { Credentials } from "../../types/credentials";
import "./AlarmLogsPage.css";
import "../../styles/PortalLogs.css";

function AlarmTable({ items }: { items: AlarmEvent[] }) {
  return (
    <div className="vrm-table-scroll alarm-logs-table-scroll">
      <table className="vrm-table portal-log-table">
        <thead>
          <tr>
            {[
              "Site",
              "Source",
              "Alarm Type",
              "Timestamp",
              "Status",
              "Severity",
            ].map((t) => (
              <th key={t}>{t}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td>{row.site.name}</td>
              <td>{row.source.label}</td>
              <td>{row.type.label}</td>
              <td>{new Date(row.started_at).toLocaleString()}</td>
              <td>{row.status === "active" ? "Active" : "Cleared"}</td>
              <td>
                <span className={`vrm-status ${row.severity}`}>
                  {row.severity}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Results({ filters }: { filters: string }) {
  const query = useAlarmLogs(filters);
  if (query.loading) return <p role="status">Loading alarms…</p>;
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
    <>
      <div className="portal-log-counts">
        {(["active", "cleared"] as const).map((status) => (
          <div key={status} className="vrm-card">
            <div className="vrm-card-body">
              <strong>{query.data?.counts?.[status]}</strong>
              {status === "active" ? "Active Alarms" : "Cleared Alarms"}
            </div>
          </div>
        ))}
      </div>
      <section className="vrm-card">
        <div className="vrm-card-header">
          <h3>Active Alarms ({query.data?.counts?.active})</h3>
          <button className="vrm-btn" onClick={query.retry}>
            Refresh
          </button>
        </div>
        {query.data?.active?.items.length ? (
          <AlarmTable items={query.data.active.items} />
        ) : (
          <p className="vrm-card-body">No active alarms match these filters.</p>
        )}
      </section>
      <section className="vrm-card">
        <div className="vrm-card-header">
          <h3>Cleared Alarms ({query.data?.counts?.cleared})</h3>
        </div>
        {query.items.length ? (
          <AlarmTable items={query.items} />
        ) : (
          <p className="vrm-card-body">
            No cleared alarms match these filters.
          </p>
        )}
        <div className="vrm-card-body">
          {query.moreError && <p role="alert">{query.moreError}</p>}
          {query.cursor && (
            <button
              className="vrm-btn"
              disabled={query.loadingMore}
              onClick={query.showMore}
            >
              {query.loadingMore ? "Loading…" : "Show more"}
            </button>
          )}
        </div>
      </section>
    </>
  );
}
function CanonicalAlarms() {
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [applied, setApplied] = useState("");
  const [revision, setRevision] = useState(0);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="alarm-logs-page">
      <div className="vrm-card-header">
        <h1>Alarm Logs</h1>
        <button
          className="vrm-btn"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          Filter
        </button>
      </div>
      {open && (
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
          <PortalFilters alarms value={draft} onChange={setDraft} />
          <button className="vrm-btn" type="submit">
            Apply filters
          </button>
          {error && <p role="alert">{error}</p>}
        </form>
      )}
      <Results key={`${applied}:${revision}`} filters={applied} />
    </div>
  );
}
export default function AlarmLogsPage(_props: { credentials?: Credentials }) {
  return useOptionalPortal() ? (
    <CanonicalAlarms />
  ) : (
    <div role="alert">An authorised Portal context is required.</div>
  );
}
