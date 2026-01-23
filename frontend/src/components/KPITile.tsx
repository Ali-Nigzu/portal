import React from 'react';
interface KPITileProps {
  title: string;
  value: string;
  unit?: string;
  color?: string;
  caption?: string;
  badgeLabel?: string;
  badgeTone?: 'info' | 'warning' | 'critical';
  onClick?: () => void;
  className?: string;
}

const KPITile: React.FC<KPITileProps> = ({
  title,
  value,
  unit,
  color = 'var(--vrm-color-accent-occupancy)',
  caption,
  badgeLabel,
  badgeTone = 'info',
  onClick,
  className,
}) => {
  const badgeClass = `vrm-kpi-badge vrm-kpi-badge--${badgeTone}`;
  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      className={`vrm-kpi-tile vrm-kpi-tile--uniform vrm-kpi-tile--panel${
        onClick ? ' vrm-kpi-tile--clickable' : ''
      }${className ? ` ${className}` : ''}`}
      type={onClick ? 'button' : undefined}
      onClick={onClick}
    >
      <div className="vrm-kpi-header vrm-kpi-tile__header">
        <span className="vrm-kpi-title vrm-kpi-tile__label">{title}</span>
        <div className="vrm-kpi-tile__meta">
          {badgeLabel && <span className={badgeClass}>{badgeLabel}</span>}
        </div>
      </div>
      <div className="vrm-kpi-main">
        <span className="vrm-kpi-value vrm-kpi-tile__value" style={{ color }}>
          {value}
          {unit && <span className="vrm-kpi-unit">{unit}</span>}
        </span>
      </div>
      {caption && <span className="vrm-kpi-caption">{caption}</span>}
    </Wrapper>
  );
};

export default KPITile;
