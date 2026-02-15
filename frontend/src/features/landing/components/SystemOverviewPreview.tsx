import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import type { Credentials } from "../../../types/credentials";
import { getViewTokenFromLocation } from "../../../lib/viewToken";
import {
  applyDemoDefaultsOnce,
  enableDemoSession,
  isDemoSessionActive,
} from "../../../lib/demoSession";
import { useDashboardManifest } from "../../dashboard/hooks/useDashboardManifest";
import { useDashboardWidgets } from "../../dashboard/hooks/useDashboardWidgets";
import { VRM_KPI_IDS } from "../../dashboard/utils/applyVRMOverrides";
import DashboardKpiSection from "../../dashboard/components/DashboardKpiSection";
import "../../dashboard/styles/DashboardPage.css";
import styles from "./SystemOverviewPreview.module.css";

type TopTileId = "entrances" | "occupancy" | "exits" | "footfall";

type WireLayout = {
  width: number;
  height: number;
  busY: number;
  busX1: number;
  busX2: number;
  taps: number[];
  connectedBottomY: number[];
  leftTopY: number;
  rightTopY: number;
  nodeX: number;
};

const TOP_TILES: Array<{ key: TopTileId; widgetId: string; slotClass: string }> = [
  { key: "entrances", widgetId: VRM_KPI_IDS.entrances, slotClass: styles.tileT1 },
  { key: "occupancy", widgetId: VRM_KPI_IDS.occupancy, slotClass: styles.tileT2 },
  { key: "exits", widgetId: VRM_KPI_IDS.exits, slotClass: styles.tileT3 },
  { key: "footfall", widgetId: VRM_KPI_IDS.footfall, slotClass: styles.tileT4 },
];

const CONNECTED_TOP_IDS: TopTileId[] = ["entrances", "occupancy", "exits"];
const CAPACITY_PERCENT = 68;
const NOOP_REMOVE = () => undefined;
const PREVIEW_CREDENTIALS: Credentials = { username: "", password: "" };
const LANDING_BOOTSTRAP_KEY = "landing_demo_bootstrap_done";

const initialWireLayout: WireLayout = {
  width: 0,
  height: 0,
  busY: 0,
  busX1: 0,
  busX2: 0,
  taps: [0, 0, 0, 0, 0],
  connectedBottomY: [0, 0, 0],
  leftTopY: 0,
  rightTopY: 0,
  nodeX: 0,
};


const parseCssPx = (value: string, fallback: number) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const SystemOverviewLiveKpis: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const topClusterRef = useRef<HTMLDivElement | null>(null);
  const bottomClusterRef = useRef<HTMLDivElement | null>(null);
  const topSlotRefs = useRef<Record<TopTileId, HTMLDivElement | null>>({
    entrances: null,
    occupancy: null,
    exits: null,
    footfall: null,
  });
  const topAnchorRefs = useRef<Record<TopTileId, HTMLDivElement | null>>({
    entrances: null,
    occupancy: null,
    exits: null,
    footfall: null,
  });
  const dwellSlotRef = useRef<HTMLDivElement | null>(null);
  const dwellAnchorRef = useRef<HTMLDivElement | null>(null);
  const leftRef = useRef<HTMLDivElement | null>(null);
  const leftAnchorRef = useRef<HTMLDivElement | null>(null);
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const [wire, setWire] = useState<WireLayout>(initialWireLayout);

  const {
    manifest,
    status: manifestStatus,
    error: manifestError,
    selectedTimeRange,
    orgId,
    viewToken,
    resolvedDashboardId,
    resolvedUiClient,
    setManifest,
  } = useDashboardManifest({ credentials: PREVIEW_CREDENTIALS });

  const {
    status: widgetStatus,
    error: widgetError,
    kpiWidgets,
  } = useDashboardWidgets({
    manifest,
    selectedTimeRange,
    orgId,
    viewToken,
    clientContextId: resolvedUiClient,
    resolvedDashboardId,
    setManifest,
  });

  const kpiLookup = useMemo(
    () => new Map(kpiWidgets.map((item) => [item.widget.id, item])),
    [kpiWidgets],
  );

  const topWidgets = TOP_TILES.map((tile) => ({
    ...tile,
    widget: kpiLookup.get(tile.widgetId) ?? null,
  }));
  const hasTopWidgets = topWidgets.every((item) => Boolean(item.widget));
  const dwellWidget = kpiLookup.get(VRM_KPI_IDS.dwell) ?? null;
  const trafficWidget = kpiLookup.get(VRM_KPI_IDS.traffic) ?? null;

  useLayoutEffect(() => {
    const update = () => {
      if (
        !containerRef.current ||
        !topClusterRef.current ||
        !bottomClusterRef.current ||
        !leftRef.current ||
        !dwellSlotRef.current ||
        !nodeRef.current
      ) {
        return;
      }

      const topAnchorsById = Object.fromEntries(
        TOP_TILES.map(({ key }) => [key, topAnchorRefs.current[key]]),
      ) as Record<TopTileId, HTMLDivElement | null>;

      const connectedTopAnchors = CONNECTED_TOP_IDS.map((id) => topAnchorsById[id]);
      if (connectedTopAnchors.some((anchor) => !anchor) || !leftAnchorRef.current || !dwellAnchorRef.current) {
        return;
      }

      const container = containerRef.current.getBoundingClientRect();
      const topCluster = topClusterRef.current.getBoundingClientRect();
      const leftAnchor = leftAnchorRef.current.getBoundingClientRect();
      const rightAnchor = dwellAnchorRef.current.getBoundingClientRect();
      const node = nodeRef.current.getBoundingClientRect();

      const computed = window.getComputedStyle(containerRef.current);
      const topToBus = parseCssPx(computed.getPropertyValue("--top-to-bus"), 56);
      const lowerConnectorInset = parseCssPx(computed.getPropertyValue("--lower-connector-inset"), 8);

      const busY = topCluster.bottom - container.top + topToBus;

      const connectedBottomY = connectedTopAnchors.map((anchor) => (anchor as HTMLDivElement).getBoundingClientRect().bottom - container.top);
      const taps = [
        ...connectedTopAnchors.map((anchor) => {
          const rect = (anchor as HTMLDivElement).getBoundingClientRect();
          return rect.left - container.left + rect.width / 2;
        }),
        leftAnchor.left - container.left + leftAnchor.width / 2,
        rightAnchor.left - container.left + rightAnchor.width / 2,
      ];
      const busX1 = Math.min(...taps);
      const busX2 = Math.max(...taps);

      const lowerLeftAnchorY = leftAnchor.top - container.top + lowerConnectorInset;
      const lowerRightAnchorY = rightAnchor.top - container.top + lowerConnectorInset;

      setWire({
        width: container.width,
        height: container.height,
        busY,
        busX1,
        busX2,
        taps,
        connectedBottomY,
        leftTopY: lowerLeftAnchorY,
        rightTopY: lowerRightAnchorY,
        nodeX: node.left - container.left + node.width / 2,
      });
    };

    update();
    const observer = new ResizeObserver(update);
    if (containerRef.current) observer.observe(containerRef.current);
    if (topClusterRef.current) observer.observe(topClusterRef.current);
    if (bottomClusterRef.current) observer.observe(bottomClusterRef.current);
    TOP_TILES.forEach(({ key }) => {
      const slot = topSlotRefs.current[key];
      if (slot) observer.observe(slot);
    });
    if (dwellSlotRef.current) observer.observe(dwellSlotRef.current);
    if (dwellAnchorRef.current) observer.observe(dwellAnchorRef.current);
    if (leftRef.current) observer.observe(leftRef.current);
    if (leftAnchorRef.current) observer.observe(leftAnchorRef.current);
    if (nodeRef.current) observer.observe(nodeRef.current);
    window.addEventListener("resize", update);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [hasTopWidgets, dwellWidget, trafficWidget]);

  const hasKpis = hasTopWidgets && Boolean(dwellWidget);
  const hasError = manifestStatus === "error" || widgetStatus === "error";
  const nodeX = wire.nodeX || (wire.busX1 + (wire.busX2 - wire.busX1) / 2);

  // Keep the topology animation dash-only (no moving dot/arrow heads),
  // while preserving explicit per-route direction semantics.
  const flowRoutes = useMemo(() => ([
    {
      id: "entrances",
      d: `M ${nodeX} ${wire.busY} L ${wire.taps[0]} ${wire.busY} L ${wire.taps[0]} ${wire.connectedBottomY[0]}`,
      direction: "fromNode" as const,
    },
    {
      id: "occupancy",
      d: `M ${nodeX} ${wire.busY} L ${wire.taps[1]} ${wire.busY} L ${wire.taps[1]} ${wire.connectedBottomY[1]}`,
      direction: "fromNode" as const,
    },
    {
      id: "exits",
      d: `M ${nodeX} ${wire.busY} L ${wire.taps[2]} ${wire.busY} L ${wire.taps[2]} ${wire.connectedBottomY[2]}`,
      direction: "fromNode" as const,
    },
    {
      id: "traffic",
      d: `M ${nodeX} ${wire.busY} L ${wire.taps[3]} ${wire.busY} L ${wire.taps[3]} ${wire.leftTopY}`,
      direction: "fromNode" as const,
    },
    {
      id: "dwell",
      d: `M ${nodeX} ${wire.busY} L ${wire.taps[4]} ${wire.busY} L ${wire.taps[4]} ${wire.rightTopY}`,
      direction: "fromNode" as const,
    },
  ]), [nodeX, wire]);

  return (
    <section className={styles.preview} aria-label="System overview topology preview">
      <div className={styles.canvas} ref={containerRef}>
        {wire.width > 0 && wire.height > 0 ? (
          <svg className={styles.wireSvg} width={wire.width} height={wire.height} viewBox={`0 0 ${wire.width} ${wire.height}`} aria-hidden="true">
            <line className={styles.busLine} x1={wire.busX1} y1={wire.busY} x2={wire.busX2} y2={wire.busY} />
            <line className={styles.connectorLine} x1={wire.taps[0]} y1={wire.connectedBottomY[0]} x2={wire.taps[0]} y2={wire.busY} />
            <line className={styles.connectorLine} x1={wire.taps[1]} y1={wire.connectedBottomY[1]} x2={wire.taps[1]} y2={wire.busY} />
            <line className={styles.connectorLine} x1={wire.taps[2]} y1={wire.connectedBottomY[2]} x2={wire.taps[2]} y2={wire.busY} />
            <line className={styles.connectorLine} x1={wire.taps[3]} y1={wire.leftTopY} x2={wire.taps[3]} y2={wire.busY} />
            <line className={styles.connectorLine} x1={wire.taps[4]} y1={wire.rightTopY} x2={wire.taps[4]} y2={wire.busY} />
            {flowRoutes.map((route) => (
              <path
                key={route.id}
                className={`${styles.beamRoute} ${route.direction === "toNode" ? styles.beamToNode : styles.beamFromNode}`}
                d={route.d}
              />
            ))}
            {wire.taps.map((tap, index) => (
              <circle key={`tap-${index}`} className={styles.tapMark} cx={tap} cy={wire.busY} r="3" />
            ))}
          </svg>
        ) : null}

        <div className={styles.topCluster} ref={topClusterRef}>
          {hasKpis ? (
            topWidgets.map((item) => (
              <div
                key={item.widgetId}
                className={`${styles.kpiSlot} ${item.slotClass}`}
                ref={(node) => {
                  topSlotRefs.current[item.key] = node;
                }}
              >
                <div
                  className={styles.wireAnchor}
                  ref={(node) => {
                    topAnchorRefs.current[item.key] = node;
                  }}
                >
                  <DashboardKpiSection mode="preview" kpiWidgets={[item.widget!]} onRemoveWidget={NOOP_REMOVE} />
                </div>
              </div>
            ))
          ) : hasError ? (
            <div className={`${styles.inlineNotice} ${styles.topNotice}`}>Preview unavailable.</div>
          ) : (
            <div className={`${styles.inlineNotice} ${styles.topNotice}`}>Loading live KPI preview…</div>
          )}

          <article className={styles.capacityTile}>
            <p className={styles.capacityLabel}>Capacity</p>
            <div className={styles.capacityTrack}><div className={styles.capacityFill} style={{ width: `${CAPACITY_PERCENT}%` }} /></div>
            <p className={styles.capacityMeta}>{CAPACITY_PERCENT}% active capacity</p>
          </article>
        </div>

        <div className={styles.midZone}>
          <div className={styles.node} ref={nodeRef}>camOS<span className={styles.nodeSub}>System Sheet</span></div>
        </div>

        <div className={styles.bottomCluster} ref={bottomClusterRef}>
          <article className={styles.trafficTile} ref={leftRef}>
            {trafficWidget ? (
              <div className={styles.wireAnchor} ref={leftAnchorRef}>
                <DashboardKpiSection mode="preview" kpiWidgets={[trafficWidget]} onRemoveWidget={NOOP_REMOVE} />
              </div>
            ) : hasError ? (
              <div className={styles.inlineNotice}>Preview unavailable.</div>
            ) : (
              <div className={styles.inlineNotice}>Loading traffic KPI…</div>
            )}
          </article>

          <div className={`${styles.kpiSlot} ${styles.tileT5}`} ref={dwellSlotRef}>
            {dwellWidget ? (
              <div className={styles.wireAnchor} ref={dwellAnchorRef}>
                <DashboardKpiSection mode="preview" kpiWidgets={[dwellWidget]} onRemoveWidget={NOOP_REMOVE} />
              </div>
            ) : hasError ? (
              <div className={styles.inlineNotice}>Preview unavailable.</div>
            ) : (
              <div className={styles.inlineNotice}>Loading dwell KPI…</div>
            )}
          </div>
        </div>
      </div>
      {(manifestStatus === "error" || widgetStatus === "error") && (manifestError || widgetError) ? (
        <p className={styles.errorNote}>Preview unavailable.</p>
      ) : null}
    </section>
  );
};

const SystemOverviewPreview: React.FC = () => {
  const location = useLocation();
  const hasViewToken = Boolean(getViewTokenFromLocation(location.search));
  const isLoggedIn = typeof window !== "undefined" && Boolean(window.sessionStorage.getItem("camOS_credentials"));
  const [bootstrapState, setBootstrapState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const bootstrapStartedRef = useRef(false);

  const runBootstrap = async () => {
    if (isLoggedIn || hasViewToken || isDemoSessionActive()) {
      setBootstrapState("ready");
      return;
    }
    if (typeof window !== "undefined" && window.sessionStorage.getItem(LANDING_BOOTSTRAP_KEY) === "1") {
      setBootstrapState("ready");
      return;
    }

    setBootstrapState("loading");
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(LANDING_BOOTSTRAP_KEY, "1");
    }

    try {
      await enableDemoSession();
      applyDemoDefaultsOnce();
      setBootstrapState("ready");
    } catch {
      setBootstrapState("error");
    }
  };

  useEffect(() => {
    if (bootstrapStartedRef.current) {
      return;
    }
    bootstrapStartedRef.current = true;
    void runBootstrap();
  }, [hasViewToken, isLoggedIn]);

  const handleRetry = () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(LANDING_BOOTSTRAP_KEY);
    }
    bootstrapStartedRef.current = false;
    setBootstrapState("idle");
  };

  useEffect(() => {
    if (bootstrapState !== "idle") {
      return;
    }
    if (bootstrapStartedRef.current) {
      return;
    }
    bootstrapStartedRef.current = true;
    void runBootstrap();
  }, [bootstrapState]);

  if (bootstrapState === "loading") {
    return <section className={styles.preview}><div className={styles.inlineNotice}>Loading live KPI preview…</div></section>;
  }
  if (bootstrapState === "error") {
    return (
      <section className={styles.preview}>
        <div className={styles.inlineNotice}>
          <span>Preview unavailable.</span>
          <button type="button" className={styles.retryButton} onClick={handleRetry}>Retry</button>
        </div>
      </section>
    );
  }

  return <SystemOverviewLiveKpis />;
};

export default SystemOverviewPreview;
