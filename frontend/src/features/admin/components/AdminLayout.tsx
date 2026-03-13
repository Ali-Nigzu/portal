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
              ? "rgba(79, 116, 88, 0.12)"
              : "rgba(139, 58, 47, 0.12)",
          border: `1px solid ${
            alert.type === "success"
              ? "#44644b"
              : "#8b3a2f"
          }`,
          borderRadius: "6px",
          color:
            alert.type === "success"
              ? "#44644b"
              : "#8b3a2f",
        }}
      >
        {alert.message}
      </div>
    )}
    {children}
  </div>
);

export default AdminLayout;
