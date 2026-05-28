import React from "react";
import { Credentials } from "../../types/credentials";
import { useDeviceList } from "./hooks/useDeviceList";
import { getStatusText } from "./utils/statusFormatters";
import "./DeviceListPage.css";

interface DeviceListPageProps {
  credentials: Credentials;
}

const siteNameForScope = (activeSiteId: string) => {
  switch (activeSiteId) {
    case "site-a":
    case "ab":
      return "Ali’s Barber";
    case "site-b":
    case "tt":
      return "Tokis Takeout";
    default:
      return "All Sites";
  }
};

const typeIcon = (type: string) => {
  switch (type) {
    case "Gateway":
      return "▣";
    case "Door":
      return "⇄";
    case "Camera":
      return "◉";
    default:
      return "◇";
  }
};

const DeviceListPage: React.FC<DeviceListPageProps> = ({ credentials }) => {
  const {
    devices,
    dataSources,
    loading,
    error,
    isAdmin,
    selectedClient,
    setSelectedClient,
    clientUsers,
    refreshDevices,
    downloadDataSource,
    isDemoSession,
    activeSiteId,
  } = useDeviceList(credentials);

  if (loading) {
    return (
      <div className="device-runtime-page">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "400px",
          }}
        >
          <div
            style={{
              width: "40px",
              height: "40px",
              border: "4px solid var(--line-default)",
              borderTop: "4px solid var(--signal-gold)",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />
        </div>
      </div>
    );
  }

  const onlineDevices = devices.filter((device) => device.status === "online").length;
  const offlineDevices = devices.filter((device) => device.status === "offline").length;
  const gatewayCount = devices.filter((device) => device.type === "Gateway").length;
  const scopeName = siteNameForScope(activeSiteId);
  const siteGroups = devices.reduce<Record<string, typeof devices>>((groups, device) => {
    const groupName = device.siteName || scopeName;
    groups[groupName] = groups[groupName] || [];
    groups[groupName].push(device);
    return groups;
  }, {});

  return (
    <div className="device-runtime-page">
      <div className="device-runtime-header">
        <div>
          <p className="device-runtime-eyebrow">Runtime inventory</p>
          <h1 className="device-runtime-title">Device List</h1>
          <p className="device-runtime-subtitle">
            Site-aware device inventory with deterministic demo devices, status signals, locations,
            and ownership context for the active scope.
          </p>
        </div>
        <div className="device-runtime-scope-pill" aria-label={`Current scope: ${scopeName}`}>
          <span className="device-runtime-scope-dot" />
          {scopeName}
        </div>
      </div>

      {isAdmin && clientUsers.length > 0 ? (
        <div className="vrm-card" style={{ padding: 16 }}>
          <label
            style={{
              display: "block",
              marginBottom: "8px",
              color: "var(--vrm-text-primary)",
              fontWeight: "500",
            }}
          >
            Select Client
          </label>
          <select
            value={selectedClient}
            onChange={(event) => setSelectedClient(event.target.value)}
            style={{
              padding: "10px 12px",
              backgroundColor: "var(--vrm-bg-tertiary)",
              border: "1px solid var(--vrm-border-color)",
              borderRadius: "4px",
              color: "var(--vrm-text-primary)",
              fontSize: "14px",
              minWidth: "250px",
              cursor: "pointer",
            }}
          >
            {clientUsers.map(([username, user]) => (
              <option key={username} value={username}>
                {user.name} ({username})
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {error ? (
        <div className="vrm-card">
          <div className="vrm-card-body">
            <div style={{ display: "flex", alignItems: "center", gap: "12px", color: "#8b6321" }}>
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          </div>
        </div>
      ) : null}

      <div className="device-runtime-summary-grid">
        <div className="vrm-card device-runtime-stat">
          <div className="vrm-card-body">
            <div>
              <div className="device-runtime-stat-label">Total Devices</div>
              <div className="device-runtime-stat-value">{devices.length}</div>
              <div className="device-runtime-stat-note">Visible in this scope</div>
            </div>
            <div className="device-runtime-stat-icon">▦</div>
          </div>
        </div>
        <div className="vrm-card device-runtime-stat">
          <div className="vrm-card-body">
            <div>
              <div className="device-runtime-stat-label">Online</div>
              <div className="device-runtime-stat-value">{onlineDevices}</div>
              <div className="device-runtime-stat-note">Reporting normally</div>
            </div>
            <div className="device-runtime-stat-icon">●</div>
          </div>
        </div>
        <div className="vrm-card device-runtime-stat">
          <div className="vrm-card-body">
            <div>
              <div className="device-runtime-stat-label">Offline</div>
              <div className="device-runtime-stat-value">{offlineDevices}</div>
              <div className="device-runtime-stat-note">Needs attention</div>
            </div>
            <div className="device-runtime-stat-icon">○</div>
          </div>
        </div>
        <div className="vrm-card device-runtime-stat">
          <div className="vrm-card-body">
            <div>
              <div className="device-runtime-stat-label">Gateways</div>
              <div className="device-runtime-stat-value">{gatewayCount}</div>
              <div className="device-runtime-stat-note">Network anchors</div>
            </div>
            <div className="device-runtime-stat-icon">▣</div>
          </div>
        </div>
      </div>

      <div className="vrm-card device-runtime-section">
        <div className="device-runtime-section-header">
          <div>
            <h3 className="device-runtime-section-title">Devices</h3>
            <p className="device-runtime-section-subtitle">
              {isDemoSession
                ? "Demo inventory changes immediately as the selected site scope changes."
                : "Live inventory for the selected account."}
            </p>
          </div>
          <div className="vrm-card-actions">
            <button className="vrm-btn vrm-btn-secondary vrm-btn-sm" onClick={refreshDevices}>
              Refresh
            </button>
          </div>
        </div>
        <div className="device-runtime-groups">
          {Object.entries(siteGroups).map(([siteName, siteDevices]) => (
            <section className="device-runtime-site-group" key={siteName} aria-label={`${siteName} devices`}>
              <div className="device-runtime-site-heading">
                <span>{siteName}</span>
                <span className="device-runtime-site-count">
                  {siteDevices.length} {siteDevices.length === 1 ? "device" : "devices"}
                </span>
              </div>
              <div className="device-runtime-device-grid">
                {siteDevices.map((device) => (
                  <article className="device-runtime-card" key={device.id} tabIndex={0}>
                    <div className="device-runtime-card-top">
                      <div className="device-runtime-device-icon" aria-hidden="true">
                        {typeIcon(device.type)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <h4 className="device-runtime-device-name">{device.name}</h4>
                        <div className="device-runtime-device-id">{device.id}</div>
                      </div>
                      <span className={`device-runtime-status device-runtime-status--${device.status}`}>
                        {getStatusText(device.status)}
                      </span>
                    </div>
                    <div className="device-runtime-meta-grid">
                      <div className="device-runtime-meta">
                        <span className="device-runtime-meta-label">Type</span>
                        <span className="device-runtime-meta-value">{device.type}</span>
                      </div>
                      <div className="device-runtime-meta">
                        <span className="device-runtime-meta-label">Location</span>
                        <span className="device-runtime-meta-value">{device.location || "-"}</span>
                      </div>
                      <div className="device-runtime-meta">
                        <span className="device-runtime-meta-label">Last seen</span>
                        <span className="device-runtime-meta-value">
                          {new Date(device.lastSeen).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <div className="device-runtime-meta">
                        <span className="device-runtime-meta-label">Records</span>
                        <span className="device-runtime-meta-value">{device.recordCount ?? "-"}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      {!isDemoSession && dataSources.length > 0 ? (
        <div className="vrm-card device-runtime-section">
          <div className="device-runtime-section-header">
            <div>
              <h3 className="device-runtime-section-title">Data Sources</h3>
              <p className="device-runtime-section-subtitle">Configured source feeds for this account.</p>
            </div>
          </div>
          <div className="vrm-card-body" style={{ padding: 0 }}>
            <div className="device-runtime-table-wrap">
              <table className="vrm-table">
                <thead>
                  <tr>
                    <th>Source Name</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Data URL</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {dataSources.map((source) => (
                    <tr key={source.id}>
                      <td>
                        <div>
                          <div style={{ fontWeight: "600" }}>{source.title}</div>
                          <div style={{ fontSize: "12px", color: "var(--vrm-text-muted)" }}>{source.id}</div>
                        </div>
                      </td>
                      <td>
                        <span className="vrm-status vrm-status-warning">{source.type}</span>
                      </td>
                      <td>
                        <div className={`vrm-status ${source.active ? "vrm-status-online" : "vrm-status-offline"}`}>
                          <div className="vrm-status-dot"></div>
                          {source.active ? "Active" : "Inactive"}
                        </div>
                      </td>
                      <td style={{ maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <code style={{ fontSize: "11px", color: "var(--vrm-text-muted)" }}>{source.url}</code>
                      </td>
                      <td>
                        <button
                          className="vrm-btn vrm-btn-primary vrm-btn-sm"
                          onClick={() => downloadDataSource(source.url, source.title)}
                        >
                          Download CSV
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default DeviceListPage;
