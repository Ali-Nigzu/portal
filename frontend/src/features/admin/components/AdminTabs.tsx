import React from "react";

export type AdminTabKey = "users" | "alarms" | "devices";

type AdminTabsProps = {
  activeTab: AdminTabKey;
  onChange: (tab: AdminTabKey) => void;
};

const AdminTabs: React.FC<AdminTabsProps> = ({ activeTab, onChange }) => (
  <div
    style={{
      marginBottom: "24px",
      display: "flex",
      gap: "8px",
      borderBottom: "1px solid var(--vrm-border-color)",
    }}
  >
    <button
      onClick={() => onChange("users")}
      style={{
        padding: "12px 24px",
        background:
          activeTab === "users" ? "var(--vrm-bg-tertiary)" : "transparent",
        border: "none",
        borderBottom:
          activeTab === "users"
            ? "2px solid var(--vrm-accent-blue)"
            : "2px solid transparent",
        color:
          activeTab === "users"
            ? "var(--vrm-accent-blue)"
            : "var(--vrm-text-secondary)",
        cursor: "pointer",
        fontSize: "14px",
        fontWeight: "600",
      }}
    >
      User Management
    </button>
    <button
      onClick={() => onChange("alarms")}
      style={{
        padding: "12px 24px",
        background:
          activeTab === "alarms" ? "var(--vrm-bg-tertiary)" : "transparent",
        border: "none",
        borderBottom:
          activeTab === "alarms"
            ? "2px solid var(--vrm-accent-blue)"
            : "2px solid transparent",
        color:
          activeTab === "alarms"
            ? "var(--vrm-accent-blue)"
            : "var(--vrm-text-secondary)",
        cursor: "pointer",
        fontSize: "14px",
        fontWeight: "600",
      }}
    >
      Alarm Logs
    </button>
    <button
      onClick={() => onChange("devices")}
      style={{
        padding: "12px 24px",
        background:
          activeTab === "devices" ? "var(--vrm-bg-tertiary)" : "transparent",
        border: "none",
        borderBottom:
          activeTab === "devices"
            ? "2px solid var(--vrm-accent-blue)"
            : "2px solid transparent",
        color:
          activeTab === "devices"
            ? "var(--vrm-accent-blue)"
            : "var(--vrm-text-secondary)",
        cursor: "pointer",
        fontSize: "14px",
        fontWeight: "600",
      }}
    >
      Device List
    </button>
  </div>
);

export default AdminTabs;
