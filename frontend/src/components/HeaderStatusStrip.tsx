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
    <div className="vrm-status-strip" role="status" aria-live="polite">
      <div className="vrm-status-strip-section">
        <button
          type="button"
          className={`vrm-status-chip vrm-status-chip-action ${realtime ? 'active' : ''}`}
          onClick={toggleRealtime}
          aria-pressed={realtime}
        >
          <span className={`vrm-status-indicator ${realtime ? 'ok' : 'warning'}`} />
          {realtime ? 'Realtime on' : 'Realtime off'}
        </button>
        <span className="vrm-status-chip" title="Last updated timestamp">
          Last updated: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '—'}
        </span>
        <span className="vrm-status-chip" title="Local site time">
          Local time: {localTime}
        </span>
      </div>
      <div className="vrm-status-strip-section">
        <span className="vrm-status-chip" title={statusCopy[systemStatus]}>
          <span className={`vrm-status-indicator ${systemStatus}`} aria-hidden />
          {statusCopy[systemStatus]}
        </span>
        <span className="vrm-status-chip" title="Viewer access">
          Viewer rights: Full
        </span>
      </div>
    </div>
  );
};

export default HeaderStatusStrip;
