import React from 'react';

type InsightTone = 'info' | 'warning' | 'success' | 'danger';

export interface InsightAction {
  label: string;
  onClick?: () => void;
  href?: string;
}

export interface InsightItem {
  id: string;
  title: string;
  description?: string;
  tone?: InsightTone;
  action?: InsightAction;
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
  },
  danger: {
    background: 'rgba(229, 57, 53, 0.12)',
    border: 'rgba(229, 57, 53, 0.4)',
    color: 'var(--vrm-color-accent-exits)'
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
              className="vrm-insight-card"
              style={{
                backgroundColor: palette.background,
                borderLeft: `4px solid ${palette.border}`,
                color: palette.color,
              }}
            >
              <div className="vrm-insight-content">
                <strong className="vrm-insight-title">{item.title}</strong>
                {item.description && <span className="vrm-insight-description">{item.description}</span>}
              </div>
              {item.action && (
                <div className="vrm-insight-action">
                  {item.action.href ? (
                    <a className="vrm-btn vrm-btn-text" href={item.action.href}>
                      {item.action.label}
                    </a>
                  ) : (
                    <button type="button" className="vrm-btn vrm-btn-text" onClick={item.action.onClick}>
                      {item.action.label}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default InsightRail;
