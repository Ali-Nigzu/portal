import React, { useState } from "react";
import type { AdminUser, DeviceInfo, NewDevicePayload } from "../types";

type AlertPayload = {
  message: string;
  type: "success" | "error";
};

type DevicesPanelProps = {
  devices: DeviceInfo[];
  clientUsers: AdminUser[];
  selectedClient: string;
  setSelectedClient: (value: string) => void;
  onAlert: (alert: AlertPayload | null) => void;
  onAddDevice: (payload: NewDevicePayload) => Promise<boolean>;
  onUpdateDevice: (payload: DeviceInfo) => Promise<boolean>;
  onDeleteDevice: (deviceId: string) => Promise<void>;
};

const DevicesPanel: React.FC<DevicesPanelProps> = ({
  devices,
  clientUsers,
  selectedClient,
  setSelectedClient,
  onAlert,
  onAddDevice,
  onUpdateDevice,
  onDeleteDevice,
}) => {
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [showEditDevice, setShowEditDevice] = useState(false);
  const [editingDevice, setEditingDevice] = useState<DeviceInfo | null>(null);
  const [newDevice, setNewDevice] = useState<NewDevicePayload>({
    name: "",
    type: "Camera",
    status: "online",
    lastSeen: new Date().toISOString().slice(0, 16),
    dataSource: "",
    location: "",
    recordCount: 0,
    client_id: "",
  });

  const handleAddDevice = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newDevice.client_id || !newDevice.name) {
      onAlert({ message: "Please fill in all required fields", type: "error" });
      return;
    }
    const success = await onAddDevice(newDevice);
    if (success) {
      setShowAddDevice(false);
    }
  };

  const handleEditDevice = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingDevice) {
      return;
    }
    const success = await onUpdateDevice(editingDevice);
    if (success) {
      setShowEditDevice(false);
      setEditingDevice(null);
    }
  };

  const handleDeleteDevice = async (deviceId: string) => {
    if (!window.confirm("Are you sure you want to delete this device?")) {
      return;
    }
    await onDeleteDevice(deviceId);
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
          <h3 className="vrm-card-title">Device List for {selectedClient}</h3>
          <div className="vrm-card-actions">
            <button
              className="vrm-btn vrm-btn-sm"
              onClick={() => {
                setNewDevice({
                  name: "",
                  type: "Camera",
                  status: "online",
                  lastSeen: new Date().toISOString().slice(0, 16),
                  dataSource: "",
                  location: "",
                  recordCount: 0,
                  client_id: selectedClient,
                });
                setShowAddDevice(true);
              }}
            >
              Add Device
            </button>
          </div>
        </div>
        <div className="vrm-card-body" style={{ padding: 0 }}>
          <div style={{ overflowX: "auto" }}>
            <table className="vrm-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Location</th>
                  <th>Last Seen</th>
                  <th>Records</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {devices.length > 0
                  ? devices.map((device) => (
                      <tr key={device.id}>
                        <td>{device.name}</td>
                        <td>{device.type}</td>
                        <td>
                          <span
                            className={`vrm-status ${
                              device.status === "online"
                                ? "vrm-status-online"
                                : device.status === "offline"
                                  ? "vrm-status-offline"
                                  : "vrm-status-warning"
                            }`}
                          >
                            {device.status}
                          </span>
                        </td>
                        <td>{device.location || "-"}</td>
                        <td>{device.lastSeen}</td>
                        <td>{device.recordCount?.toLocaleString() || 0}</td>
                        <td>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button
                              className="vrm-btn vrm-btn-secondary vrm-btn-sm"
                              onClick={() => {
                                setEditingDevice(device);
                                setShowEditDevice(true);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="vrm-btn vrm-btn-secondary vrm-btn-sm"
                              onClick={() => handleDeleteDevice(device.id)}
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
      {showAddDevice && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div className="vrm-card" style={{ width: "500px", maxWidth: "90%" }}>
            <div className="vrm-card-header">
              <h3 className="vrm-card-title">Add New Device</h3>
            </div>
            <div className="vrm-card-body">
              <form onSubmit={handleAddDevice}>
                <div style={{ marginBottom: "16px" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "8px",
                      color: "var(--vrm-text-primary)",
                    }}
                  >
                    Device Name *
                  </label>
                  <input
                    type="text"
                    value={newDevice.name}
                    onChange={(event) =>
                      setNewDevice({ ...newDevice, name: event.target.value })
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
                    Type *
                  </label>
                  <select
                    value={newDevice.type}
                    onChange={(event) =>
                      setNewDevice({ ...newDevice, type: event.target.value })
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
                    <option value="Camera">Camera</option>
                    <option value="Sensor">Sensor</option>
                    <option value="Gateway">Gateway</option>
                  </select>
                </div>
                <div style={{ marginBottom: "16px" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "8px",
                      color: "var(--vrm-text-primary)",
                    }}
                  >
                    Status *
                  </label>
                  <select
                    value={newDevice.status}
                    onChange={(event) =>
                      setNewDevice({ ...newDevice, status: event.target.value })
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
                    <option value="online">Online</option>
                    <option value="offline">Offline</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>
                <div style={{ marginBottom: "16px" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "8px",
                      color: "var(--vrm-text-primary)",
                    }}
                  >
                    Location
                  </label>
                  <input
                    type="text"
                    value={newDevice.location}
                    onChange={(event) =>
                      setNewDevice({
                        ...newDevice,
                        location: event.target.value,
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
                  />
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
                    onClick={() => setShowAddDevice(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="vrm-btn">
                    Create Device
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      {showEditDevice && editingDevice && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div className="vrm-card" style={{ width: "500px", maxWidth: "90%" }}>
            <div className="vrm-card-header">
              <h3 className="vrm-card-title">Edit Device</h3>
            </div>
            <div className="vrm-card-body">
              <form onSubmit={handleEditDevice}>
                <div style={{ marginBottom: "16px" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "8px",
                      color: "var(--vrm-text-primary)",
                    }}
                  >
                    Device Name
                  </label>
                  <input
                    type="text"
                    value={editingDevice.name}
                    onChange={(event) =>
                      setEditingDevice({
                        ...editingDevice,
                        name: event.target.value,
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
                    Status
                  </label>
                  <select
                    value={editingDevice.status}
                    onChange={(event) =>
                      setEditingDevice({
                        ...editingDevice,
                        status: event.target.value,
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
                    <option value="online">Online</option>
                    <option value="offline">Offline</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>
                <div style={{ marginBottom: "16px" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "8px",
                      color: "var(--vrm-text-primary)",
                    }}
                  >
                    Location
                  </label>
                  <input
                    type="text"
                    value={editingDevice.location || ""}
                    onChange={(event) =>
                      setEditingDevice({
                        ...editingDevice,
                        location: event.target.value,
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
                  />
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
                      setShowEditDevice(false);
                      setEditingDevice(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="vrm-btn">
                    Update Device
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

export default DevicesPanel;
