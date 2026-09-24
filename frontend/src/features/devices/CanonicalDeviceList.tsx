import { Link, useLocation } from "react-router-dom";
import { usePortal } from "../../context/PortalContext";
import { useCanonicalDeviceList, type DeviceView } from "./hooks/useCanonicalDeviceList";
import "./DeviceListPage.css";

function activityLabel(item: DeviceView) {
  if (item.kind === "gateway") return "Activity unavailable";
  if (item.freshness === "fresh") return "Fresh activity";
  if (item.freshness === "stale") return "Last activity stale";
  return "No activity data";
}

function SourceCard({ item, refresh, setEnabled }: {
  item: DeviceView;
  refresh: () => void;
  setEnabled: (item: DeviceView, enabled: boolean) => Promise<void>;
}) {
  const location = useLocation();
  const state = item.displayed_enabled ? "Enabled" : "Disconnected";
  const eventPath = location.pathname.replace(/\/device-list$/, "/event-logs");
  return (
    <article className="device-runtime-card" aria-busy={item.pending}>
      <div>
        <div className="device-runtime-card-top">
          <h4 className="device-runtime-device-name">{item.name}</h4>
          <span className={`device-runtime-status device-runtime-status--${item.displayed_enabled ? "online" : "offline"}`}>
            {state}
          </span>
        </div>
        <p className="device-runtime-activity">{activityLabel(item)}</p>
      </div>
      <dl className="device-runtime-meta-grid">
        <div className="device-runtime-meta">
          <dt className="device-runtime-meta-label">Last activity</dt>
          <dd className="device-runtime-meta-value">
            {item.analyzed_until ? new Date(item.analyzed_until).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Unavailable"}
          </dd>
        </div>
        <div className="device-runtime-meta">
          <dt className="device-runtime-meta-label">Source type</dt>
          <dd className="device-runtime-meta-value">{item.kind === "gateway" ? "Gateway" : "Device"}</dd>
        </div>
        <div className="device-runtime-meta">
          <dt className="device-runtime-meta-label">Records</dt>
          <dd className="device-runtime-meta-value device-runtime-records-value-stack">
            <span>{item.records_status === "available" && item.records != null ? item.records.toLocaleString() : "Unavailable"}</span>
            <Link
              className="device-runtime-see-more"
              to={`${eventPath}?source=${encodeURIComponent(item.ref)}`}
              aria-label={`View events for ${item.name} at ${item.site_name}`}
            >
              See More <span aria-hidden="true">→</span>
            </Link>
          </dd>
        </div>
        <div className="device-runtime-meta">
          <dt className="device-runtime-meta-label">State</dt>
          <dd className="device-runtime-meta-value">{state}</dd>
        </div>
      </dl>
      {item.control_error && <p className="device-runtime-card-error" role="alert">{item.control_error}</p>}
      <div className="device-runtime-card-controls">
        <button className="device-runtime-icon-action" onClick={refresh} aria-label={`Refresh ${item.name} at ${item.site_name}`}>
          Refresh
        </button>
        <button
          className={`device-runtime-primary-action device-runtime-primary-action--${item.displayed_enabled ? "online" : "offline"}`}
          disabled={item.pending}
          onClick={() => setEnabled(item, !item.displayed_enabled)}
          aria-label={`${item.displayed_enabled ? "Disconnect" : "Connect"} ${item.name} at ${item.site_name}`}
        >
          {item.pending ? "Updating…" : item.displayed_enabled ? "Disconnect" : "Connect"}
        </button>
      </div>
      <span className="device-runtime-announcement" aria-live="polite">
        {!item.pending && !item.control_error ? `${item.name} is ${state.toLowerCase()}.` : ""}
      </span>
    </article>
  );
}

export default function CanonicalDeviceList() {
  const { context, selection } = usePortal();
  const devices = useCanonicalDeviceList();
  const scopeName = selection?.scope === "site"
    ? context!.sites.find((site) => site.id === selection.id)?.name
    : context!.organisation.name;
  const stats = [
    ["Total Sources", devices.summary.total],
    ["Enabled", devices.summary.enabled],
    ["Disconnected", devices.summary.disconnected],
    ["Gateways", devices.summary.gateways],
  ] as const;
  return (
    <main className="device-runtime-page">
      <header className="device-runtime-header">
        <div>
          <h1 className="device-runtime-title">Device List</h1>
          <span className="device-runtime-scope-pill"><span className="device-runtime-scope-dot" />{scopeName}</span>
        </div>
      </header>
      <section className="device-runtime-summary-grid" aria-label="Source summary">
        {stats.map(([label, value]) => (
          <div className="vrm-card device-runtime-stat" key={label}>
            <div className="vrm-card-body">
              <span className="device-runtime-stat-label">{label}</span>
              <strong className="device-runtime-stat-value">{devices.loading ? "—" : value.toLocaleString()}</strong>
              <span className="device-runtime-stat-note">Current scope</span>
            </div>
          </div>
        ))}
      </section>
      <section className="vrm-card device-runtime-section" aria-labelledby="device-list-heading" aria-busy={devices.loading || devices.refreshing}>
        <div className="device-runtime-section-header">
          <h2 className="device-runtime-section-title" id="device-list-heading">Devices</h2>
          <button className="vrm-btn vrm-btn-secondary" onClick={devices.refresh} disabled={devices.loading || devices.refreshing}>
            {devices.refreshing ? "Refreshing…" : "Refresh All"}
          </button>
        </div>
        {devices.error && !devices.items.length ? (
          <div className="device-runtime-state" role="alert"><strong>Device data is unavailable.</strong><p>{devices.error}</p><button className="vrm-btn vrm-btn-secondary" onClick={devices.retry}>Retry</button></div>
        ) : devices.loading ? (
          <div className="device-runtime-groups" role="status" aria-label="Loading devices">
            <div className="device-runtime-device-grid">{[0, 1, 2].map((value) => <div className="device-runtime-card device-runtime-card--skeleton" key={value} />)}</div>
          </div>
        ) : !devices.items.length ? (
          <div className="device-runtime-state">No sources in this scope.</div>
        ) : (
          <div className="device-runtime-groups">
            {devices.recordsStatus === "unavailable" && <div className="device-runtime-warning" role="alert">Record counts are temporarily unavailable. Source controls and Event Logs remain available.</div>}
            {devices.error && <div className="device-runtime-warning" role="alert">Refresh failed. Showing the last available device data.</div>}
            {devices.groups.map((group) => (
              <section className="device-runtime-site-group" key={group.site_id} aria-labelledby={`site-${group.site_id}`}>
                <h3 id={`site-${group.site_id}`}>{group.site_name}</h3>
                <div className="device-runtime-device-grid">
                  {group.items.map((item) => <SourceCard key={item.ref} item={item} refresh={devices.refresh} setEnabled={devices.setEnabled} />)}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
