import { useCallback, useEffect, useMemo, useState } from "react";
import type { Credentials } from "../../../types/credentials";
import type { AdminRole, AdminUser } from "../types";
import {
  createAdminUser,
  createViewToken,
  deleteAdminUser,
  fetchAdminUsers,
  updateAdminUser,
} from "../transport/users";

type AlertPayload = {
  message: string;
  type: "success" | "error";
};

type NewUserPayload = {
  username: string;
  password: string;
  name: string;
  role: AdminRole;
  csv_url?: string;
};

type EditUserPayload = {
  password: string;
  name: string;
  role: AdminRole;
  csv_url?: string;
};

type UseAdminUsersParams = {
  credentials: Credentials;
  selectedClient: string;
  setSelectedClient: (value: string) => void;
  onAlert: (alert: AlertPayload | null) => void;
};

type UseAdminUsersResult = {
  users: AdminUser[];
  loading: boolean;
  clientUsers: AdminUser[];
  reloadUsers: () => void;
  addUser: (payload: NewUserPayload) => Promise<boolean>;
  updateUser: (username: string, payload: EditUserPayload) => Promise<boolean>;
  deleteUser: (username: string) => Promise<void>;
  openDashboard: (username: string) => Promise<void>;
};

export const useAdminUsers = ({
  credentials,
  selectedClient,
  setSelectedClient,
  onAlert,
}: UseAdminUsersParams): UseAdminUsersResult => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchAdminUsers(credentials);
      setUsers(data);
      const clientUsers = data.filter((user) => user.role === "client");
      if (clientUsers.length > 0 && !selectedClient) {
        setSelectedClient(clientUsers[0].username);
      }
    } catch (err) {
      onAlert({
        message: `Failed to load admin data: ${
          err instanceof Error ? err.message : "Unknown error"
        }`,
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [credentials, onAlert, selectedClient, setSelectedClient]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const reloadUsers = useCallback(() => {
    loadUsers();
  }, [loadUsers]);

  const clientUsers = useMemo(
    () => users.filter((user) => user.role === "client"),
    [users],
  );

  const addUser = useCallback(
    async (payload: NewUserPayload) => {
      try {
        const data = await createAdminUser(credentials, payload);
        if (data.success) {
          onAlert({ message: "User added successfully", type: "success" });
          reloadUsers();
          return true;
        }
        onAlert({
          message: data.error || "Failed to add user",
          type: "error",
        });
        return false;
      } catch (err) {
        onAlert({ message: "Failed to add user", type: "error" });
        return false;
      }
    },
    [credentials, onAlert, reloadUsers],
  );

  const updateUser = useCallback(
    async (username: string, payload: EditUserPayload) => {
      try {
        const data = await updateAdminUser(credentials, username, payload);
        if (data.success) {
          onAlert({ message: "User updated successfully", type: "success" });
          reloadUsers();
          return true;
        }
        onAlert({
          message: data.error || "Failed to update user",
          type: "error",
        });
        return false;
      } catch (err) {
        onAlert({ message: "Failed to update user", type: "error" });
        return false;
      }
    },
    [credentials, onAlert, reloadUsers],
  );

  const deleteUser = useCallback(
    async (username: string) => {
      try {
        const data = await deleteAdminUser(credentials, username);
        if (data.success) {
          onAlert({ message: "User deleted successfully", type: "success" });
          reloadUsers();
        } else {
          onAlert({
            message: data.error || "Failed to delete user",
            type: "error",
          });
        }
      } catch (err) {
        onAlert({ message: "Failed to delete user", type: "error" });
      }
    },
    [credentials, onAlert, reloadUsers],
  );

  const openDashboard = useCallback(
    async (username: string) => {
      try {
        const data = await createViewToken(credentials, username);
        if (data.token) {
          window.open(`/dashboard?view_token=${data.token}`, "_blank");
        } else {
          onAlert({ message: "Failed to create view token", type: "error" });
        }
      } catch (err) {
        onAlert({ message: "Failed to open dashboard", type: "error" });
      }
    },
    [credentials, onAlert],
  );

  return {
    users,
    loading,
    clientUsers,
    reloadUsers,
    addUser,
    updateUser,
    deleteUser,
    openDashboard,
  };
};
