import React from 'react';

type InsightTone = 'info' | 'warning' | 'success';

export interface InsightItem {
  id: string;
  title: string;
  description?: string;
  tone?: InsightTone;
}

const toneStyles: Record<InsightTone, { background: string; border: string; color: string }> = {
  info: {
    background: 'rgba(25, 118, 210, 0.12)',
    border: 'rgba(25, 118, 210, 0.4)',
    color: 'var(--vrm-text-primary)'
  },
  warning: {
    background: 'rgba(240, 173, 0, 0.12)',
    border: 'rgba(240, 173, 0, 0.4)',
    color: 'var(--vrm-accent-orange)'
  },
  success: {
    background: 'rgba(46, 125, 50, 0.12)',
    border: 'rgba(46, 125, 50, 0.35)',
    color: 'var(--vrm-accent-teal)'
  }
};

const InsightRail: React.FC<{ insights: InsightItem[] }> = ({ insights }) => {
  if (!insights.length) {
    return null;
  }

  return (
    <div
      className="vrm-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}
    >
      <div className="vrm-card-header" style={{ borderBottom: '1px solid var(--vrm-border)' }}>
        <h3 className="vrm-card-title">Operational Insights</h3>
        <p style={{ fontSize: '12px', color: 'var(--vrm-text-secondary)', margin: 0 }}>
          Generated from the latest intelligence payload
        </p>
      </div>
      <div className="vrm-card-body" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
        {insights.map(item => {
          const tone = item.tone ?? 'info';
          const palette = toneStyles[tone];
          return (
            <div
              key={item.id}
              style={{
                minWidth: '220px',
                flex: '1 1 240px',
                padding: '12px 16px',
                borderRadius: '8px',
                borderLeft: `4px solid ${palette.border}`,
                backgroundColor: palette.background,
                color: palette.color,
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.03)'
              }}
            >
              <strong style={{ display: 'block', marginBottom: '6px', fontSize: '13px' }}>
                {item.title}
              </strong>
              {item.description && (
                <span style={{ fontSize: '12px', lineHeight: 1.4 }}>{item.description}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default InsightRail;
