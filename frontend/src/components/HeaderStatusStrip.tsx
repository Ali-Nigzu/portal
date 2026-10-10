import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
type SystemStatus = "ok" | "warning" | "critical";
interface CustomRange {
  from: string;
  to: string;
}
const formatLocalTime = () =>
  new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
const STORAGE_KEY = "camOS.globalControls";
interface PersistedState {
  rangePreset: string;
  customRange?: CustomRange;
  granularity: string;
  scope: string;
  segments: string[];
  compare: string;
  realtime: boolean;
  lastUpdated?: string;
  systemStatus: SystemStatus;
}
const getInitialState = (): PersistedState => {
  if (typeof window === "undefined") {
    return {
      rangePreset: "last_7_days",
      customRange: undefined,
      granularity: "auto",
      scope: "all_cameras",
      segments: [],
      compare: "off",
      realtime: false,
      lastUpdated: new Date().toISOString(),
      systemStatus: "ok",
    };
  }
  const defaultState: PersistedState = {
    rangePreset: "last_7_days",
    customRange: undefined,
    granularity: "auto",
    scope: "all_cameras",
    segments: [],
    compare: "off",
    realtime: false,
    lastUpdated: new Date().toISOString(),
    systemStatus: "ok",
  };
  const persisted = window.sessionStorage.getItem(STORAGE_KEY);
  if (!persisted) {
    return defaultState;
  }
  try {
    const parsed = JSON.parse(persisted) as Partial<PersistedState> | undefined;
    if (!parsed) {
      return defaultState;
    }
    return {
      rangePreset: parsed.rangePreset ?? defaultState.rangePreset,
      customRange: parsed.customRange,
      granularity: parsed.granularity ?? defaultState.granularity,
      scope: parsed.scope ?? defaultState.scope,
      segments: Array.isArray(parsed.segments)
        ? parsed.segments
        : defaultState.segments,
      compare: parsed.compare ?? defaultState.compare,
      realtime:
        typeof parsed.realtime === "boolean"
          ? parsed.realtime
          : defaultState.realtime,
      lastUpdated: parsed.lastUpdated ?? defaultState.lastUpdated,
      systemStatus: parsed.systemStatus ?? defaultState.systemStatus,
    };
  } catch (error) {
    return defaultState;
  }
};
const GlobalControlsContext = createContext<
  { systemStatus: SystemStatus; localTime: string } | undefined
>(undefined);
export function GlobalControlsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const initialState = useMemo(getInitialState, []);
  const [localTime, setLocalTime] = useState(formatLocalTime());
  const [lastUpdated, setLastUpdated] = useState(initialState.lastUpdated);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setLocalTime(formatLocalTime());
      setLastUpdated(new Date().toISOString());
    }, 1000 * 60);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...initialState, lastUpdated }),
    );
  }, [initialState, lastUpdated]);
  const value = useMemo(
    () => ({ systemStatus: initialState.systemStatus, localTime }),
    [initialState, localTime],
  );
  return (
    <GlobalControlsContext.Provider value={value}>
      {children}
    </GlobalControlsContext.Provider>
  );
}
const useGlobalControls = () => {
  const context = useContext(GlobalControlsContext);
  if (!context)
    throw new Error(
      "useGlobalControls must be used within a GlobalControlsProvider",
    );
  return context;
};

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
  trailingAction?: React.ReactNode;
}

const HeaderStatusStrip: React.FC<HeaderStatusStripProps> = ({
  className,
  isAuthenticatedView = false,
  layout = "desktop",
  status,
  trailingAction,
}) => {
  const { systemStatus, localTime } = useGlobalControls();
  // Relational status overrides the shared clock/status presentation.
  const placeholder = !status && isAuthenticatedView;
  const realtime = status ? status.realtime : true;
  const systemLabel = status
    ? `System status: ${status.enabled ? "ON" : "OFF"}`
    : statusCopy[systemStatus];
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
              System status:{" "}
              <span style={{ color: "var(--vrm-text-muted)" }}>NA</span>
            </>
          ) : (
            <>
              <span
                className={`vrm-status-indicator ${indicator}`}
                aria-hidden
              />{" "}
              {systemLabel}
            </>
          )}
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
          title={
            status ? "Analysed device data freshness" : "Last updated timestamp"
          }
        >
          Last updated:{" "}
          <span
            className={`vrm-header-chip-highlight${realtime ? "" : " vrm-header-chip-highlight--offline"}`}
          >
            {placeholder ? (
              <span style={{ color: "var(--vrm-text-muted)" }}>-</span>
            ) : (
              <>
                <RealtimeWaveIcon /> {realtime ? "Realtime" : "Offline"}
              </>
            )}
          </span>
        </span>
      </div>
      <span className="vrm-header-meta-divider" aria-hidden="true" />
      <div className="vrm-header-meta-group">
        <span
          className="vrm-header-chip"
          title={placeholder ? "System status unavailable" : systemLabel}
        >
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
        {trailingAction}
      </div>
    </div>
  );
};

export default HeaderStatusStrip;
