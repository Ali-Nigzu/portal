import React from 'react';
import { GranularityOption } from '../types/analytics';
import { getGranularityOptions } from '../hooks/useChartData';

interface GranularityToggleProps {
  value: GranularityOption;
  activeGranularity: GranularityOption;
  recommendedGranularity: GranularityOption;
  onChange: (value: GranularityOption) => void;
}

const GranularityToggle: React.FC<GranularityToggleProps> = ({
  value,
  activeGranularity,
  recommendedGranularity,
  onChange
}) => {
  const options = getGranularityOptions();

  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
      {options.map(option => {
        const isSelected = value === option.value;
        const isActive = option.value === activeGranularity;
        const isRecommended = option.value === recommendedGranularity;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className="vrm-btn vrm-btn-secondary vrm-btn-sm"
            style={{
              backgroundColor: isSelected ? 'var(--vrm-accent-blue)' : 'var(--vrm-bg-secondary)',
              color: isSelected ? 'white' : 'var(--vrm-text-primary)',
              borderColor: isSelected ? 'var(--vrm-accent-blue)' : 'var(--vrm-border)',
              fontWeight: isSelected ? 600 : 500,
              position: 'relative',
              paddingInline: '12px'
            }}
          >
            <span>{option.label}</span>
            {option.value === 'auto' && (
              <span style={{
                display: 'block',
                fontSize: '10px',
                color: isSelected ? 'rgba(255,255,255,0.85)' : 'var(--vrm-text-secondary)'
              }}>
                Using {activeGranularity.charAt(0).toUpperCase() + activeGranularity.slice(1)}
              </span>
            )}
            {option.value !== 'auto' && (
              <span style={{
                display: 'block',
                fontSize: '10px',
                color: isActive
                  ? 'var(--vrm-accent-blue)'
                  : isRecommended
                  ? 'var(--vrm-text-secondary)'
                  : 'transparent'
              }}>
                {isActive ? 'Active' : isRecommended ? 'Suggested' : '·'}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default GranularityToggle;
