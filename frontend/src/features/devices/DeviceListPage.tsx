import React from "react";
import { Credentials } from "../../types/credentials";
import { useDeviceList } from "./hooks/useDeviceList";
import { getStatusClass, getStatusText } from "./utils/statusFormatters";

interface DeviceListPageProps {
  credentials: Credentials;
}

const DeviceListPage: React.FC<DeviceListPageProps> = ({
  credentials,
}) => {
  const {
    devices,
    loading,
    error,
    isAdmin,
    selectedClient,
    setSelectedClient,
    clientUsers,
    refreshDevices,
  } = useDeviceList(credentials);

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "400px",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              border: "4px solid #333",
              borderTop: "4px solid #1976d2",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 16px",
            }}
          />
        </div>
      </div>
    );
  }

  const onlineDevices = devices.filter(
    (device) => device.status === "online",
  ).length;
  const offlineDevices = devices.filter(
    (device) => device.status === "offline",
  ).length;

  return (
    <div>
      <div style={{ marginBottom: "24px" }}>
        <h1
          style={{
            color: "var(--vrm-text-primary)",
            fontSize: "24px",
            fontWeight: "600",
            marginBottom: "8px",
          }}
        >
          Device List
        </h1>
      </div>
      {isAdmin && clientUsers.length > 0 ? (
        <div style={{ marginBottom: "24px" }}>
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
        <div className="vrm-card" style={{ marginBottom: "24px" }}>
          <div className="vrm-card-body">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                color: "var(--vrm-accent-orange)",
              }}
            >
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          </div>
        </div>
      ) : null}
      <div className="vrm-grid vrm-grid-3" style={{ marginBottom: "24px" }}>
        <div className="vrm-card">
          <div className="vrm-card-body" style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: "36px",
                fontWeight: "700",
                color: "var(--vrm-accent-blue)",
                marginBottom: "8px",
              }}
            >
              {devices.length}
            </div>
            <p style={{ color: "var(--vrm-text-secondary)", fontSize: "14px" }}>
              Total Devices
            </p>
          </div>
        </div>
        <div className="vrm-card">
          <div className="vrm-card-body" style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: "36px",
                fontWeight: "700",
                color: "var(--vrm-accent-green)",
                marginBottom: "8px",
              }}
            >
              {onlineDevices}
            </div>
            <p style={{ color: "var(--vrm-text-secondary)", fontSize: "14px" }}>
              Online
            </p>
          </div>
        </div>
        <div className="vrm-card">
          <div className="vrm-card-body" style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: "36px",
                fontWeight: "700",
                color: "var(--vrm-accent-orange)",
                marginBottom: "8px",
              }}
            >
              {offlineDevices}
            </div>
            <p style={{ color: "var(--vrm-text-secondary)", fontSize: "14px" }}>
              Offline
            </p>
          </div>
        </div>
      </div>
      <div className="vrm-card" style={{ marginBottom: "24px" }}>
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">Devices</h3>
          <div className="vrm-card-actions">
            <button
              className="vrm-btn vrm-btn-secondary vrm-btn-sm"
              onClick={refreshDevices}
            >
              Refresh
            </button>
          </div>
        </div>
        <div className="vrm-card-body" style={{ padding: 0 }}>
          {devices.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table className="vrm-table">
                <thead>
                  <tr>
                    <th>Device Name</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Location</th>
                    <th>Last Seen</th>
                    <th>Records</th>
                    <th>Data Source</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((device) => (
                    <tr key={device.id}>
                      <td>
                        <div>
                          <div style={{ fontWeight: "600" }}>{device.name}</div>
                          <div
                            style={{
                              fontSize: "12px",
                              color: "var(--vrm-text-muted)",
                            }}
                          >
                            {device.id}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`vrm-status ${
                            device.type === "Camera"
                              ? "vrm-status-online"
                              : device.type === "Sensor"
                                ? "vrm-status-warning"
                                : "vrm-status-offline"
                          }`}
                        >
                          {device.type}
                        </span>
                      </td>
                      <td>
                        <div
                          className={`vrm-status ${getStatusClass(
                            device.status,
                          )}`}
                        >
                          <div className="vrm-status-dot"></div>
                          {getStatusText(device.status)}
                        </div>
                      </td>
                      <td>{device.location || "-"}</td>
                      <td
                        style={{
                          fontSize: "13px",
                          color: "var(--vrm-text-secondary)",
                        }}
                      >
                        {new Date(device.lastSeen).toLocaleString()}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {device.recordCount || "-"}
                      </td>
                      <td
                        style={{
                          maxWidth: "200px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {device.dataSource ? (
                          <code
                            style={{
                              fontSize: "11px",
                              color: "var(--vrm-text-muted)",
                            }}
                          >
                            {device.dataSource}
                          </code>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>
      <style>{`
        @keyframes spin {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
};

export default DeviceListPage;
