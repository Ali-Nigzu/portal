import React, { useState } from "react";

type EditableFieldRowProps = {
  label: string;
  displayValue: string;
  value: string;
  type?: "text" | "email" | "tel" | "password";
  onSave: (value: string) => Promise<void>;
};

const EditableFieldRow: React.FC<EditableFieldRowProps> = ({
  label,
  displayValue,
  value,
  type = "text",
  onSave,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleEdit = () => {
    setDraftValue(value);
    setError(null);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setDraftValue(value);
    setError(null);
    setIsEditing(false);
  };

  const handleSave = async () => {
    setError(null);
    setIsSaving(true);
    try {
      await onSave(draftValue);
      setIsEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="settings-field-row">
      <div className="settings-field-label">{label}</div>
      {!isEditing ? (
        <>
          <div className="settings-field-value">{displayValue || "—"}</div>
          <button className="vrm-btn vrm-btn-secondary vrm-btn-sm" onClick={handleEdit}>
            Edit
          </button>
        </>
      ) : (
        <>
          <div className="settings-field-edit">
            <input
              className="settings-input"
              value={draftValue}
              type={type}
              onChange={(event) => setDraftValue(event.target.value)}
              disabled={isSaving}
            />
            {error && <div className="settings-inline-error">{error}</div>}
          </div>
          <div className="settings-field-actions">
            <button className="vrm-btn vrm-btn-secondary vrm-btn-sm" onClick={handleCancel} disabled={isSaving}>
              Cancel
            </button>
            <button className="vrm-btn vrm-btn-sm" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default EditableFieldRow;
