import { useMemo } from "react";
import ErrorBoundary from "../../common/components/ErrorBoundary";
import type { DashboardManifest, DashboardWidget } from "./types";
import { Credentials } from "../../types/credentials";
import "./styles/DashboardPage.css";
import DashboardHeader from "./components/DashboardHeader";
import KpiBand from "./components/KpiBand";
import ChartGrid from "./components/ChartGrid";
import { useDashboardManifest } from "./hooks/useDashboardManifest";
import { useDashboardWidgets } from "./hooks/useDashboardWidgets";
import { useSiteFlow } from "./hooks/useSiteFlow";
import type { FetchDashboardManifestOptions } from "./transport/fetchDashboardManifest";
import type { LoadWidgetOptions, loadWidgetResult } from "./transport/loadWidgetResult";
const DashboardPage = ({
  credentials,
  manifestLoader,
  widgetResultLoader,
  unpinWidget,
  dashboardId,
}: DashboardPageProps) => {
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
    <div className="dashboard-v2" aria-busy={status === "loading"}>
      <div className="dashboard-v2__content vrm-dashboard-shell">
        <DashboardHeader />
        {status === "error" && error ? (
          <div className="dashboard-v2__error-banner" role="alert">
            {error}
          </div>
        ) : null}
        <KpiBand kpiWidgets={kpiWidgets} onRemoveWidget={handleUnpinWidget} />
        <ChartGrid
          chartWidgets={chartWidgets}
          gridColumns={gridColumns}
          onRemoveWidget={handleUnpinWidget}
          siteFlowMode={siteFlowMode}
          onSiteFlowModeChange={setSiteFlowMode}
          siteFlowTimeframe={siteFlowTimeframe}
          onSiteFlowTimeframeChange={handleSiteFlowTimeframeChange}
          siteFlowDemographics={siteFlowDemographics}
          siteFlowActivity={siteFlowActivity}
        />
      </div>
    </div>
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
