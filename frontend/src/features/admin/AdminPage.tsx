import React, { useEffect, useState } from "react";
import { Credentials } from "../../types/credentials";
import AdminLayout from "./components/AdminLayout";
import AdminTabs, { AdminTabKey } from "./components/AdminTabs";
import UsersPanel from "./components/UsersPanel";
import AlarmsPanel from "./components/AlarmsPanel";
import DevicesPanel from "./components/DevicesPanel";
import { useAdminUsers } from "./hooks/useAdminUsers";
import { useAdminAlarms } from "./hooks/useAdminAlarms";
import { useAdminDevices } from "./hooks/useAdminDevices";
import { useAdminDataSources } from "./hooks/useAdminDataSources";

interface AdminPageProps {
  credentials: Credentials;
}

type AlertState = {
  message: string;
  type: "success" | "error";
} | null;

const AdminPage: React.FC<AdminPageProps> = ({ credentials }) => {
  const [activeTab, setActiveTab] = useState<AdminTabKey>("users");
  const [selectedClient, setSelectedClient] = useState("");
  const [alert, setAlert] = useState<AlertState>(null);

  const usersState = useAdminUsers({
    credentials,
    selectedClient,
    setSelectedClient,
    onAlert: setAlert,
  });
  const dataSourcesState = useAdminDataSources({
    credentials,
    selectedClient,
    active: activeTab === "users",
    onAlert: setAlert,
  });
  const alarmsState = useAdminAlarms({
    credentials,
    selectedClient,
    active: activeTab === "alarms",
    onAlert: setAlert,
  });
  const devicesState = useAdminDevices({
    credentials,
    selectedClient,
    active: activeTab === "devices",
    onAlert: setAlert,
  });

  useEffect(() => {
    if (alert) {
      const timer = setTimeout(() => setAlert(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [alert]);

  if (usersState.loading) {
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
          <p style={{ color: "var(--vrm-text-secondary)" }}>
            Loading admin data...
          </p>
        </div>
      </div>
    );
  }

  return (
    <AdminLayout alert={alert}>
      <AdminTabs activeTab={activeTab} onChange={setActiveTab} />
      {activeTab === "users" && (
        <UsersPanel
          users={usersState.users}
          dataSources={dataSourcesState.dataSources}
          selectedClient={selectedClient}
          setSelectedClient={setSelectedClient}
          onAlert={setAlert}
          onAddUser={usersState.addUser}
          onUpdateUser={usersState.updateUser}
          onDeleteUser={usersState.deleteUser}
          onViewDashboard={usersState.openDashboard}
          onAddDataSource={dataSourcesState.addDataSource}
          onUpdateDataSource={dataSourcesState.updateDataSource}
          onDeleteDataSource={dataSourcesState.deleteDataSource}
          onActivateDataSource={dataSourcesState.activateDataSource}
        />
      )}
      {activeTab === "alarms" && (
        <AlarmsPanel
          alarms={alarmsState.alarms}
          clientUsers={usersState.clientUsers}
          selectedClient={selectedClient}
          setSelectedClient={setSelectedClient}
          onAlert={setAlert}
          onAddAlarm={alarmsState.addAlarm}
          onUpdateAlarm={alarmsState.updateAlarm}
          onDeleteAlarm={alarmsState.deleteAlarm}
        />
      )}
      {activeTab === "devices" && (
        <DevicesPanel
          devices={devicesState.devices}
          clientUsers={usersState.clientUsers}
          selectedClient={selectedClient}
          setSelectedClient={setSelectedClient}
          onAlert={setAlert}
          onAddDevice={devicesState.addDevice}
          onUpdateDevice={devicesState.updateDevice}
          onDeleteDevice={devicesState.deleteDevice}
        />
      )}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </AdminLayout>
  );
};

export default AdminPage;
