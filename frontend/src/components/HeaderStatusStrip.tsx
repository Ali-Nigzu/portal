import React, { createContext, useContext, useEffect, useState } from "react";

const formatLocalTime = () =>
  new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
const LocalClockContext = createContext<string | undefined>(undefined);
export function LocalClockProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [localTime, setLocalTime] = useState(formatLocalTime);
  useEffect(() => {
    const timer = window.setInterval(
      () => setLocalTime(formatLocalTime()),
      60000,
    );
    return () => window.clearInterval(timer);
  }, []);
  return (
    <LocalClockContext.Provider value={localTime}>
      {children}
    </LocalClockContext.Provider>
  );
}
export type DashboardStatus = {
  realtime: boolean;
  enabled: boolean;
};
interface HeaderStatusStripProps {
  className?: string;
  layout?: "desktop" | "mobile";
  status: DashboardStatus;
  trailingAction?: React.ReactNode;
}
const HeaderStatusStrip: React.FC<HeaderStatusStripProps> = ({
  className,
  layout = "desktop",
  status,
  trailingAction,
}) => {
  const localTime = useContext(LocalClockContext);
  const realtime = status.realtime;
  const systemLabel = `System status: ${status.enabled ? "ON" : "OFF"}`;
  const indicator = status.enabled ? "on" : "off";
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
    return (
      <span
        className={`vrm-status-wave${realtime ? "" : " vrm-status-wave--offline"}`}
      >
        {wave}
        {!realtime && (
          <svg
            className="vrm-status-wave__cross"
            viewBox="0 0 12 12"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M3 3l6 6M9 3L3 9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        )}
      </span>
    );
  };
  if (layout === "mobile") {
    return (
      <div
        className={`vrm-header-meta-mobile ${className ?? ""}`.trim()}
        role="status"
        aria-live="polite"
      >
        <div className="vrm-header-meta-mobile__row">
          Last updated:{" "}
          <span
            className={`vrm-header-chip-highlight${realtime ? "" : " vrm-header-chip-highlight--offline"}`}
          >
            {
              <>
                <RealtimeWaveIcon /> {realtime ? "Realtime" : "Offline"}
              </>
            }
          </span>
        </div>
        <div className="vrm-header-meta-mobile__row">
          {
            <>
              <span
                className={`vrm-status-indicator ${indicator}`}
                aria-hidden
              />{" "}
              {systemLabel}
            </>
          }
        </div>
        <div className="vrm-header-meta-mobile__row">
          Local time: {localTime}
          {trailingAction}
        </div>
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
        <span
          className="vrm-header-chip"
          title={"Analysed device data freshness"}
        >
          Last updated:{" "}
          <span
            className={`vrm-header-chip-highlight${realtime ? "" : " vrm-header-chip-highlight--offline"}`}
          >
            {
              <>
                <RealtimeWaveIcon /> {realtime ? "Realtime" : "Offline"}
              </>
            }
          </span>
        </span>
      </div>
      <span className="vrm-header-meta-divider" aria-hidden="true" />
      <div className="vrm-header-meta-group">
        <span className="vrm-header-chip" title={systemLabel}>
          {
            <>
              <span
                className={`vrm-status-indicator ${indicator}`}
                aria-hidden
              />{" "}
              {systemLabel}
            </>
          }
        </span>
      </div>
      <span className="vrm-header-meta-divider" aria-hidden="true" />
      <div className="vrm-header-meta-group">
        <span className="vrm-header-chip" title="Local site time">
          Local time: {localTime}
        </span>
        {trailingAction}
      </div>
    </div>
  );
};
export default HeaderStatusStrip;
