import React, { useId, useRef, useEffect } from "react";
import { PenLine } from "lucide-react";

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
  const inputId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(isEditing);
  useEffect(() => {
    if (wasEditing.current && !isEditing) button.current?.focus();
    wasEditing.current = isEditing;
  }, [isEditing]);
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
    <div className={`settings-field-row ${isEditing ? "settings-field-row--editing" : "settings-field-row--readonly"}`}>
      <label className="settings-field-label" htmlFor={isEditing ? inputId : undefined}>{label}</label>
      <div className="settings-field-main">
        {!isEditing ? (
          <div className="settings-field-value">{displayValue || "—"}</div>
        ) : (
          <input
            id={inputId}
            maxLength={120}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${inputId}-error` : undefined}
            className="settings-input"
            value={value}
            type={type}
            onChange={(event) => onChange(event.target.value)}
            disabled={isSaving}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        )}
        {error ? <div id={`${inputId}-error`} className="settings-inline-error">{error}</div> : null}
      </div>
      <div className="settings-field-actions">
        {!isEditing ? (
          <button ref={button} disabled={isSaving} className="settings-edit-icon-btn" onClick={onEdit} aria-label={`Edit ${label}`}>
            <PenLine size={14} aria-hidden="true" />
          </button>
        ) : (
          <>
            <button className="vrm-btn vrm-btn-secondary vrm-btn-sm" onClick={onCancel} disabled={isSaving}>
              Cancel
            </button>
            <button className="vrm-btn vrm-btn-primary vrm-btn-sm" onClick={onSave} disabled={isSaving || value === displayValue}>
              {isSaving ? "Saving..." : "Save"}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default EditableFieldRow;
