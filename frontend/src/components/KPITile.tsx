import React from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';

interface KPITileProps {
  title: string;
  value: string;
  unit?: string;
  deltaLabel?: string;
  trend?: 'up' | 'down' | 'neutral';
  sparklineData?: number[];
  color?: string;
  caption?: string;
  badgeLabel?: string;
  badgeTone?: 'info' | 'warning' | 'critical';
  onClick?: () => void;
}

const KPITile: React.FC<KPITileProps> = ({
  title,
  value,
  unit,
  deltaLabel,
  trend = 'neutral',
  sparklineData = [],
  color = 'var(--vrm-color-accent-occupancy)',
  caption,
  badgeLabel,
  badgeTone = 'info',
  onClick,
}) => {
  const trendClass = trend === 'up' ? 'vrm-kpi-delta--up' : trend === 'down' ? 'vrm-kpi-delta--down' : 'vrm-kpi-delta--neutral';
  const badgeClass = `vrm-kpi-badge vrm-kpi-badge--${badgeTone}`;
  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      className={`vrm-kpi-tile${onClick ? ' vrm-kpi-tile--clickable' : ''}`}
      type={onClick ? 'button' : undefined}
      onClick={onClick}
    >
      <div className="vrm-kpi-header">
        <span className="vrm-kpi-title">{title}</span>
        {deltaLabel && <span className={`vrm-kpi-delta ${trendClass}`}>{deltaLabel}</span>}
        {badgeLabel && <span className={badgeClass}>{badgeLabel}</span>}
      </div>
      <div className="vrm-kpi-main">
        <span className="vrm-kpi-value">
          {value}
          {unit && <span className="vrm-kpi-unit">{unit}</span>}
        </span>
        {sparklineData.length > 1 && (
          <div className="vrm-kpi-sparkline">
            <ResponsiveContainer width="100%" height={40}>
              <AreaChart data={sparklineData.map((datum, index) => ({ index, value: datum }))}>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={color}
                  fill={color}
                  fillOpacity={0.15}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      {caption && <span className="vrm-kpi-caption">{caption}</span>}
    </Wrapper>
  );
};

export default KPITile;
