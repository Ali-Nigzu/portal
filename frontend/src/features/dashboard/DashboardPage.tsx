import { useEffect, useMemo } from "react";
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
  const DEBUG_SCROLL =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    window.localStorage.getItem("DEBUG_SCROLL") === "1";
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

  useEffect(() => {
    if (!DEBUG_SCROLL || typeof window === "undefined") {
      return;
    }

    const findScrollContainer = () => {
      const candidates = [
        document.querySelector<HTMLElement>(".vrm-main"),
        document.querySelector<HTMLElement>(".vrm-content"),
        document.scrollingElement as HTMLElement | null,
      ];
      return (
        candidates.find(
          (el) => el && el.scrollHeight > el.clientHeight,
        ) ?? null
      );
    };

    const logMetrics = (label: string, el: Element | null) => {
      if (!el) {
        // eslint-disable-next-line no-console
        console.info(`[DEBUG_SCROLL] ${label}: not found`);
        return;
      }
      const target = el as HTMLElement;
      // eslint-disable-next-line no-console
      console.info(
        `[DEBUG_SCROLL] ${label}:`,
        target.tagName.toLowerCase(),
        target.className,
        {
          scrollHeight: target.scrollHeight,
          clientHeight: target.clientHeight,
          offsetHeight: target.offsetHeight,
        },
      );
    };

    const logLastChild = (container: HTMLElement) => {
      const lastChild = container.lastElementChild as HTMLElement | null;
      if (!lastChild) {
        // eslint-disable-next-line no-console
        console.info("[DEBUG_SCROLL] last child: none");
        return;
      }
      const styles = window.getComputedStyle(lastChild);
      // eslint-disable-next-line no-console
      console.info("[DEBUG_SCROLL] last child:", lastChild.tagName.toLowerCase(), lastChild.className, {
        marginBottom: styles.marginBottom,
        paddingBottom: styles.paddingBottom,
        minHeight: styles.minHeight,
        height: styles.height,
        display: styles.display,
        position: styles.position,
      });
    };

    const logBottomMost = (container: HTMLElement) => {
      const bottomNode = document.elementFromPoint(
        window.innerWidth / 2,
        window.innerHeight - 5,
      ) as HTMLElement | null;
      if (!bottomNode) {
        // eslint-disable-next-line no-console
        console.info("[DEBUG_SCROLL] bottom-most: none");
        return;
      }
      const chain: string[] = [];
      let current: HTMLElement | null = bottomNode;
      while (current) {
        chain.push(
          `${current.tagName.toLowerCase()}${current.className ? `.${current.className}` : ""}`,
        );
        if (current === container) {
          break;
        }
        current = current.parentElement;
      }
      // eslint-disable-next-line no-console
      console.info(
        "[DEBUG_SCROLL] bottom-most:",
        `${bottomNode.tagName.toLowerCase()}${bottomNode.className ? `.${bottomNode.className}` : ""}`,
        "ancestors:",
        chain,
      );
    };

    const logAll = (reason: string) => {
      const container = findScrollContainer();
      if (!container) {
        // eslint-disable-next-line no-console
        console.info("[DEBUG_SCROLL] scroll container not found");
        return;
      }
      // eslint-disable-next-line no-console
      console.info(`[DEBUG_SCROLL] reason=${reason}`);
      logMetrics("scroll container", container);
      logMetrics(".vrm-layout", document.querySelector(".vrm-layout"));
      logMetrics(".vrm-main", document.querySelector(".vrm-main"));
      logMetrics(".vrm-content", document.querySelector(".vrm-content"));
      logMetrics(".dashboard-v2", document.querySelector(".dashboard-v2"));
      logMetrics(".dashboard-v2__grid", document.querySelector(".dashboard-v2__grid"));
      logMetrics(
        "siteflow container",
        document.querySelector(
          ".site-flow-card, .site-flow-demographics, .dashboard-v2__chart-card",
        ),
      );
      logLastChild(container);
      logBottomMost(container);
    };

    logAll("mount");

    const scrollContainer = findScrollContainer();
    if (!scrollContainer) {
      return;
    }
    let wasAtBottom = false;
    const onScroll = () => {
      const atBottom =
        Math.abs(
          scrollContainer.scrollHeight -
            scrollContainer.clientHeight -
            scrollContainer.scrollTop,
        ) < 2;
      if (atBottom && !wasAtBottom) {
        wasAtBottom = true;
        logAll("scroll-bottom");
      }
      if (!atBottom) {
        wasAtBottom = false;
      }
    };
    scrollContainer.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scrollContainer.removeEventListener("scroll", onScroll);
    };
  }, [DEBUG_SCROLL]);

  return (
    <div className="dashboard-v2" aria-busy={status === "loading"}>
      <div className="dashboard-v2__content vrm-dashboard-shell">
        <DashboardHeader clientId={resolvedUiClient} />
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
