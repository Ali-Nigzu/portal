import type { PresetMeasureOption } from '../presets/types';

interface MeasureControlsProps {
  options: PresetMeasureOption[];
  selectedId?: string;
  onSelect: (optionId: string) => void;
}

export const MeasureControls = ({ options, selectedId, onSelect }: MeasureControlsProps) => {
  if (!options || options.length === 0) {
    return null;
  }

  return (
    <div className="analyticsV2ControlGroup">
      <h4>Metric</h4>
      <div className="analyticsV2ControlGroup__options">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`analyticsV2Chip ${selectedId === option.id ? 'analyticsV2Chip--active' : ''}`}
            onClick={() => onSelect(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
};
