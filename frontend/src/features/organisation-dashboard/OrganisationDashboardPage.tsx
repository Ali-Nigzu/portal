import React from "react";
import { useLocation } from "react-router-dom";
import { TrafficDistribution } from "../../analytics/components/ChartRenderer/primitives/TrafficDistribution";
import { AxisManager } from "../../analytics/components/ChartRenderer/managers/AxisManager";
import { SeriesManager } from "../../analytics/components/ChartRenderer/managers/SeriesManager";
import type { ChartResult } from "../../analytics/schemas/charting";
import {
  TIMEFRAME_OPTIONS,
  type ReportTimeframe,
} from "../reports/utils/reportUtils";
import { resolveSiteViewOrDefault } from "./selection";
import {
  consumeDemoSiteFlowModeOverride,
  consumeDemoTimeRangeOverride,
  getDemoSiteFlowTimeframe,
} from "./demoSession";
import {
  historicalZeroKpis,
  historicalZeroActivity,
  loadHistoricalSnapshot,
} from "./compatibility";
import { useEffect, useMemo, useRef, useState } from "react";
import ErrorBoundary from "../../common/components/ErrorBoundary";
import { DashboardKpiSection } from "./components/KpiBand";
import DashboardHeader from "./components/DashboardHeader";
import DashboardLoadingState from "./DashboardLoadingState";
import type { KpiState } from "./components/KpiBand";
import { Card } from "../../analytics/components/Card/Card";
import { ChartRenderer } from "../../analytics/components/ChartRenderer/ChartRenderer";
import {
  DemoDonutTooltipBoundary,
  DemoDonutTooltipProvider,
} from "../../analytics/components/ChartRenderer/primitives/DemoDonutTooltipOwnerContext";
import { useDashboardSnapshot } from "./OrganisationDashboardProvider";
import {
  VRM_KPI_IDS,
  VRM_KPI_TITLES,
  PERIOD_OPTIONS,
  projectActivity,
  projectDemographics,
  projectKpis,
} from "./projection";
import type { Period } from "./types";
import "../../styles/Dashboard.css";

export default function OrganisationDashboardPage({
  hideHeader = false,
}: {
  hideHeader?: boolean;
}) {
  const { context, selection, snapshot, error, notFound, retry } =
    useDashboardSnapshot();
  const [period, setPeriod] = useState<Period>("today");
  const [mode, setMode] = useState("activity");
  const kpis = useMemo<KpiState[]>(
    () =>
      snapshot
        ? projectKpis(snapshot).map(({ id, title, result }) => ({
            widget: { id, title, kind: "kpi", locked: true },
            status: "ready",
            result,
          }))
        : [],
    [snapshot],
  );
  const activity = useMemo(
    () => snapshot && projectActivity(snapshot, period),
    [snapshot, period],
  );
  const demographics = useMemo(
    () => snapshot && projectDemographics(snapshot.payload[period]),
    [snapshot, period],
  );
  const entity =
    selection?.scope === "site"
      ? context?.sites.find((site) => site.id === selection.id)
      : selection?.scope === "organisation"
        ? context?.organisation
        : undefined;
  return (
    <ErrorBoundary name="organisation-dashboard">
      <DemoDonutTooltipProvider>
        <DemoDonutTooltipBoundary>
          <div className="dashboard-v2" data-snapshot-ts={snapshot?.ts}>
            <div className="dashboard-v2__content vrm-dashboard-shell">
              {!hideHeader && entity && (
                <DashboardHeader
                  siteLabelOverride={entity.name}
                  status={{
                    realtime: entity.realtime,
                    enabled: entity.enabled,
                  }}
                />
              )}
              {notFound ? (
                <p role="alert">Dashboard not found.</p>
              ) : error ? (
                <div role="alert">
                  <p>{error}</p>
                  <button className="vrm-btn" onClick={retry}>
                    Retry
                  </button>
                </div>
              ) : !snapshot ? (
                <DashboardLoadingState />
              ) : (
                <>
                  <DashboardKpiSection
                    kpiWidgets={kpis}
                    donutTooltipMode="demo_cursor_hover"
                  />
                  <Card
                    title="Site Flow"
                    className="dashboard-v2__chart-card dashboard-v2__chart-card--site-flow vrm-card vrm-card--chart-panel"
                    dateSelector={
                      <div className="site-flow-card__controls">
                        <select
                          className="vrm-select"
                          aria-label="Site Flow view"
                          value={mode}
                          onChange={(e) => setMode(e.target.value)}
                        >
                          <option value="activity">Activity</option>
                          <option value="demographics">Demographics</option>
                        </select>
                        <select
                          className="vrm-select"
                          aria-label="Site Flow period"
                          value={period}
                          onChange={(e) => setPeriod(e.target.value as Period)}
                        >
                          {PERIOD_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    }
                  >
                    <div className="vrm-card-body site-flow-body">
                      {mode === "activity" ? (
                        <div
                          className="site-flow-activity"
                          tabIndex={0}
                          role="region"
                          aria-label="Site Flow activity timeline"
                        >
                          <ChartRenderer result={activity!} height={340} />
                        </div>
                      ) : (
                        <div className="site-flow-demographics">
                          {demographics!.map(({ id, result }) => (
                            <div key={id}>
                              <ChartRenderer
                                className="site-flow-demographics__chart"
                                result={result}
                                height={200}
                                donutTooltipMode="demo_cursor_hover"
                                donutTooltipOwnerId={id}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </Card>
                </>
              )}
            </div>
          </div>
        </DemoDonutTooltipBoundary>
      </DemoDonutTooltipProvider>
    </ErrorBoundary>
  );
}

const EMPTY_ACTIVITY_RESULT = {
  chartType: "composed_time" as const,
  xDimension: {
    id: "timestamp",
    type: "time" as const,
    bucket: "HOUR",
    timezone: "UTC",
  },
  series: [
    {
      id: "entrances",
      geometry: "line" as const,
      data: [{ x: "0", y: 0, value: 0 }],
    },
    {
      id: "exits",
      geometry: "line" as const,
      data: [{ x: "0", y: 0, value: 0 }],
    },
    {
      id: "occupancy",
      geometry: "line" as const,
      data: [{ x: "0", y: 0, value: 0 }],
    },
  ],
  meta: { timezone: "UTC", summary: { title: "Site Flow" } },
};

const EMPTY_DEMOGRAPHICS: EmptyDemographics = {
  timezone: "UTC",
  age: [],
  gender: [],
  race: [],
};

type SiteFlowCardProps = {
  mode?: "full" | "preview";
  widgetId: string;
  modeState: "activity" | "demographics";
  onModeChange: (mode: "activity" | "demographics") => void;
  timeframe: ReportTimeframe;
  onTimeframeChange: (timeframe: ReportTimeframe) => void;
  demographics: {
    status: "idle" | "loading" | "ready" | "error";
    data?: EmptyDemographics;
    error?: string;
  };
  activity: {
    status: "idle" | "loading" | "ready" | "error";
    result?: Parameters<typeof ChartRenderer>[0]["result"];
    error?: string;
  };
  donutTooltipMode?: "legacy" | "demo_cursor_hover";
};

const SiteFlowCard: React.FC<SiteFlowCardProps> = ({
  mode = "full",
  widgetId,
  modeState,
  onModeChange,
  timeframe,
  onTimeframeChange,
  demographics,
  activity,
  donutTooltipMode = "legacy",
}) => {
  const renderSiteFlowBody = () => {
    if (modeState === "demographics") {
      if (demographics.status === "loading") {
        return null;
      }
      if (demographics.status === "error") {
        return (
          <div className="dashboard-v2__error" role="alert">
            {demographics.error ?? "Failed to load demographics"}
          </div>
        );
      }
      if (demographics.status === "ready" && demographics.data) {
        return (
          <SiteFlowDemographicsView
            data={demographics.data}
            donutTooltipMode={donutTooltipMode}
          />
        );
      }
      return (
        <SiteFlowDemographicsView
          data={EMPTY_DEMOGRAPHICS}
          donutTooltipMode={donutTooltipMode}
        />
      );
    }
    if (activity.status === "loading") {
      return null;
    }
    if (activity.status === "error") {
      return (
        <div className="dashboard-v2__error" role="alert">
          {activity.error ?? "Failed to load Site Flow"}
        </div>
      );
    }
    return (
      <ChartRenderer
        result={activity.result ?? EMPTY_ACTIVITY_RESULT}
        height={360}
        widgetId={widgetId}
        donutTooltipMode={donutTooltipMode}
      />
    );
  };

  return (
    <Card
      title="Site Flow"
      className="dashboard-v2__chart-card dashboard-v2__chart-card--site-flow vrm-card vrm-card--chart-panel"
      dateSelector={
        <div className="site-flow-card__controls">
          <select
            className="vrm-select"
            aria-label="Select Site Flow view"
            value={modeState}
            onChange={(event) =>
              onModeChange(event.target.value as "activity" | "demographics")
            }
          >
            <option value="activity">Activity</option>
            <option value="demographics">Demographics</option>
          </select>
          <select
            className="vrm-select"
            aria-label="Select Site Flow timeframe"
            value={timeframe}
            onChange={(event) =>
              onTimeframeChange(event.target.value as ReportTimeframe)
            }
          >
            {TIMEFRAME_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      }
    >
      {renderSiteFlowBody()}
    </Card>
  );
};

type EmptyDemographics = {
  timezone: string;
  age: never[];
  gender: never[];
  race: never[];
};
function SiteFlowDemographicsView({
  data,
  donutTooltipMode = "legacy",
}: {
  data: EmptyDemographics;
  donutTooltipMode?: "legacy" | "demo_cursor_hover";
}) {
  return (
    <div className="site-flow-demographics">
      {["Age", "Gender", "Race"].map((title) => {
        const series = [
          {
            id: `${title.toLowerCase()}-demographics`,
            label: title,
            geometry: "bar" as const,
            data: [
              {
                x: "No data",
                label: "No data",
                code: null,
                value: 0,
                color: "#8a94a3",
              },
            ],
          },
        ];
        const result: ChartResult = {
          chartType: "categorical",
          xDimension: {
            id: "category",
            type: "category",
            timezone: data.timezone,
          },
          series,
          meta: {
            timezone: data.timezone,
            summary: {
              title,
              presentation: "vrm",
              chartStyle: "traffic_distribution",
            },
          },
        };
        return (
          <TrafficDistribution
            key={title}
            result={result}
            series={series}
            axisConfig={new AxisManager(series).build()}
            visibility={new SeriesManager(series).toObject()}
            height={220}
            className="site-flow-demographics__chart"
            widgetId={`site-flow-${title.toLowerCase()}`}
            donutTooltipOwnerId={`site-flow-${title.toLowerCase()}`}
            useRawLabels
            labelKey="label"
            donutTooltipMode={donutTooltipMode}
          />
        );
      })}
    </div>
  );
}

/** Supported aliases have no canonical organisation identity. Keep their zero
 * presentation isolated until their owner supplies a relational scope mapping. */
export function HistoricalDashboardRoute({
  isAuthenticatedView = false,
}: {
  isAuthenticatedView?: boolean;
}) {
  const location = useLocation();
  const rejectedToken = Boolean(
    new URLSearchParams(location.search).get("view_token"),
  );
  const siteView = resolveSiteViewOrDefault(location.pathname);
  useRef(consumeDemoTimeRangeOverride());
  const initialMode = useRef(consumeDemoSiteFlowModeOverride());
  const [mode, setMode] = useState<"activity" | "demographics">(
    initialMode.current === "demographics" ? "demographics" : "activity",
  );
  const [period, setPeriod] = useState<ReportTimeframe>(() => {
    const stored = getDemoSiteFlowTimeframe();
    return TIMEFRAME_OPTIONS.some((x) => x.id === stored)
      ? (stored as ReportTimeframe)
      : "today";
  });
  const [state, setState] = useState<{
    status: "loading" | "ready" | "error";
    kpis: KpiState[];
    activity?: ChartResult;
    error?: string;
  }>({ status: "loading", kpis: [] });
  useEffect(() => {
    if (rejectedToken) {
      setState({
        status: "error",
        kpis: [],
        error:
          'Failed to load dashboard manifest (status 401). {"detail":"Invalid or expired view token"}',
      });
      return;
    }
    const controller = new AbortController();
    setState((s) => ({ ...s, status: "loading", error: undefined }));
    loadHistoricalSnapshot(siteView, controller.signal)
      .then((snapshot) => {
        const kpis = historicalZeroKpis(snapshot, siteView).map(
          ({ id, title, result }) => ({
            widget: { id, title },
            status: "ready" as const,
            result,
          }),
        );
        const activity = historicalZeroActivity(snapshot, period);
        if (!controller.signal.aborted)
          setState({ status: "ready", kpis, activity });
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          const message =
            error instanceof Error ? error.message : "Unable to load dashboard";
          const kpis = Object.entries(VRM_KPI_IDS).map(([, id]) => ({
            widget: { id, title: VRM_KPI_TITLES[id] },
            status: "error" as const,
            error: message,
          }));
          setState({ status: "error", kpis, error: message });
        }
      });
    return () => controller.abort();
  }, [siteView, period, rejectedToken]);
  return (
    <ErrorBoundary
      name="dashboard"
      fallbackMessage="Dashboard is temporarily unavailable."
    >
      <div className="dashboard-v2 " aria-busy={state.status === "loading"}>
        <div className="dashboard-v2__content vrm-dashboard-shell">
          <DashboardHeader isAuthenticatedView={isAuthenticatedView} />
          {state.error && (
            <div className="dashboard-v2__error-banner " role="alert">
              {rejectedToken ? state.error : "Some widgets failed to load"}
            </div>
          )}
          <DashboardKpiSection kpiWidgets={state.kpis} />
          <section
            className="dashboard-v2__grid vrm-section vrm-section--chart"
            style={{
              gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
              gridAutoRows: "96px",
            }}
          >
            {!rejectedToken && (
              <div
                className="dashboard-v2__grid-item"
                style={{
                  gridColumn: "1 / span 12",
                  gridRow: "1 / span 4",
                  minHeight: "384px",
                }}
              >
                <SiteFlowCard
                  widgetId="live-flow"
                  modeState={mode}
                  onModeChange={setMode}
                  timeframe={period}
                  onTimeframeChange={setPeriod}
                  demographics={{ status: "ready", data: EMPTY_DEMOGRAPHICS }}
                  activity={{
                    status: state.status,
                    result: state.activity,
                    error: state.error,
                  }}
                />
              </div>
            )}
          </section>
        </div>
      </div>
    </ErrorBoundary>
  );
}
