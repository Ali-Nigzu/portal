import type { PresetCatalogueGroup, PresetDefinition } from '../presets/types';
import { PresetTile } from '../components/PresetTile';

interface LeftRailProps {
  groups: PresetCatalogueGroup[];
  presets: Record<string, PresetDefinition>;
  activePresetId: string | null;
  onSelectPreset: (presetId: string) => void;
}

export const LeftRail = ({ groups, presets, activePresetId, onSelectPreset }: LeftRailProps) => {
  return (
    <div className="analyticsV2Rail" role="navigation" aria-label="Preset catalogue">
      <div className="analyticsV2Rail__header">
        <div>
          <h3 style={{ margin: 0 }}>Presets</h3>
          <p style={{ margin: 0, color: '#8d96aa', fontSize: '0.85rem' }}>Select a curated insight</p>
        </div>
      </div>
      {groups.map((group) => (
        <div key={group.id} className="analyticsV2Rail__section">
          <h4>{group.title}</h4>
          {group.presetIds.map((presetId) => {
            const preset = presets[presetId];
            if (!preset) {
              return null;
            }
            return (
              <PresetTile
                key={preset.id}
                preset={preset}
                isActive={preset.id === activePresetId}
                onSelect={onSelectPreset}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
};
