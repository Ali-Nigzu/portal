import type { PresetTimeRangeOption } from '../presets/types';

interface TimeControlsProps {
  options: PresetTimeRangeOption[];
  selectedId?: string;
  onSelect: (optionId: string) => void;
  disabled?: boolean;
  disabledReason?: string;
}

export const TimeControls = ({ options, selectedId, onSelect, disabled = false, disabledReason }: TimeControlsProps) => {
  if (!options || options.length === 0) {
    return null;
  }

  return (
    <div className="analyticsV2ControlGroup">
      <h4>Time range</h4>
      <div className="analyticsV2ControlGroup__options">
        {options.map((option) => {
          const classes = ['analyticsV2Chip'];
          if (selectedId === option.id) {
            classes.push('analyticsV2Chip--active');
          }
          if (disabled) {
            classes.push('analyticsV2Chip--disabled');
          }
          return (
            <button
              key={option.id}
              type="button"
              className={classes.join(' ')}
              onClick={() => {
                if (disabled) {
                  return;
                }
                onSelect(option.id);
              }}
              disabled={disabled}
              aria-disabled={disabled}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {disabled && disabledReason ? (
        <p className="analyticsV2ControlGroup__hint" role="note">
          {disabledReason}
        </p>
      ) : null}
    </div>
  );
};
