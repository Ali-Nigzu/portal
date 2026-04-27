import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import ErrorBoundary from "../../common/components/ErrorBoundary";
import type { DashboardManifest } from "./types";
import { Credentials } from "../../types/credentials";
import "./styles/DashboardPage.css";
import { useDashboardManifest } from "./hooks/useDashboardManifest";
import { useDashboardWidgets } from "./hooks/useDashboardWidgets";
import { useSiteFlow } from "./hooks/useSiteFlow";
import type { FetchDashboardManifestOptions } from "./transport/fetchDashboardManifest";
import type { DashboardDataMode, loadWidgetResult } from "./transport/loadWidgetResult";
import DashboardView from "./components/DashboardView";
import { resolveSiteViewOrDefault } from "../../lib/siteView";

const DashboardPage = ({
  credentials,
  manifestLoader,
  widgetResultLoader,
  unpinWidget,
  dashboardId,
  dataMode = "demo",
  donutTooltipMode = "legacy",
}: DashboardPageProps) => {
  const location = useLocation();
  const siteView = useMemo(
    () => resolveSiteViewOrDefault(location.pathname),
    [location.pathname],
  );
  const {
    manifest,
    setManifest,
    status: manifestStatus,
    error: manifestError,
    selectedTimeRange,
    orgId,
    viewToken,
    resolvedDashboardId,
    resolvedUiClient,
  } = useDashboardManifest({ credentials, manifestLoader, dashboardId });

  const {
    status: widgetStatus,
    error: widgetError,
    kpiWidgets,
    chartWidgets,
    handleUnpinWidget,
  } = useDashboardWidgets({
    manifest,
    selectedTimeRange,
    orgId,
    viewToken,
    clientContextId: resolvedUiClient,
    widgetResultLoader,
    unpinWidget,
    resolvedDashboardId,
    setManifest,
    dataMode,
    siteView,
  });

  const {
    siteFlowMode,
    setSiteFlowMode,
    siteFlowTimeframe,
    handleSiteFlowTimeframeChange,
    siteFlowActivity,
    siteFlowDemographics,
  } = useSiteFlow({
    manifest,
    orgId,
    viewToken,
    clientContextId: resolvedUiClient,
    widgetResultLoader,
    dataMode,
    siteView,
  });

  const status = useMemo(() => {
    if (manifestStatus === "loading" || widgetStatus === "loading") {
      return "loading";
    }
    if (manifestStatus === "error" || widgetStatus === "error") {
      return "error";
    }
    if (manifestStatus === "ready" || widgetStatus === "ready") {
      return "ready";
    }
    return "idle";
  }, [manifestStatus, widgetStatus]);

  const error = manifestStatus === "error" ? manifestError : widgetError;
  const gridColumns = manifest?.layout.grid.columns ?? 12;

  return (
    <DashboardView
      mode="full"
      clientId={resolvedUiClient}
      isAuthenticatedView={dataMode === "authenticated"}
      status={status}
      error={error}
      kpiWidgets={kpiWidgets}
      chartWidgets={chartWidgets}
      gridColumns={gridColumns}
      onRemoveWidget={handleUnpinWidget}
      siteFlowMode={siteFlowMode}
      onSiteFlowModeChange={setSiteFlowMode}
      siteFlowTimeframe={siteFlowTimeframe}
      onSiteFlowTimeframeChange={handleSiteFlowTimeframeChange}
      siteFlowDemographics={siteFlowDemographics}
      siteFlowActivity={siteFlowActivity}
      donutTooltipMode={donutTooltipMode}
    />
  );
};

type ManifestLoader = (
  orgId: string | undefined,
  dashboardId?: string,
  options?: FetchDashboardManifestOptions,
) => Promise<DashboardManifest>;

type WidgetResultLoader = typeof loadWidgetResult;

type UnpinMutator = (
  orgId: string,
  dashboardId: string,
  widgetId: string,
) => Promise<DashboardManifest>;

interface DashboardPageProps {
  credentials: Credentials;
  manifestLoader?: ManifestLoader;
  widgetResultLoader?: WidgetResultLoader;
  unpinWidget?: UnpinMutator;
  dashboardId?: string;
  dataMode?: DashboardDataMode;
  donutTooltipMode?: "legacy" | "demo_cursor_hover";
}

const DashboardPageWithBoundary = (props: DashboardPageProps) => (
  <ErrorBoundary
    name="dashboard"
    fallbackMessage="Dashboard is temporarily unavailable."
  >
    <DashboardPage {...props} />
  </ErrorBoundary>
);

export { DashboardPage };
export default DashboardPageWithBoundary;
