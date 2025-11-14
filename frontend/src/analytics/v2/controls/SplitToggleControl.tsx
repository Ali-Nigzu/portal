interface SplitToggleControlProps {
  label: string;
  enabled?: boolean;
  onToggle: (enabled: boolean) => void;
}

export const SplitToggleControl = ({ label, enabled = true, onToggle }: SplitToggleControlProps) => {
  return (
    <div className="analyticsV2ControlGroup">
      <h4>Splits</h4>
      <div className="analyticsV2ControlGroup__options">
        <button
          type="button"
          className={`analyticsV2Chip ${enabled ? 'analyticsV2Chip--active' : ''}`}
          onClick={() => onToggle(!enabled)}
        >
          {enabled ? `${label} on` : `${label} off`}
        </button>
      </div>
    </div>
  );
};
