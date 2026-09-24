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
      <table className="vrm-table portal-log-table alarm-logs-table">
        <thead>
          <tr>
            <th className="alarm-logs-col-site" scope="col">
              Site
            </th>
            <th className="alarm-logs-col-source" scope="col">
              Source
            </th>
            <th className="alarm-logs-col-type" scope="col">
              Alarm Type
            </th>
            <th className="alarm-logs-col-timestamp" scope="col">
              Timestamp
            </th>
            <th className="alarm-logs-col-status" scope="col">
              Status
            </th>
            <th className="alarm-logs-col-severity" scope="col">
              Severity
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td>{row.site.name}</td>
              <td>{row.source.label}</td>
              <td>{row.type.label}</td>
              <td>{new Date(row.started_at).toLocaleString()}</td>
              <td>
                <span
                  className={`alarm-status-badge alarm-status-badge--${row.status}`}
                >
                  {row.status === "active" ? "Active" : "Cleared"}
                </span>
              </td>
              <td>
                <span
                  className={`alarm-severity-badge alarm-severity-badge--${row.severity}`}
                >
                  {row.severity.charAt(0).toUpperCase() + row.severity.slice(1)}
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
  if (query.loading)
    return (
      <div
        className="portal-log-state portal-log-state--loading alarm-logs-loading"
        role="status"
      >
        <span className="portal-log-spinner" aria-hidden="true" />
        <span>Loading alarms…</span>
      </div>
    );
  if (query.error)
    return (
      <div
        className="vrm-card portal-log-state portal-log-state--error alarm-logs-error"
        role="alert"
      >
        <div>
          <strong>Alarms are unavailable</strong>
          <p>{query.error}</p>
        </div>
        <button className="vrm-btn vrm-btn-secondary" onClick={query.retry}>
          Retry
        </button>
      </div>
    );
  return (
    <div className="alarm-logs-results" aria-busy={query.loading}>
      <div className="portal-log-counts">
        {(["active", "cleared"] as const).map((status) => (
          <div
            key={status}
            className={`vrm-card portal-log-metric portal-log-metric--${status}`}
          >
            <div className="vrm-card-body portal-log-metric__body">
              <span className="portal-log-metric__label">
                <span
                  className="portal-log-metric__marker"
                  aria-hidden="true"
                />
                {status === "active" ? "Active Alarms" : "Cleared Alarms"}
              </span>
              <strong className="portal-log-metric__value">
                {(query.data?.counts?.[status] ?? 0).toLocaleString()}
              </strong>
            </div>
          </div>
        ))}
      </div>
      <section className="vrm-card portal-log-results alarm-logs-section alarm-logs-section--active">
        <div className="vrm-card-header portal-log-results__header alarm-logs-section-header">
          <div className="alarm-logs-section-heading">
            <span
              className="alarm-logs-section-marker alarm-logs-section-marker--active"
              aria-hidden="true"
            />
            <h2>Active Alarms</h2>
            <span className="portal-log-results__count">
              {(query.data?.counts?.active ?? 0).toLocaleString()}
            </span>
          </div>
          <button
            className="vrm-btn vrm-btn-secondary portal-log-secondary-action"
            onClick={query.retry}
          >
            Refresh
          </button>
        </div>
        {query.data?.active?.items.length ? (
          <AlarmTable items={query.data.active.items} />
        ) : (
          <div
            className="portal-log-state portal-log-state--empty"
            role="status"
          >
            <strong>No active alarms</strong>
            <p>No active alarms match these filters.</p>
          </div>
        )}
      </section>
      <section className="vrm-card portal-log-results alarm-logs-section alarm-logs-section--cleared">
        <div className="vrm-card-header portal-log-results__header alarm-logs-section-header">
          <div className="alarm-logs-section-heading">
            <span
              className="alarm-logs-section-marker alarm-logs-section-marker--cleared"
              aria-hidden="true"
            />
            <h2>Cleared Alarms</h2>
            <span className="portal-log-results__count">
              {(query.data?.counts?.cleared ?? 0).toLocaleString()}
            </span>
          </div>
        </div>
        {query.items.length ? (
          <AlarmTable items={query.items} />
        ) : (
          <div
            className="portal-log-state portal-log-state--empty"
            role="status"
          >
            <strong>No cleared alarms</strong>
            <p>No cleared alarms match these filters.</p>
          </div>
        )}
        <div className="vrm-card-body alarm-logs-more">
          {query.moreError && (
            <p className="portal-log-inline-error" role="alert">
              {query.moreError}
            </p>
          )}
          {query.cursor && (
            <button
              className="vrm-btn vrm-btn-secondary portal-log-secondary-action"
              disabled={query.loadingMore}
              onClick={query.showMore}
            >
              {query.loadingMore ? "Loading…" : "Show more"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
function CanonicalAlarms() {
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [applied, setApplied] = useState("");
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  return (
    <div className="alarm-logs-page">
      <header className="portal-log-page-header">
        <h1 className="portal-log-page-title">Alarm Logs</h1>
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
          <PortalFilters alarms value={draft} onChange={setDraft} />
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
            Apply filters
          </button>
        </div>
      </form>
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
