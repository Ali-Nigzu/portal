import React from "react";

type EditableFieldRowProps = {
  label: string;
  displayValue: string;
  value: string;
  type?: "text" | "email" | "tel" | "password";
  isEditing: boolean;
  isSaving: boolean;
  error?: string | null;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onChange: (value: string) => void;
};

const EditableFieldRow: React.FC<EditableFieldRowProps> = ({
  label,
  displayValue,
  value,
  type = "text",
  isEditing,
  isSaving,
  error,
  onEdit,
  onCancel,
  onSave,
  onChange,
}) => {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (!isSaving) {
        onSave();
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      if (!isSaving) {
        onCancel();
      }
    }
  };

  return (
    <div className={`settings-field-row ${isEditing ? "settings-field-row--editing" : ""}`}>
      <div className="settings-field-label">{label}</div>
      <div className="settings-field-main">
        {!isEditing ? (
          <div className="settings-field-value">{displayValue || "—"}</div>
        ) : (
          <input
            className="settings-input"
            value={value}
            type={type}
            onChange={(event) => onChange(event.target.value)}
            disabled={isSaving}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        )}
        {error ? <div className="settings-inline-error">{error}</div> : null}
      </div>
      <div className="settings-field-actions">
        {!isEditing ? (
          <button className="vrm-btn vrm-btn-secondary vrm-btn-sm" onClick={onEdit}>
            Edit
          </button>
        ) : (
          <>
            <button className="vrm-btn vrm-btn-secondary vrm-btn-sm" onClick={onCancel} disabled={isSaving}>
              Cancel
            </button>
            <button className="vrm-btn vrm-btn-sm" onClick={onSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save"}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default EditableFieldRow;
