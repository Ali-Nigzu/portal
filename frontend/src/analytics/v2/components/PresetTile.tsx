import type { PresetDefinition } from '../presets/types';
import { PresetIcon } from './PresetIcon';

interface PresetTileProps {
  preset: PresetDefinition;
  isActive: boolean;
  onSelect: (presetId: string) => void;
}

export const PresetTile = ({ preset, isActive, onSelect }: PresetTileProps) => {
  return (
    <button
      type="button"
      className={`analyticsV2Preset ${isActive ? 'analyticsV2Preset--active' : ''}`}
      onClick={() => onSelect(preset.id)}
      aria-pressed={isActive}
      aria-label={`${preset.title} preset`}
    >
      <PresetIcon name={preset.icon} />
      <div className="analyticsV2Preset__body">
        <h5>{preset.title}</h5>
        <p>{preset.description}</p>
      </div>
    </button>
  );
};
