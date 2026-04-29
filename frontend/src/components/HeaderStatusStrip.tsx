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
  layout?: "desktop" | "mobile";
}

const HeaderStatusStrip: React.FC<HeaderStatusStripProps> = ({
  className,
  isAuthenticatedView = false,
  layout = "desktop",
}) => {
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

  if (layout === "mobile") {
    return (
      <div className={`vrm-header-meta-mobile ${className ?? ""}`.trim()} role="status" aria-live="polite">
        <div className="vrm-header-meta-mobile__row">
          Last updated:{" "}
          <span className="vrm-header-chip-highlight">
            {isAuthenticatedView ? (
              <span style={{ color: "var(--vrm-text-muted)" }}>-</span>
            ) : (
              <>
                <RealtimeWaveIcon /> Realtime
              </>
            )}
          </span>
        </div>
        <div className="vrm-header-meta-mobile__row">
          {isAuthenticatedView ? (
            <>
              System status: <span style={{ color: "var(--vrm-text-muted)" }}>NA</span>
            </>
          ) : (
            <>
              <span className={`vrm-status-indicator ${systemStatus}`} aria-hidden />{" "}
              {statusCopy[systemStatus]}
            </>
          )}
        </div>
        <div className="vrm-header-meta-mobile__row">Local time: {localTime}</div>
      </div>
    );
  }

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
            {isAuthenticatedView ? <span style={{ color: "var(--vrm-text-muted)" }}>-</span> : <><RealtimeWaveIcon /> Realtime</>}
          </span>
        </span>
      </div>
      <span className="vrm-header-meta-divider" aria-hidden="true" />
      <div className="vrm-header-meta-group">
        <span className="vrm-header-chip" title={isAuthenticatedView ? "System status unavailable" : statusCopy[systemStatus]}>
          {isAuthenticatedView ? (
            <span style={{ color: "var(--vrm-text-muted)" }}>NA</span>
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
