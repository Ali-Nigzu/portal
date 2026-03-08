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
  isAuthenticatedView?: boolean;
}

const HeaderStatusStrip: React.FC<HeaderStatusStripProps> = ({ className, isAuthenticatedView = false }) => {
  const { systemStatus, localTime } = useGlobalControls();
  const RealtimeWaveIcon = () => (
    <svg
      className="vrm-realtime-wave"
      viewBox="0 0 120 16"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <g className="vrm-realtime-wave-track">
        <path
          d="M0 8c5-6 15-6 20 0s15 6 20 0 15-6 20 0 15 6 20 0 15-6 20 0 15 6 20 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M0 8c5-6 15-6 20 0s15 6 20 0 15-6 20 0 15 6 20 0 15-6 20 0 15 6 20 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          transform="translate(120 0)"
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
          Last updated:{" "}
          <span className="vrm-header-chip-highlight">
            {isAuthenticatedView ? <span aria-hidden="true">✕</span> : <RealtimeWaveIcon />} {" "}
            {isAuthenticatedView ? <span style={{ color: "#ff6b6b" }}>NA</span> : "Realtime"}
          </span>
        </span>
      </div>
      <span className="vrm-header-meta-divider" aria-hidden="true" />
      <div className="vrm-header-meta-group">
        <span className="vrm-header-chip" title={isAuthenticatedView ? "No connected sites" : statusCopy[systemStatus]}>
          {isAuthenticatedView ? (
            <span style={{ color: "var(--vrm-text-muted)" }}>0 Sites Connected</span>
          ) : (
            <>
              <span
                className={`vrm-status-indicator ${systemStatus}`}
                aria-hidden
              />{" "}
              {statusCopy[systemStatus]}
            </>
          )}
        </span>
      </div>
      <span className="vrm-header-meta-divider" aria-hidden="true" />
      <div className="vrm-header-meta-group">
        <span className="vrm-header-chip" title="Local site time">
          Local time: {localTime}
        </span>
      </div>
    </div>
  );
};

export default HeaderStatusStrip;
