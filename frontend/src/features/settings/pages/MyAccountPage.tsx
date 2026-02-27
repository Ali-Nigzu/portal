import React, { useEffect, useMemo, useState } from "react";

import EditableFieldRow from "../components/EditableFieldRow";
import {
  getMe,
  isNotImplementedError,
  updateMe,
  updatePassword,
} from "../api/settingsApi";
import type { SettingsUser } from "../types";
import "../SettingsPages.css";

const maskEmail = (email: string) => {
  const [localPart, domain] = email.split("@");
  if (!domain) {
    return "••••";
  }
  const visible = localPart.slice(0, 2);
  return `${visible}${"•".repeat(Math.max(localPart.length - 2, 2))}@${domain}`;
};

const maskPhone = (phone: string | null | undefined) => {
  if (!phone) {
    return "—";
  }
  const visible = phone.slice(-2);
  return `${"•".repeat(Math.max(phone.length - 2, 4))}${visible}`;
};

const MyAccountPage: React.FC = () => {
  const [user, setUser] = useState<SettingsUser | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const me = await getMe();
        setUser(me);
      } catch (error) {
        setLoadingError(error instanceof Error ? error.message : "Unable to load account");
      }
    };
    load();
  }, []);

  const rows = useMemo(() => {
    if (!user) {
      return [];
    }
    return [
      {
        key: "name",
        label: "Name",
        value: user.name,
        displayValue: user.name,
        onSave: async (value: string) => {
          const trimmed = value.trim();
          if (!trimmed) {
            throw new Error("Name is required");
          }
          try {
            await updateMe({ name: trimmed });
            setUser((prev) => (prev ? { ...prev, name: trimmed } : prev));
          } catch (error) {
            if (isNotImplementedError(error)) {
              throw new Error("Not implemented yet");
            }
            throw error;
          }
        },
      },
      {
        key: "email",
        label: "Email",
        value: user.email,
        displayValue: maskEmail(user.email),
        type: "email" as const,
        onSave: async (value: string) => {
          const trimmed = value.trim();
          if (!trimmed) {
            throw new Error("Email is required");
          }
          try {
            await updateMe({ email: trimmed });
            setUser((prev) => (prev ? { ...prev, email: trimmed } : prev));
          } catch (error) {
            if (isNotImplementedError(error)) {
              throw new Error("Not implemented yet");
            }
            throw error;
          }
        },
      },
      {
        key: "phone",
        label: "Phone",
        value: user.phone ?? "",
        displayValue: maskPhone(user.phone),
        type: "tel" as const,
        onSave: async (value: string) => {
          try {
            await updateMe({ phone: value.trim() });
            setUser((prev) => (prev ? { ...prev, phone: value.trim() } : prev));
          } catch (error) {
            if (isNotImplementedError(error)) {
              throw new Error("Not implemented yet");
            }
            throw error;
          }
        },
      },
      {
        key: "password",
        label: "Password",
        value: "",
        displayValue: "••••••••",
        type: "password" as const,
        onSave: async (value: string) => {
          if (!value) {
            throw new Error("Password is required");
          }
          try {
            await updatePassword(value);
          } catch (error) {
            if (isNotImplementedError(error)) {
              throw new Error("Not implemented yet");
            }
            throw error;
          }
        },
      },
    ];
  }, [user]);

  if (loadingError) {
    return <div className="settings-page">{loadingError}</div>;
  }

  if (!user) {
    return <div className="settings-page">Loading account…</div>;
  }

  return (
    <section className="settings-page">
      <div className="vrm-card">
        <div className="vrm-card-header">
          <h2 className="vrm-card-title">My Account</h2>
        </div>
        <div className="vrm-card-body">
          {rows.map((row) => (
            <EditableFieldRow
              key={row.key}
              label={row.label}
              displayValue={row.displayValue}
              value={row.value}
              onSave={row.onSave}
              type={row.type}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default MyAccountPage;
