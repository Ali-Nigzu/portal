import React from "react";
import { Credentials } from "../../types/credentials";
import { useAlarmLogs } from "./hooks/useAlarmLogs";
import { getSeverityClass, getSeverityText } from "./utils/severityFormatters";
interface AlarmLogsPageProps {
  credentials: Credentials;
}
const AlarmLogsPage: React.FC<AlarmLogsPageProps> = ({
  credentials,
}) => {
  const {
    alarms,
    loading,
    error,
    isAdmin,
    selectedClient,
    setSelectedClient,
    clientUsers,
    activeAlarms,
    clearedAlarms,
    refreshAlarms,
  } = useAlarmLogs(credentials);
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
              border: "4px solid var(--line-default)",
              borderTop: "4px solid var(--signal-gold)",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 16px",
            }}
          ></div>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="vrm-card">
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">Connection Error</h3>
        </div>
        <div className="vrm-card-body">
          <p style={{ color: "#8b3a2f", marginBottom: "16px" }}>
            {error}
          </p>
          <button
            className="vrm-btn"
            onClick={refreshAlarms}
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }
  return (
    <div>
      {" "}
      {}{" "}
      <div style={{ marginBottom: "24px" }}>
        <h1
          style={{
            color: "var(--vrm-text-primary)",
            fontSize: "24px",
            fontWeight: "600",
            marginBottom: "8px",
          }}
        >
          {" "}
          Alarm Logs{" "}
        </h1>
      </div>{" "}
      {}{" "}
      {isAdmin && clientUsers.length > 0 && (
        <div style={{ marginBottom: "24px" }}>
          <label
            style={{
              display: "block",
              marginBottom: "8px",
              color: "var(--vrm-text-primary)",
              fontWeight: "500",
            }}
          >
            {" "}
            Select Client{" "}
          </label>
          <select
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
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
            {" "}
            {clientUsers.map(([username, user]) => (
              <option key={username} value={username}>
                {" "}
                {user.name} ({username}){" "}
              </option>
            ))}{" "}
          </select>
        </div>
      )}{" "}
      {}{" "}
      <div className="vrm-grid vrm-grid-2" style={{ marginBottom: "24px" }}>
        <div className="vrm-card">
          <div className="vrm-card-body" style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: "36px",
                fontWeight: "700",
                color: "#8b3a2f",
                marginBottom: "8px",
              }}
            >
              {activeAlarms.length}
            </div>
            <p style={{ color: "var(--vrm-text-secondary)", fontSize: "14px" }}>
              Active Alarms
            </p>
          </div>
        </div>
        <div className="vrm-card">
          <div className="vrm-card-body" style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: "36px",
                fontWeight: "700",
                color: "#44644b",
                marginBottom: "8px",
              }}
            >
              {clearedAlarms.length}
            </div>
            <p style={{ color: "var(--vrm-text-secondary)", fontSize: "14px" }}>
              Cleared Alarms
            </p>
          </div>
        </div>
      </div>{" "}
      {}{" "}
      {activeAlarms.length > 0 && (
        <div className="vrm-card" style={{ marginBottom: "24px" }}>
          <div className="vrm-card-header">
            <h3 className="vrm-card-title">
              Active Alarms ({activeAlarms.length})
            </h3>
            <div className="vrm-card-actions">
              <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">
                Clear All
              </button>
              <button
                className="vrm-btn vrm-btn-sm"
                onClick={refreshAlarms}
              >
                Refresh
              </button>
            </div>
          </div>
          <div className="vrm-card-body" style={{ padding: 0 }}>
            <div style={{ overflowX: "auto" }}>
              <table className="vrm-table">
                <thead>
                  <tr>
                    <th>Site</th>
                    <th>Device</th>
                    <th>Alarm Type</th>
                    <th>Timestamp</th>
                    <th>Status</th>
                    <th>Severity</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {" "}
                  {activeAlarms.map((alarm) => (
                    <tr key={alarm.id}>
                      <td>{alarm.site || alarm.instance}</td>
                      <td>{alarm.device}</td>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <span>{alarm.description}</span>
                        </div>
                      </td>
                      <td>{alarm.alarmStartedAt}</td>
                      <td>
                        <span style={{ color: "#8b3a2f" }}>Active</span>
                      </td>
                      <td>
                        <div
                          className={`vrm-status ${getSeverityClass(alarm.severity)}`}
                        >
                          <div className="vrm-status-dot"></div>{" "}
                          {getSeverityText(alarm.severity)}{" "}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">
                            {" "}
                            Clear{" "}
                          </button>
                          <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">
                            {" "}
                            Details{" "}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}{" "}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}{" "}
      {}{" "}
      <div className="vrm-card">
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">
            {" "}
            Alarm History ({alarms.length} total){" "}
          </h3>
          <div className="vrm-card-actions">
            <button className="vrm-btn vrm-btn-secondary vrm-btn-sm">
              Export CSV
            </button>
            <button
              className="vrm-btn vrm-btn-sm"
              onClick={refreshAlarms}
            >
              Refresh
            </button>
          </div>
        </div>
        <div className="vrm-card-body" style={{ padding: 0 }}>
          {" "}
          {alarms.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table className="vrm-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Severity</th>
                    <th>Site</th>
                    <th>Device</th>
                    <th>Alarm Type</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {" "}
                  {alarms.map((alarm) => (
                    <tr key={alarm.id}>
                      <td>{alarm.alarmStartedAt}</td>
                      <td>
                        <div
                          className={`vrm-status ${getSeverityClass(alarm.severity)}`}
                        >
                          <div className="vrm-status-dot"></div>{" "}
                          {getSeverityText(alarm.severity)}{" "}
                        </div>
                      </td>
                      <td>{alarm.site || alarm.instance}</td>
                      <td>{alarm.device}</td>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <span>{alarm.description}</span>
                        </div>
                      </td>
                      <td>
                        {alarm.alarmClearedAfter ? (
                          <span style={{ color: "#44644b" }}>Cleared</span>
                        ) : (
                          <span style={{ color: "#8b3a2f" }}>Active</span>
                        )}
                      </td>
                    </tr>
                  ))}{" "}
                </tbody>
              </table>
            </div>
          ) : null}{" "}
        </div>
      </div>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
export default AlarmLogsPage;
