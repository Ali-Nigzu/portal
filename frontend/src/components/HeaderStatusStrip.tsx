import React from "react";
import {
  useGlobalControls,
  SystemStatus,
} from "../context/GlobalControlsContext";
const statusCopy: Record<SystemStatus, string> = {
  ok: "System status: OK",
  warning: "System status: Warning",
  critical: "System status: Attention required",
};
interface HeaderStatusStripProps {
  className?: string;
}
const HeaderStatusStrip: React.FC<HeaderStatusStripProps> = ({ className }) => {
  const { systemStatus, localTime } = useGlobalControls();
  const RealtimeWaveIcon = () => (
    <svg
      className="vrm-realtime-wave"
      viewBox="0 0 48 16"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <g className="vrm-realtime-wave-track">
        <path
          d="M2 8c4-6 10-6 14 0s10 6 14 0 10-6 14 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M2 8c4-6 10-6 14 0s10 6 14 0 10-6 14 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          transform="translate(48 0)"
        />
      </g>
    </svg>
  );
  return (
    <div
      className={`vrm-header-meta ${className ?? ""}`.trim()}
      role="status"
      aria-live="polite"
    >
      <div className="vrm-header-meta-group">
        <span className="vrm-header-chip" title="Last updated timestamp">
          {" "}
          Last updated:{" "}
          <span className="vrm-header-chip-highlight">
            <RealtimeWaveIcon /> Realtime{" "}
          </span>
        </span>
      </div>
      <span className="vrm-header-meta-divider" aria-hidden="true" />
      <div className="vrm-header-meta-group">
        <span className="vrm-header-chip" title={statusCopy[systemStatus]}>
          <span
            className={`vrm-status-indicator ${systemStatus}`}
            aria-hidden
          />{" "}
          {statusCopy[systemStatus]}{" "}
        </span>
      </div>
      <span className="vrm-header-meta-divider" aria-hidden="true" />
      <div className="vrm-header-meta-group">
        <span className="vrm-header-chip" title="Local site time">
          {" "}
          Local time: {localTime}{" "}
        </span>
      </div>
    </div>
  );
};
export default HeaderStatusStrip;
