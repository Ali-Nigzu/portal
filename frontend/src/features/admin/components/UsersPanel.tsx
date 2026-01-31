import React, { useState } from "react";
import { formatLastLogin } from "../utils/formatLastLogin";
import type { AdminRole, AdminUser, DataSource } from "../types";
import DataSourcesPanel from "./DataSourcesPanel";

type AlertPayload = {
  message: string;
  type: "success" | "error";
};

type UsersPanelProps = {
  users: AdminUser[];
  dataSources: DataSource[];
  selectedClient: string;
  setSelectedClient: (value: string) => void;
  onAlert: (alert: AlertPayload | null) => void;
  onAddUser: (payload: {
    username: string;
    password: string;
    name: string;
    role: AdminRole;
    csv_url?: string;
  }) => Promise<boolean>;
  onUpdateUser: (
    username: string,
    payload: {
      password: string;
      name: string;
      role: AdminRole;
      csv_url?: string;
    },
  ) => Promise<boolean>;
  onDeleteUser: (username: string) => Promise<void>;
  onViewDashboard: (username: string) => Promise<void>;
  onAddDataSource: (
    payload: Pick<DataSource, "title" | "url" | "type">,
  ) => Promise<boolean>;
  onUpdateDataSource: (payload: DataSource) => Promise<boolean>;
  onDeleteDataSource: (sourceId: string) => Promise<void>;
  onActivateDataSource: (sourceId: string) => Promise<void>;
};

const UsersPanel: React.FC<UsersPanelProps> = ({
  users,
  dataSources,
  selectedClient,
  setSelectedClient,
  onAlert,
  onAddUser,
  onUpdateUser,
  onDeleteUser,
  onViewDashboard,
  onAddDataSource,
  onUpdateDataSource,
  onDeleteDataSource,
  onActivateDataSource,
}) => {
  const [showAddUser, setShowAddUser] = useState(false);
  const [showEditUser, setShowEditUser] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    name: "",
    role: "client" as AdminRole,
    csv_url: "",
  });
  const [editUser, setEditUser] = useState({
    password: "",
    name: "",
    role: "client" as AdminRole,
    csv_url: "",
  });

  const handleAddUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (
      !newUser.username.trim() ||
      !newUser.password.trim() ||
      !newUser.name.trim()
    ) {
      onAlert({ message: "Please fill in all required fields", type: "error" });
      return;
    }
    const success = await onAddUser(newUser);
    if (success) {
      setNewUser({
        username: "",
        password: "",
        name: "",
        role: "client",
        csv_url: "",
      });
      setShowAddUser(false);
    }
  };

  const handleEditUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingUser) {
      return;
    }
    const success = await onUpdateUser(editingUser, editUser);
    if (success) {
      setShowEditUser(false);
      setEditingUser(null);
    }
  };

  const handleDeleteUser = async (username: string) => {
    if (!window.confirm(`Are you sure you want to delete user "${username}"?`)) {
      return;
    }
    await onDeleteUser(username);
  };

  return (
    <div>
      <div className="vrm-card" style={{ marginBottom: "24px" }}>
        <div className="vrm-card-header">
          <h3 className="vrm-card-title">User Management</h3>
          <div className="vrm-card-actions">
            <button
              className="vrm-btn vrm-btn-sm"
              onClick={() => setShowAddUser(true)}
            >
              Add User
            </button>
          </div>
        </div>
        <div className="vrm-card-body" style={{ padding: 0 }}>
          <div style={{ overflowX: "auto" }}>
            <table className="vrm-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Last Login</th>
                  <th>CSV URL</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.username}>
                    <td>
                      <code>{user.username}</code>
                    </td>
                    <td>{user.name}</td>
                    <td>
                      <span
                        className={`vrm-status ${
                          user.role === "admin"
                            ? "vrm-status-warning"
                            : "vrm-status-online"
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td
                      style={{
                        fontSize: "14px",
                        color: user.last_login
                          ? "var(--vrm-text-primary)"
                          : "var(--vrm-text-muted)",
                      }}
                    >
                      {formatLastLogin(user.last_login)}
                    </td>
                    <td
                      style={{
                        maxWidth: "200px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {user.csv_url || "-"}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "8px" }}>
                        {user.role === "client" && (
                          <button
                            className="vrm-btn vrm-btn-primary vrm-btn-sm"
                            onClick={() => onViewDashboard(user.username)}
                          >
                            View Dashboard
                          </button>
                        )}
                        <button
                          className="vrm-btn vrm-btn-secondary vrm-btn-sm"
                          onClick={() => {
                            setEditingUser(user.username);
                            setEditUser({
                              password: "",
                              name: user.name,
                              role: user.role,
                              csv_url: user.csv_url || "",
                            });
                            setShowEditUser(true);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="vrm-btn vrm-btn-secondary vrm-btn-sm"
                          onClick={() => handleDeleteUser(user.username)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <DataSourcesPanel
        users={users}
        dataSources={dataSources}
        selectedClient={selectedClient}
        setSelectedClient={setSelectedClient}
        onAlert={onAlert}
        onAddDataSource={onAddDataSource}
        onUpdateDataSource={onUpdateDataSource}
        onDeleteDataSource={onDeleteDataSource}
        onActivateDataSource={onActivateDataSource}
      />
      {showAddUser && (
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
              <h3 className="vrm-card-title">Add New User</h3>
            </div>
            <div className="vrm-card-body">
              <form onSubmit={handleAddUser}>
                <div style={{ marginBottom: "16px" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "8px",
                      color: "var(--vrm-text-primary)",
                    }}
                  >
                    Username *
                  </label>
                  <input
                    type="text"
                    value={newUser.username}
                    onChange={(event) =>
                      setNewUser({ ...newUser, username: event.target.value })
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
                    Name *
                  </label>
                  <input
                    type="text"
                    value={newUser.name}
                    onChange={(event) =>
                      setNewUser({ ...newUser, name: event.target.value })
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
                    Password *
                  </label>
                  <input
                    type="password"
                    value={newUser.password}
                    onChange={(event) =>
                      setNewUser({ ...newUser, password: event.target.value })
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
                    Role *
                  </label>
                  <select
                    value={newUser.role}
                    onChange={(event) =>
                      setNewUser({
                        ...newUser,
                        role: event.target.value as AdminRole,
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
                    <option value="client">Client</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                {newUser.role === "client" && (
                  <div style={{ marginBottom: "16px" }}>
                    <label
                      style={{
                        display: "block",
                        marginBottom: "8px",
                        color: "var(--vrm-text-primary)",
                      }}
                    >
                      CSV URL
                    </label>
                    <input
                      type="text"
                      value={newUser.csv_url}
                      onChange={(event) =>
                        setNewUser({ ...newUser, csv_url: event.target.value })
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
                )}
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
                      setShowAddUser(false);
                      setNewUser({
                        username: "",
                        password: "",
                        name: "",
                        role: "client",
                        csv_url: "",
                      });
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="vrm-btn">
                    Create User
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      {showEditUser && editingUser && (
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
              <h3 className="vrm-card-title">Edit User: {editingUser}</h3>
            </div>
            <div className="vrm-card-body">
              <form onSubmit={handleEditUser}>
                <div style={{ marginBottom: "16px" }}>
                  <label
                    style={{
                      display: "block",
                      marginBottom: "8px",
                      color: "var(--vrm-text-primary)",
                    }}
                  >
                    Name
                  </label>
                  <input
                    type="text"
                    value={editUser.name}
                    onChange={(event) =>
                      setEditUser({ ...editUser, name: event.target.value })
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
                    New Password (leave blank to keep current)
                  </label>
                  <input
                    type="password"
                    value={editUser.password}
                    onChange={(event) =>
                      setEditUser({ ...editUser, password: event.target.value })
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
                      setShowEditUser(false);
                      setEditingUser(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="vrm-btn">
                    Update User
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

export default UsersPanel;
