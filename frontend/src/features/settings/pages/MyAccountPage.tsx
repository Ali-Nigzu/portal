import React, { useEffect, useMemo, useState } from "react";

import { getMe, isNotImplementedError, updateMe, updatePassword } from "../api/settingsApi";
import EditableFieldRow from "../components/EditableFieldRow";
import SettingsFrame from "../components/SettingsFrame";
import SettingsPageHeader from "../components/SettingsPageHeader";
import type { SettingsUser } from "../types";
import "../SettingsPages.css";

type EditableRowKey = "name" | "email" | "phone" | "password";

type RowDraftState = Record<EditableRowKey, string>;
type RowSavingState = Record<EditableRowKey, boolean>;
type RowErrorState = Record<EditableRowKey, string | null>;

const maskEmail = (email: string) => {
  const [localPart, domain] = email.split("@");
  if (!domain) {
    return "••••";
  }
  const localVisible = Math.min(2, localPart.length);
  return `${localPart.slice(0, localVisible)}${"•".repeat(Math.max(localPart.length - localVisible, 4))}@${domain}`;
};

const maskPhone = (phone: string | null | undefined) => {
  if (!phone) {
    return "—";
  }
  const visible = phone.slice(-2);
  return `${"•".repeat(Math.max(phone.length - 2, 4))}${visible}`;
};

const defaultSavingState: RowSavingState = {
  name: false,
  email: false,
  phone: false,
  password: false,
};

const defaultErrorState: RowErrorState = {
  name: null,
  email: null,
  phone: null,
  password: null,
};

const MyAccountPage: React.FC = () => {
  const [user, setUser] = useState<SettingsUser | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [activeEditingRowId, setActiveEditingRowId] = useState<EditableRowKey | null>(null);
  const [drafts, setDrafts] = useState<RowDraftState>({ name: "", email: "", phone: "", password: "" });
  const [saving, setSaving] = useState<RowSavingState>(defaultSavingState);
  const [errors, setErrors] = useState<RowErrorState>(defaultErrorState);

  useEffect(() => {
    const load = async () => {
      try {
        const me = await getMe();
        setUser(me);
        setDrafts({ name: me.name, email: me.email, phone: me.phone ?? "", password: "" });
      } catch (error) {
        setLoadingError(error instanceof Error ? error.message : "Unable to load account");
      }
    };

    load();
  }, []);

  const startEditing = (rowId: EditableRowKey) => {
    if (!user) {
      return;
    }
    setErrors((prev) => ({ ...prev, [rowId]: null }));
    setActiveEditingRowId(rowId);
    setDrafts((prev) => ({
      ...prev,
      name: user.name,
      email: user.email,
      phone: user.phone ?? "",
      password: rowId === "password" ? "" : prev.password,
    }));
  };

  const cancelEditing = (rowId: EditableRowKey) => {
    if (!user) {
      return;
    }
    setErrors((prev) => ({ ...prev, [rowId]: null }));
    setDrafts((prev) => ({
      ...prev,
      name: user.name,
      email: user.email,
      phone: user.phone ?? "",
      password: "",
    }));
    setActiveEditingRowId((prev) => (prev === rowId ? null : prev));
  };

  const handleSave = async (rowId: EditableRowKey) => {
    if (!user) {
      return;
    }

    const nextValue = drafts[rowId].trim();

    if (rowId !== "phone" && !nextValue) {
      setErrors((prev) => ({ ...prev, [rowId]: `${rowId[0].toUpperCase()}${rowId.slice(1)} is required` }));
      return;
    }

    setSaving((prev) => ({ ...prev, [rowId]: true }));
    setErrors((prev) => ({ ...prev, [rowId]: null }));

    try {
      if (rowId === "password") {
        await updatePassword(nextValue);
      } else if (rowId === "name") {
        await updateMe({ name: nextValue });
      } else if (rowId === "email") {
        await updateMe({ email: nextValue });
      } else {
        await updateMe({ phone: nextValue });
      }

      setUser((prev) => {
        if (!prev) {
          return prev;
        }
        if (rowId === "password") {
          return prev;
        }
        return {
          ...prev,
          [rowId]: rowId === "phone" ? nextValue : nextValue,
        };
      });
      setActiveEditingRowId(null);
      setDrafts((prev) => ({ ...prev, password: "" }));
    } catch (error) {
      if (isNotImplementedError(error)) {
        setErrors((prev) => ({ ...prev, [rowId]: "Not implemented yet" }));
      } else {
        setErrors((prev) => ({
          ...prev,
          [rowId]: error instanceof Error ? error.message : "Unable to save",
        }));
      }
    } finally {
      setSaving((prev) => ({ ...prev, [rowId]: false }));
    }
  };

  const rows = useMemo(() => {
    if (!user) {
      return [] as Array<{
        key: EditableRowKey;
        label: string;
        displayValue: string;
        type?: "text" | "email" | "tel" | "password";
      }>;
    }

    return [
      { key: "name", label: "Name", displayValue: user.name, type: "text" as const },
      { key: "email", label: "Email", displayValue: maskEmail(user.email), type: "email" as const },
      { key: "phone", label: "Phone", displayValue: maskPhone(user.phone), type: "tel" as const },
      { key: "password", label: "Password", displayValue: "••••••••", type: "password" as const },
    ];
  }, [user]);

  if (loadingError) {
    return (
      <SettingsFrame>
        <SettingsPageHeader title="My Account" />
        <div className="vrm-card">
          <div className="vrm-card-body">{loadingError}</div>
        </div>
      </SettingsFrame>
    );
  }

  if (!user) {
    return (
      <SettingsFrame>
        <SettingsPageHeader title="My Account" />
        <div className="vrm-card">
          <div className="vrm-card-body">Loading account…</div>
        </div>
      </SettingsFrame>
    );
  }

  return (
    <SettingsFrame>
      <SettingsPageHeader title="My Account" />
      <div className="vrm-card">
        <div className="vrm-card-body settings-account-card-body">
          {rows.map((row) => (
            <EditableFieldRow
              key={row.key}
              label={row.label}
              displayValue={row.displayValue}
              value={drafts[row.key]}
              type={row.type}
              isEditing={activeEditingRowId === row.key}
              isSaving={saving[row.key]}
              error={errors[row.key]}
              onEdit={() => startEditing(row.key)}
              onCancel={() => cancelEditing(row.key)}
              onSave={() => handleSave(row.key)}
              onChange={(value) => setDrafts((prev) => ({ ...prev, [row.key]: value }))}
            />
          ))}
        </div>
      </div>
    </SettingsFrame>
  );
};

export default MyAccountPage;
