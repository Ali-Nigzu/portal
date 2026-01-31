import React from "react";

type AlertMessage = {
  message: string;
  type: "success" | "error";
};

type AdminLayoutProps = {
  alert: AlertMessage | null;
  children: React.ReactNode;
};

const AdminLayout: React.FC<AdminLayoutProps> = ({ alert, children }) => (
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
        Admin Panel
      </h1>
    </div>
    {alert && (
      <div
        style={{
          marginBottom: "24px",
          padding: "12px 16px",
          backgroundColor:
            alert.type === "success"
              ? "rgba(76, 175, 80, 0.1)"
              : "rgba(244, 67, 54, 0.1)",
          border: `1px solid ${
            alert.type === "success"
              ? "var(--vrm-accent-green)"
              : "var(--vrm-accent-red)"
          }`,
          borderRadius: "6px",
          color:
            alert.type === "success"
              ? "var(--vrm-accent-green)"
              : "var(--vrm-accent-red)",
        }}
      >
        {alert.message}
      </div>
    )}
    {children}
  </div>
);

export default AdminLayout;
