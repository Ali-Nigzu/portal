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

export type DashboardStatus = { realtime: boolean; enabled: boolean };

interface HeaderStatusStripProps {
  className?: string;
  isAuthenticatedView?: boolean;
  layout?: "desktop" | "mobile";
  status?: DashboardStatus;
}

const HeaderStatusStrip: React.FC<HeaderStatusStripProps> = ({
  className,
  isAuthenticatedView = false,
  layout = "desktop",
  status,
}) => {
  const { systemStatus, localTime } = useGlobalControls();
  // Canonical dashboards supply relational truth; legacy consumers retain
  // their existing presentation without writing to GlobalControlsContext.
  const placeholder = !status && isAuthenticatedView;
  const realtime = status ? status.realtime : true;
  const systemLabel = status ? `System status: ${status.enabled ? "ON" : "OFF"}` : statusCopy[systemStatus];
  const indicator = status ? (status.enabled ? "on" : "off") : systemStatus;
  const RealtimeWaveIcon = () => {
    const wave = (
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
    if (!status) return wave;
    return <span className={`vrm-status-wave${realtime ? "" : " vrm-status-wave--offline"}`}>
    {wave}
    {!realtime && <svg className="vrm-status-wave__cross" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path d="M3 3l6 6M9 3L3 9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>}
    </span>;
  };

  if (layout === "mobile") {
    return (
      <div className={`vrm-header-meta-mobile ${className ?? ""}`.trim()} role="status" aria-live="polite">
        <div className="vrm-header-meta-mobile__row">
          Last updated:{" "}
          <span className={`vrm-header-chip-highlight${realtime ? "" : " vrm-header-chip-highlight--offline"}`}>
            {placeholder ? (
              <span style={{ color: "var(--vrm-text-muted)" }}>-</span>
            ) : (
              <>
                <RealtimeWaveIcon /> {realtime ? "Realtime" : "Offline"}
              </>
            )}
          </span>
        </div>
        <div className="vrm-header-meta-mobile__row">
          {placeholder ? (
            <>
              System status: <span style={{ color: "var(--vrm-text-muted)" }}>NA</span>
            </>
          ) : (
            <>
              <span className={`vrm-status-indicator ${indicator}`} aria-hidden />{" "}
              {systemLabel}
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
        <span className="vrm-header-chip" title={status ? "Analysed device data freshness" : "Last updated timestamp"}>
          Last updated:{" "}
          <span className={`vrm-header-chip-highlight${realtime ? "" : " vrm-header-chip-highlight--offline"}`}>
            {placeholder ? <span style={{ color: "var(--vrm-text-muted)" }}>-</span> : <><RealtimeWaveIcon /> {realtime ? "Realtime" : "Offline"}</>}
          </span>
        </span>
      </div>
      <span className="vrm-header-meta-divider" aria-hidden="true" />
      <div className="vrm-header-meta-group">
        <span className="vrm-header-chip" title={placeholder ? "System status unavailable" : systemLabel}>
          {placeholder ? (
            <span style={{ color: "var(--vrm-text-muted)" }}>NA</span>
          ) : (
            <>
              <span
                className={`vrm-status-indicator ${indicator}`}
                aria-hidden
              />{" "}
              {systemLabel}
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
