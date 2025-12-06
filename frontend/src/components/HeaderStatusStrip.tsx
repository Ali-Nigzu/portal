import React from 'react';
import { useGlobalControls, SystemStatus } from '../context/GlobalControlsContext';

const statusCopy: Record<SystemStatus, string> = {
  ok: 'System status: OK',
  warning: 'System status: Warning',
  critical: 'System status: Attention required',
};

const HeaderStatusStrip: React.FC = () => {
  const { lastUpdated, systemStatus, localTime, realtime, setRealtime } = useGlobalControls();

  const toggleRealtime = () => setRealtime(!realtime);

  return (
    <div className="vrm-header-meta" role="status" aria-live="polite">
      <div className="vrm-header-meta-group">
        <span className="vrm-header-chip" title="Last updated timestamp">
          Last updated: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '—'}
        </span>
        <button
          type="button"
          className={`vrm-header-chip vrm-header-chip-action ${realtime ? 'active' : ''}`}
          onClick={toggleRealtime}
          aria-pressed={realtime}
        >
          <span className={`vrm-status-indicator ${realtime ? 'ok' : 'warning'}`} />
          {realtime ? 'Realtime on' : 'Realtime off'}
        </button>
      </div>

      <span className="vrm-header-meta-divider" aria-hidden="true" />

      <div className="vrm-header-meta-group">
        <span className="vrm-header-chip" title={statusCopy[systemStatus]}>
          <span className={`vrm-status-indicator ${systemStatus}`} aria-hidden />
          {statusCopy[systemStatus]}
        </span>
      </div>

      <span className="vrm-header-meta-divider" aria-hidden="true" />

      <div className="vrm-header-meta-group">
        <span className="vrm-header-chip" title="Local site time">
          Local time: {localTime}
        </span>
        <span className="vrm-header-chip" title="Viewer access">
          Viewer rights: Full
        </span>
      </div>
    </div>
  );
};

export default HeaderStatusStrip;
