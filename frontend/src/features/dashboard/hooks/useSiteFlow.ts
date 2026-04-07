import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DashboardManifest } from "../types";
import type {
  ChartSpec,
  ChartDimension,
} from "../../../analytics/schemas/charting";
import { decorateResult } from "../utils/vrmDecorators";
import {
  buildDemographicsWidget,
  isSiteFlowWidget,
  mapChartResultsToDemographics,
  resolveDemographicsTimeWindowFromRange,
  type DemographicWidgetKind,
  type SiteFlowDemographicsData,
} from "../utils/siteFlowDemographics";
import {
  bucketForSiteFlowTimeframe,
  resolveSiteFlowTimeRange,
  type SiteFlowTimeframe,
} from "../../../lib/siteFlowTimeframe";
import type { DashboardDataMode, LoadWidgetOptions } from "../transport/loadWidgetResult";
import { loadWidgetResult } from "../transport/loadWidgetResult";
import { isSnapshotOrg } from "../utils/snapshotMode";
import {
  consumeDemoSiteFlowModeOverride,
  consumeDemoSiteFlowTimeframeOverride,
} from "../../../lib/demoSession";
import { sanitizeChartResultForAuthenticated } from "../transport/loadEmptyWidgetResult";

const TIMESTAMP_DIMENSION_ID = "timestamp";

type WidgetResultLoader = typeof loadWidgetResult;

type WidgetResult = Awaited<ReturnType<typeof loadWidgetResult>>;

type UseSiteFlowParams = {
  manifest: DashboardManifest | null;
  orgId: string | undefined;
  viewToken: string | null;
  clientContextId: string | undefined;
  widgetResultLoader?: WidgetResultLoader;
  dataMode: DashboardDataMode;
};

type UseSiteFlowResult = {
  siteFlowWidget: DashboardManifest["widgets"][number] | null;
  siteFlowMode: "activity" | "demographics";
  setSiteFlowMode: (mode: "activity" | "demographics") => void;
  siteFlowTimeframe: SiteFlowTimeframe;
  handleSiteFlowTimeframeChange: (timeframe: SiteFlowTimeframe) => void;
  siteFlowActivity: {
    status: "idle" | "loading" | "ready" | "error";
    result?: WidgetResult;
    error?: string;
  };
  siteFlowDemographics: {
    status: "idle" | "loading" | "ready" | "error";
    data?: SiteFlowDemographicsData;
    error?: string;
  };
};

export const useSiteFlow = ({
  manifest,
  orgId,
  viewToken,
  clientContextId,
  widgetResultLoader,
  dataMode,
}: UseSiteFlowParams): UseSiteFlowResult => {
  const widgetResultLoaderImpl = widgetResultLoader ?? loadWidgetResult;
  const demoSiteFlowModeRef = useRef(consumeDemoSiteFlowModeOverride());
  const demoSiteFlowTimeframeRef = useRef(
    consumeDemoSiteFlowTimeframeOverride(),
  );
  const siteFlowWidget = useMemo(
    () => manifest?.widgets.find((widget) => isSiteFlowWidget(widget)) ?? null,
    [manifest],
  );
  const [siteFlowMode, setSiteFlowMode] = useState<
    "activity" | "demographics"
  >(demoSiteFlowModeRef.current === "demographics" ? "demographics" : "activity");
  const isSnapshotMode = useMemo(
    () => Boolean(viewToken) || isSnapshotOrg(orgId),
    [orgId, viewToken],
  );
  const hasUserSetSiteFlowTimeframe = useRef(false);
  const [siteFlowTimeframe, setSiteFlowTimeframe] = useState<SiteFlowTimeframe>(
    () => {
      const demoOverride = demoSiteFlowTimeframeRef.current;
      if (demoOverride === "today" || demoOverride === "all_time") {
        return demoOverride;
      }
      return isSnapshotMode ? "today" : "all_time";
    },
  );
  const [siteFlowActivity, setSiteFlowActivity] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    result?: WidgetResult;
    error?: string;
  }>({ status: "idle" });
  const [siteFlowDemographics, setSiteFlowDemographics] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    data?: SiteFlowDemographicsData;
    error?: string;
  }>({ status: "idle" });

  const handleSiteFlowTimeframeChange = useCallback(
    (next: SiteFlowTimeframe) => {
      hasUserSetSiteFlowTimeframe.current = true;
      setSiteFlowTimeframe(next);
    },
    [],
  );

  useEffect(() => {
    if (demoSiteFlowTimeframeRef.current) {
      hasUserSetSiteFlowTimeframe.current = true;
      demoSiteFlowTimeframeRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isSnapshotMode && !hasUserSetSiteFlowTimeframe.current) {
      setSiteFlowTimeframe("today");
    }
  }, [isSnapshotMode]);

  useEffect(() => {
    setSiteFlowActivity({ status: "idle" });
    setSiteFlowDemographics({ status: "idle" });
  }, [dataMode]);

  useEffect(() => {
    if (!siteFlowWidget || !manifest) {
      setSiteFlowActivity((previous) =>
        previous.status === "idle" ? previous : { status: "idle" },
      );
      return;
    }
    const controller = new AbortController();
    const timezone = manifest.timeControls?.timezone;
    const anchor = new Date();
    const timeRange = resolveSiteFlowTimeRange(
      siteFlowTimeframe,
      timezone,
      anchor,
    );
    const bucket = bucketForSiteFlowTimeframe(siteFlowTimeframe);
    if (!siteFlowWidget.inlineSpec) {
      setSiteFlowActivity({
        status: "error",
        error: "Site Flow spec unavailable",
      });
      return () => controller.abort();
    }
    const spec = JSON.parse(
      JSON.stringify(siteFlowWidget.inlineSpec),
    ) as ChartSpec;
    spec.timeWindow = {
      ...(spec.timeWindow ?? { from: "", to: "" }),
      from: timeRange.from,
      to: timeRange.to,
      bucket,
      ...(timezone ? { timezone } : {}),
    };
    if (Array.isArray(spec.dimensions)) {
      spec.dimensions = spec.dimensions.map((dimension) => {
        if ((dimension as { id?: string }).id === TIMESTAMP_DIMENSION_ID) {
          return { ...(dimension as ChartDimension), bucket };
        }
        return dimension;
      });
    }
    const widget = { ...siteFlowWidget, inlineSpec: spec };
    setSiteFlowActivity({ status: "loading" });
    widgetResultLoaderImpl(widget, {
      signal: controller.signal,
      timezone,
      orgId,
      viewToken,
      snapshotTimeframe: siteFlowTimeframe,
      dataMode,
    } as LoadWidgetOptions)
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }
        const normalizedResult = dataMode === "authenticated"
          ? sanitizeChartResultForAuthenticated(result)
          : result;
        const siteFlowDecoratorId =
          widget.chartSpecId === "dashboard.live_flow" ? "live-flow" : widget.id;
        const decorated = decorateResult(
          siteFlowDecoratorId,
          normalizedResult,
          clientContextId,
        );
        decorated.meta = decorated.meta ?? { timezone: "UTC" };
        decorated.meta.summary = {
          ...(decorated.meta.summary ?? {}),
          siteFlowTimeframe,
        };
        setSiteFlowActivity({ status: "ready", result: decorated });
      })
      .catch((err) => {
        if (controller.signal.aborted) {
          return;
        }
        const message =
          err instanceof Error ? err.message : "Failed to load Site Flow";
        setSiteFlowActivity({ status: "error", error: message });
      });
    return () => controller.abort();
  }, [
    clientContextId,
    manifest,
    orgId,
    siteFlowTimeframe,
    siteFlowWidget,
    viewToken,
    widgetResultLoaderImpl,
    dataMode,
  ]);

  useEffect(() => {
    if (!siteFlowWidget || !manifest) {
      setSiteFlowDemographics((previous) =>
        previous.status === "idle" ? previous : { status: "idle" },
      );
      return;
    }
    if (siteFlowMode !== "demographics") {
      return;
    }
    const controller = new AbortController();
    const timezone = manifest.timeControls?.timezone;
    const kinds: DemographicWidgetKind[] = ["age", "gender", "race"];
    const anchor = new Date();
    const timeRange = resolveSiteFlowTimeRange(
      siteFlowTimeframe,
      timezone,
      anchor,
    );
    const timeWindow = resolveDemographicsTimeWindowFromRange(
      timeRange,
      timezone,
    );
    setSiteFlowDemographics({ status: "loading" });
    const loadDemographic = async (kind: DemographicWidgetKind) =>
      widgetResultLoaderImpl(buildDemographicsWidget(kind, timeWindow), {
        signal: controller.signal,
        timezone,
        orgId,
        viewToken,
        snapshotTimeframe: siteFlowTimeframe,
        dataMode,
      } as LoadWidgetOptions);
    Promise.all(kinds.map((kind) => loadDemographic(kind)))
      .then(([ageResult, genderResult, raceResult]) => {
        if (controller.signal.aborted) {
          return;
        }
        const data: SiteFlowDemographicsData = mapChartResultsToDemographics({
          age: dataMode === "authenticated" ? sanitizeChartResultForAuthenticated(ageResult) : ageResult,
          gender: dataMode === "authenticated" ? sanitizeChartResultForAuthenticated(genderResult) : genderResult,
          race: dataMode === "authenticated" ? sanitizeChartResultForAuthenticated(raceResult) : raceResult,
          timezone,
        });
        setSiteFlowDemographics({ status: "ready", data });
      })
      .catch((err) => {
        if (controller.signal.aborted) {
          return;
        }
        const message =
          err instanceof Error ? err.message : "Failed to load demographics";
        setSiteFlowDemographics({ status: "error", error: message });
      });
    return () => controller.abort();
  }, [
    manifest,
    widgetResultLoaderImpl,
    orgId,
    viewToken,
    siteFlowTimeframe,
    siteFlowMode,
    siteFlowWidget,
    dataMode,
  ]);

  return {
    siteFlowWidget,
    siteFlowMode,
    setSiteFlowMode,
    siteFlowTimeframe,
    handleSiteFlowTimeframeChange,
    siteFlowActivity,
    siteFlowDemographics,
  };
};
