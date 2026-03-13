import React, { useState } from "react";
import type { AdminUser, AlarmEvent, NewAlarmPayload } from "../types";

type AlertPayload = {
  message: string;
  type: "success" | "error";
};

type AlarmsPanelProps = {
  alarms: AlarmEvent[];
  clientUsers: AdminUser[];
  selectedClient: string;
  setSelectedClient: (value: string) => void;
  onAlert: (alert: AlertPayload | null) => void;
  onAddAlarm: (payload: NewAlarmPayload) => Promise<boolean>;
  onUpdateAlarm: (payload: AlarmEvent) => Promise<boolean>;
  onDeleteAlarm: (alarmId: string) => Promise<void>;
};

const AlarmsPanel: React.FC<AlarmsPanelProps> = ({
  alarms,
  clientUsers,
  selectedClient,
  setSelectedClient,
  onAlert,
  onAddAlarm,
  onUpdateAlarm,
  onDeleteAlarm,
}) => {
  const [showAddAlarm, setShowAddAlarm] = useState(false);
  const [showEditAlarm, setShowEditAlarm] = useState(false);
  const [editingAlarm, setEditingAlarm] = useState<AlarmEvent | null>(null);
  const [newAlarm, setNewAlarm] = useState<NewAlarmPayload>({
    instance: "",
    device: "",
    description: "",
    alarmStartedAt: new Date().toISOString().slice(0, 16),
    alarmClearedAfter: "",
    severity: "medium",
    client_id: "",
  });

  const handleAddAlarm = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newAlarm.client_id || !newAlarm.device || !newAlarm.description) {
      onAlert({ message: "Please fill in all required fields", type: "error" });
      return;
    }
    const success = await onAddAlarm(newAlarm);
    if (success) {
      setShowAddAlarm(false);
    }
  };

  const handleEditAlarm = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingAlarm) {
      return;
    }
    const success = await onUpdateAlarm(editingAlarm);
    if (success) {
      setShowEditAlarm(false);
      setEditingAlarm(null);
    }
  };

  const handleDeleteAlarm = async (alarmId: string) => {
    if (!window.confirm("Are you sure you want to delete this alarm?")) {
      return;
    }
    await onDeleteAlarm(alarmId);
  };

  return (
    <div>
      <div style={{ marginBottom: "16px" }}>
        <label
          style={{
            display: "block",
            marginBottom: "8px",
            color: "var(--vrm-text-primary)",
          }}
        >
          Select Client
        </label>
        <select
          value={selectedClient}
          onChange={(event) => setSelectedClient(event.target.value)}
          style={{
            padding: "8px",
            backgroundColor: "var(--vrm-bg-tertiary)",
            border: "1px solid var(--vrm-border-color)",
            borderRadius: "4px",
            color: "var(--vrm-text-primary)",
          }}
        >
          {clientUsers.map((user) => (
            <option key={user.username} value={user.username}>
              {user.name} ({user.username})
            </option>
          ))}
        </select>
      </div>
      <div className="vrm-card">
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">Alarm Logs for {selectedClient}</h3>
          <div className="vrm-card-actions">
            <button
              className="vrm-btn vrm-btn-sm"
              onClick={() => {
                setNewAlarm({
                  instance: "",
                  device: "",
                  description: "",
                  alarmStartedAt: new Date().toISOString().slice(0, 16),
                  alarmClearedAfter: "",
                  severity: "medium",
                  client_id: selectedClient,
                });
                setShowAddAlarm(true);
              }}
            >
              Add Alarm
            </button>
          </div>
        </div>
        <div className="vrm-card-body" style={{ padding: 0 }}>
          <div style={{ overflowX: "auto" }}>
            <table className="vrm-table">
              <thead>
                <tr>
                  <th>Instance</th>
                  <th>Device</th>
                  <th>Description</th>
                  <th>Started</th>
                  <th>Cleared</th>
                  <th>Severity</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {alarms.length > 0
                  ? alarms.map((alarm) => (
                      <tr key={alarm.id}>
                        <td>
                          <code>{alarm.instance}</code>
                        </td>
                        <td>{alarm.device}</td>
                        <td>{alarm.description}</td>
                        <td>{alarm.alarmStartedAt}</td>
                        <td>{alarm.alarmClearedAfter || "Active"}</td>
                        <td>
                          <span
                            className={`vrm-status ${
                              alarm.severity === "high"
                                ? "vrm-status-offline"
                                : alarm.severity === "medium"
                                  ? "vrm-status-warning"
                                  : "vrm-status-online"
                            }`}
                          >
                            {alarm.severity}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button
                              className="vrm-btn vrm-btn-secondary vrm-btn-sm"
                              onClick={() => {
                                setEditingAlarm(alarm);
                                setShowEditAlarm(true);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="vrm-btn vrm-btn-secondary vrm-btn-sm"
                              onClick={() => handleDeleteAlarm(alarm.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {showAddAlarm && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(79, 72, 60, 0.34)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div className="vrm-card" style={{ width: "500px", maxWidth: "90%" }}>
            <div className="vrm-card-header">
              <h3 className="vrm-card-title">Add New Alarm</h3>
            </div>
            <div className="vrm-card-body">
              <form onSubmit={handleAddAlarm}>
                <div style={{ marginBottom: "16px" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "8px",
                      color: "var(--vrm-text-primary)",
                    }}
                  >
                    Instance *
                  </label>
                  <input
                    type="text"
                    value={newAlarm.instance}
                    onChange={(event) =>
                      setNewAlarm({ ...newAlarm, instance: event.target.value })
                    }
                    style={{
                      width: "100%",
                      padding: "8px",
                      backgroundColor: "var(--vrm-bg-tertiary)",
                      border: "1px solid var(--vrm-border-color)",
                      borderRadius: "4px",
                      color: "var(--vrm-text-primary)",
                    }}
                  />
                </div>
                <div style={{ marginBottom: "16px" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "8px",
                      color: "var(--vrm-text-primary)",
                    }}
                  >
                    Device *
                  </label>
                  <input
                    type="text"
                    value={newAlarm.device}
                    onChange={(event) =>
                      setNewAlarm({ ...newAlarm, device: event.target.value })
                    }
                    style={{
                      width: "100%",
                      padding: "8px",
                      backgroundColor: "var(--vrm-bg-tertiary)",
                      border: "1px solid var(--vrm-border-color)",
                      borderRadius: "4px",
                      color: "var(--vrm-text-primary)",
                    }}
                  />
                </div>
                <div style={{ marginBottom: "16px" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "8px",
                      color: "var(--vrm-text-primary)",
                    }}
                  >
                    Description *
                  </label>
                  <textarea
                    value={newAlarm.description}
                    onChange={(event) =>
                      setNewAlarm({
                        ...newAlarm,
                        description: event.target.value,
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "8px",
                      backgroundColor: "var(--vrm-bg-tertiary)",
                      border: "1px solid var(--vrm-border-color)",
                      borderRadius: "4px",
                      color: "var(--vrm-text-primary)",
                      minHeight: "80px",
                    }}
                  />
                </div>
                <div style={{ marginBottom: "16px" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "8px",
                      color: "var(--vrm-text-primary)",
                    }}
                  >
                    Severity *
                  </label>
                  <select
                    value={newAlarm.severity}
                    onChange={(event) =>
                      setNewAlarm({ ...newAlarm, severity: event.target.value })
                    }
                    style={{
                      width: "100%",
                      padding: "8px",
                      backgroundColor: "var(--vrm-bg-tertiary)",
                      border: "1px solid var(--vrm-border-color)",
                      borderRadius: "4px",
                      color: "var(--vrm-text-primary)",
                    }}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    type="button"
                    className="vrm-btn vrm-btn-secondary"
                    onClick={() => setShowAddAlarm(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="vrm-btn">
                    Create Alarm
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      {showEditAlarm && editingAlarm && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(79, 72, 60, 0.34)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div className="vrm-card" style={{ width: "500px", maxWidth: "90%" }}>
            <div className="vrm-card-header">
              <h3 className="vrm-card-title">Edit Alarm</h3>
            </div>
            <div className="vrm-card-body">
              <form onSubmit={handleEditAlarm}>
                <div style={{ marginBottom: "16px" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "8px",
                      color: "var(--vrm-text-primary)",
                    }}
                  >
                    Description
                  </label>
                  <textarea
                    value={editingAlarm.description}
                    onChange={(event) =>
                      setEditingAlarm({
                        ...editingAlarm,
                        description: event.target.value,
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "8px",
                      backgroundColor: "var(--vrm-bg-tertiary)",
                      border: "1px solid var(--vrm-border-color)",
                      borderRadius: "4px",
                      color: "var(--vrm-text-primary)",
                      minHeight: "80px",
                    }}
                  />
                </div>
                <div style={{ marginBottom: "16px" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "8px",
                      color: "var(--vrm-text-primary)",
                    }}
                  >
                    Cleared After (optional)
                  </label>
                  <input
                    type="text"
                    value={editingAlarm.alarmClearedAfter || ""}
                    onChange={(event) =>
                      setEditingAlarm({
                        ...editingAlarm,
                        alarmClearedAfter: event.target.value,
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "8px",
                      backgroundColor: "var(--vrm-bg-tertiary)",
                      border: "1px solid var(--vrm-border-color)",
                      borderRadius: "4px",
                      color: "var(--vrm-text-primary)",
                    }}
                    placeholder="e.g., 5m, 10s"
                  />
                </div>
                <div style={{ marginBottom: "16px" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "8px",
                      color: "var(--vrm-text-primary)",
                    }}
                  >
                    Severity
                  </label>
                  <select
                    value={editingAlarm.severity}
                    onChange={(event) =>
                      setEditingAlarm({
                        ...editingAlarm,
                        severity: event.target.value,
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "8px",
                      backgroundColor: "var(--vrm-bg-tertiary)",
                      border: "1px solid var(--vrm-border-color)",
                      borderRadius: "4px",
                      color: "var(--vrm-text-primary)",
                    }}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    type="button"
                    className="vrm-btn vrm-btn-secondary"
                    onClick={() => {
                      setShowEditAlarm(false);
                      setEditingAlarm(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="vrm-btn">
                    Update Alarm
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AlarmsPanel;
