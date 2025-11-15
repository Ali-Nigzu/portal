interface SplitToggleControlProps {
  label: string;
  enabled?: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
  disabledReason?: string;
}

export const SplitToggleControl = ({ label, enabled = true, onToggle, disabled = false, disabledReason }: SplitToggleControlProps) => {
  return (
    <div className="analyticsV2ControlGroup">
      <h4>Splits</h4>
      <div className="analyticsV2ControlGroup__options">
        <button
          type="button"
          className={`analyticsV2Chip ${enabled ? 'analyticsV2Chip--active' : ''} ${disabled ? 'analyticsV2Chip--disabled' : ''}`.trim()}
          onClick={() => {
            if (disabled) {
              return;
            }
            onToggle(!enabled);
          }}
          disabled={disabled}
          aria-disabled={disabled}
        >
          {enabled ? `${label} on` : `${label} off`}
        </button>
      </div>
      {disabled && disabledReason ? (
        <p className="analyticsV2ControlGroup__hint" role="note">
          {disabledReason}
        </p>
      ) : null}
    </div>
  );
};
