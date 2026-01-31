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
import type { LoadWidgetOptions } from "../transport/loadWidgetResult";
import { loadWidgetResult } from "../transport/loadWidgetResult";
import { isSnapshotOrg } from "../utils/snapshotMode";

const TIMESTAMP_DIMENSION_ID = "timestamp";

type WidgetResultLoader = typeof loadWidgetResult;

type WidgetResult = Awaited<ReturnType<typeof loadWidgetResult>>;

type UseSiteFlowParams = {
  manifest: DashboardManifest | null;
  orgId: string | undefined;
  viewToken: string | null;
  clientContextId: string | undefined;
  widgetResultLoader?: WidgetResultLoader;
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
}: UseSiteFlowParams): UseSiteFlowResult => {
  const widgetResultLoaderImpl = widgetResultLoader ?? loadWidgetResult;
  const siteFlowWidget = useMemo(
    () => manifest?.widgets.find((widget) => isSiteFlowWidget(widget)) ?? null,
    [manifest],
  );
  const [siteFlowMode, setSiteFlowMode] = useState<
    "activity" | "demographics"
  >("activity");
  const isSnapshotMode = useMemo(
    () => Boolean(viewToken) || isSnapshotOrg(orgId),
    [orgId, viewToken],
  );
  const hasUserSetSiteFlowTimeframe = useRef(false);
  const [siteFlowTimeframe, setSiteFlowTimeframe] = useState<SiteFlowTimeframe>(
    () => (isSnapshotMode ? "today" : "all_time"),
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
    if (isSnapshotMode && !hasUserSetSiteFlowTimeframe.current) {
      setSiteFlowTimeframe("today");
    }
  }, [isSnapshotMode]);

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
    } as LoadWidgetOptions)
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }
        const decorated = decorateResult(widget.id, result, clientContextId);
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
      } as LoadWidgetOptions);
    Promise.all(kinds.map((kind) => loadDemographic(kind)))
      .then(([ageResult, genderResult, raceResult]) => {
        if (controller.signal.aborted) {
          return;
        }
        const data: SiteFlowDemographicsData = mapChartResultsToDemographics({
          age: ageResult,
          gender: genderResult,
          race: raceResult,
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
