import React, { useState } from "react";
import type { AdminUser, DataSource } from "../types";

type AlertPayload = {
  message: string;
  type: "success" | "error";
};

type DataSourcesPanelProps = {
  users: AdminUser[];
  dataSources: DataSource[];
  selectedClient: string;
  setSelectedClient: (value: string) => void;
  onAlert: (alert: AlertPayload | null) => void;
  onAddDataSource: (
    payload: Pick<DataSource, "title" | "url" | "type">,
  ) => Promise<boolean>;
  onUpdateDataSource: (payload: DataSource) => Promise<boolean>;
  onDeleteDataSource: (sourceId: string) => Promise<void>;
  onActivateDataSource: (sourceId: string) => Promise<void>;
};

const DataSourcesPanel: React.FC<DataSourcesPanelProps> = ({
  users,
  dataSources,
  selectedClient,
  setSelectedClient,
  onAlert,
  onAddDataSource,
  onUpdateDataSource,
  onDeleteDataSource,
  onActivateDataSource,
}) => {
  const [showAddDataSource, setShowAddDataSource] = useState(false);
  const [showEditDataSource, setShowEditDataSource] = useState(false);
  const [editingDataSource, setEditingDataSource] = useState<DataSource | null>(
    null,
  );
  const [newDataSource, setNewDataSource] = useState({
    title: "",
    url: "",
    type: "Camera" as "Camera" | "Sensor" | "Gateway",
  });

  const handleAddDataSource = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedClient || !newDataSource.title || !newDataSource.url) {
      onAlert({ message: "Please fill in all required fields", type: "error" });
      return;
    }
    const success = await onAddDataSource(newDataSource);
    if (success) {
      setNewDataSource({ title: "", url: "", type: "Camera" });
      setShowAddDataSource(false);
    }
  };

  const handleEditDataSource = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingDataSource) {
      return;
    }
    const success = await onUpdateDataSource(editingDataSource);
    if (success) {
      setShowEditDataSource(false);
      setEditingDataSource(null);
    }
  };

  const handleDeleteDataSource = async (sourceId: string) => {
    if (!window.confirm("Are you sure you want to delete this data source?")) {
      return;
    }
    await onDeleteDataSource(sourceId);
  };

  const handleSetActiveDataSource = async (sourceId: string) => {
    await onActivateDataSource(sourceId);
  };

  const clientUsers = users.filter((user) => user.role === "client");

  return (
    <>
      <div className="vrm-card" style={{ marginBottom: "24px" }}>
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">Data Sources Management</h3>
        </div>
        <div className="vrm-card-body">
          <div
            style={{
              marginBottom: "20px",
              display: "flex",
              gap: "16px",
              alignItems: "center",
            }}
          >
            <label
              style={{
                color: "var(--vrm-text-primary)",
                fontWeight: "bold",
              }}
            >
              Select Client:
            </label>
            <select
              value={selectedClient}
              onChange={(event) => setSelectedClient(event.target.value)}
              style={{
                flex: 1,
                maxWidth: "300px",
                padding: "8px 12px",
                backgroundColor: "var(--vrm-bg-tertiary)",
                border: "1px solid var(--vrm-border-color)",
                borderRadius: "4px",
                color: "var(--vrm-text-primary)",
                fontSize: "14px",
              }}
            >
              <option value="">-- Select a client --</option>
              {clientUsers.map((user) => (
                <option key={user.username} value={user.username}>
                  {user.name} ({user.username})
                </option>
              ))}
            </select>
            {selectedClient && (
              <button
                className="vrm-btn vrm-btn-sm"
                onClick={() => setShowAddDataSource(true)}
              >
                Add Data Source
              </button>
            )}
          </div>
          {selectedClient && (
            <>
              <div style={{ padding: "0 20px 20px 20px" }}>
                <div style={{ overflowX: "auto" }}>
                  <table className="vrm-table">
                    <thead>
                      <tr>
                        <th>Source ID</th>
                        <th>Title</th>
                        <th>URL</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dataSources.length > 0
                        ? dataSources.map((source) => (
                            <tr key={source.id}>
                              <td>
                                <code>{source.id}</code>
                              </td>
                              <td>{source.title}</td>
                              <td
                                style={{
                                  maxWidth: "200px",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {source.url}
                              </td>
                              <td>{source.type}</td>
                              <td>
                                {source.active ? (
                                  <span className="vrm-status vrm-status-online">
                                    Active
                                  </span>
                                ) : (
                                  <span className="vrm-status vrm-status-offline">
                                    Inactive
                                  </span>
                                )}
                              </td>
                              <td>
                                <div
                                  style={{
                                    display: "flex",
                                    gap: "8px",
                                    flexWrap: "wrap",
                                  }}
                                >
                                  {!source.active && (
                                    <button
                                      className="vrm-btn vrm-btn-sm"
                                      onClick={() =>
                                        handleSetActiveDataSource(source.id)
                                      }
                                    >
                                      Set as Active
                                    </button>
                                  )}
                                  <button
                                    className="vrm-btn vrm-btn-secondary vrm-btn-sm"
                                    onClick={() => {
                                      setEditingDataSource(source);
                                      setShowEditDataSource(true);
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    className="vrm-btn vrm-btn-secondary vrm-btn-sm"
                                    onClick={() =>
                                      handleDeleteDataSource(source.id)
                                    }
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
            </>
          )}
        </div>
      </div>
      {showAddDataSource && (
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
              <h3 className="vrm-card-title">Add New Data Source</h3>
            </div>
            <div className="vrm-card-body">
              <form onSubmit={handleAddDataSource}>
                <div style={{ marginBottom: "16px" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "8px",
                      color: "var(--vrm-text-primary)",
                    }}
                  >
                    Title *
                  </label>
                  <input
                    type="text"
                    value={newDataSource.title}
                    onChange={(event) =>
                      setNewDataSource({
                        ...newDataSource,
                        title: event.target.value,
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
                    URL *
                  </label>
                  <input
                    type="text"
                    value={newDataSource.url}
                    onChange={(event) =>
                      setNewDataSource({
                        ...newDataSource,
                        url: event.target.value,
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
                    Type *
                  </label>
                  <select
                    value={newDataSource.type}
                    onChange={(event) =>
                      setNewDataSource({
                        ...newDataSource,
                        type: event.target.value as
                          | "Camera"
                          | "Sensor"
                          | "Gateway",
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
                    <option value="Camera">Camera</option>
                    <option value="Sensor">Sensor</option>
                    <option value="Gateway">Gateway</option>
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
                      setShowAddDataSource(false);
                      setNewDataSource({
                        title: "",
                        url: "",
                        type: "Camera",
                      });
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="vrm-btn">
                    Create Data Source
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      {showEditDataSource && editingDataSource && (
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
              <h3 className="vrm-card-title">Edit Data Source</h3>
            </div>
            <div className="vrm-card-body">
              <form onSubmit={handleEditDataSource}>
                <div style={{ marginBottom: "16px" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "8px",
                      color: "var(--vrm-text-primary)",
                    }}
                  >
                    Title *
                  </label>
                  <input
                    type="text"
                    value={editingDataSource.title}
                    onChange={(event) =>
                      setEditingDataSource({
                        ...editingDataSource,
                        title: event.target.value,
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
                    URL *
                  </label>
                  <input
                    type="text"
                    value={editingDataSource.url}
                    onChange={(event) =>
                      setEditingDataSource({
                        ...editingDataSource,
                        url: event.target.value,
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
                    Type *
                  </label>
                  <select
                    value={editingDataSource.type}
                    onChange={(event) =>
                      setEditingDataSource({
                        ...editingDataSource,
                        type: event.target.value as
                          | "Camera"
                          | "Sensor"
                          | "Gateway",
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
                    <option value="Camera">Camera</option>
                    <option value="Sensor">Sensor</option>
                    <option value="Gateway">Gateway</option>
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
                      setShowEditDataSource(false);
                      setEditingDataSource(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="vrm-btn">
                    Update Data Source
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default DataSourcesPanel;
