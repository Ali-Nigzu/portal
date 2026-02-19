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
type RouteId = "entrances" | "occupancy" | "exits" | "traffic" | "dwell";
type FlowDirection = "toNode" | "fromNode";

type WireLayout = {
  width: number;
  height: number;
  busY: number;
  busX1: number;
  busX2: number;
  nodeX: number;
  taps: Record<RouteId, number>;
  endpointsY: Record<RouteId, number>;
  trafficTopY: number;
  trafficSocketX: number;
  trafficSocketY: number;
};

type RouteDefinition = {
  id: RouteId;
  direction: FlowDirection;
};

const TOP_TILES: Array<{ key: TopTileId; widgetId: string; slotClass: string }> = [
  { key: "entrances", widgetId: VRM_KPI_IDS.entrances, slotClass: styles.tileT1 },
  { key: "occupancy", widgetId: VRM_KPI_IDS.occupancy, slotClass: styles.tileT2 },
  { key: "exits", widgetId: VRM_KPI_IDS.exits, slotClass: styles.tileT3 },
  { key: "footfall", widgetId: VRM_KPI_IDS.footfall, slotClass: styles.tileT4 },
];

const CONNECTED_TOP_IDS: TopTileId[] = ["entrances", "occupancy", "exits"];
const FLOW_ROUTE_DEFINITIONS: RouteDefinition[] = [
  { id: "entrances", direction: "toNode" },
  { id: "occupancy", direction: "fromNode" },
  { id: "exits", direction: "toNode" },
  { id: "traffic", direction: "fromNode" },
  { id: "dwell", direction: "fromNode" },
];

const CAPACITY_PERCENT = 68;
const NOOP_REMOVE = () => undefined;
const PREVIEW_CREDENTIALS: Credentials = { username: "", password: "" };
const LANDING_BOOTSTRAP_KEY = "landing_demo_bootstrap_done";
const TOPOLOGY_MOCK_PARAM = "topologyMock";

const initialWireLayout: WireLayout = {
  width: 0,
  height: 0,
  busY: 0,
  busX1: 0,
  busX2: 0,
  nodeX: 0,
  taps: { entrances: 0, occupancy: 0, exits: 0, traffic: 0, dwell: 0 },
  endpointsY: { entrances: 0, occupancy: 0, exits: 0, traffic: 0, dwell: 0 },
  trafficTopY: 0,
  trafficSocketX: 0,
  trafficSocketY: 0,
};

const SystemOverviewLiveKpis: React.FC<{ forceMockTopology: boolean; onAccessDemo: () => void }> = ({ forceMockTopology, onAccessDemo }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const topClusterRef = useRef<HTMLDivElement | null>(null);
  const bottomClusterRef = useRef<HTMLDivElement | null>(null);
  const topSlotRefs = useRef<Record<TopTileId, HTMLDivElement | null>>({
    entrances: null,
    occupancy: null,
    exits: null,
    footfall: null,
  });
  const topEdgeRefs = useRef<Record<TopTileId, HTMLSpanElement | null>>({
    entrances: null,
    occupancy: null,
    exits: null,
    footfall: null,
  });
  const leftSlotRef = useRef<HTMLDivElement | null>(null);
  const leftEdgeRef = useRef<HTMLSpanElement | null>(null);
  const trafficStemAnchorRef = useRef<HTMLSpanElement | null>(null);
  const dwellSlotRef = useRef<HTMLDivElement | null>(null);
  const dwellEdgeRef = useRef<HTMLSpanElement | null>(null);
  const nodeAnchorRef = useRef<HTMLSpanElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [trafficRenderFailure, setTrafficRenderFailure] = useState(false);
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

  const kpiLookup = useMemo(() => new Map(kpiWidgets.map((item) => [item.widget.id, item])), [kpiWidgets]);

  const topWidgets = TOP_TILES.map((tile) => ({
    ...tile,
    widget: kpiLookup.get(tile.widgetId) ?? null,
  }));
  const hasTopWidgets = topWidgets.every((item) => Boolean(item.widget));
  const dwellWidget = kpiLookup.get(VRM_KPI_IDS.dwell) ?? null;
  const trafficWidget = kpiLookup.get(VRM_KPI_IDS.traffic) ?? null;
  const hasKpis = forceMockTopology || (hasTopWidgets && Boolean(dwellWidget));
  const hasError = manifestStatus === "error" || widgetStatus === "error";

  useLayoutEffect(() => {
    const scheduleMeasure = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (
          !containerRef.current ||
          !topClusterRef.current ||
          !bottomClusterRef.current ||
          !leftSlotRef.current ||
          !trafficStemAnchorRef.current ||
          !dwellSlotRef.current ||
          !nodeAnchorRef.current
        ) {
          return;
        }

        const connectedTopEdges = CONNECTED_TOP_IDS.map((id) => topEdgeRefs.current[id]);
        if (connectedTopEdges.some((edge) => !edge) || !leftEdgeRef.current || !dwellEdgeRef.current) {
          return;
        }

        const containerRect = containerRef.current.getBoundingClientRect();
        const nodeRect = nodeAnchorRef.current.getBoundingClientRect();
        const topRects = connectedTopEdges.map((edge) => (edge as HTMLSpanElement).getBoundingClientRect());
        const trafficStemRect = trafficStemAnchorRef.current.getBoundingClientRect();
        const donutSectorRects = Array.from(leftSlotRef.current.querySelectorAll("svg .recharts-sector")).map((sector) =>
          sector.getBoundingClientRect(),
        );
        const donutOuterTop = donutSectorRects.length > 0
          ? Math.min(...donutSectorRects.map((rect) => rect.top))
          : null;
        const donutCenterX = donutSectorRects.length > 0
          ? ((Math.min(...donutSectorRects.map((rect) => rect.left)) + Math.max(...donutSectorRects.map((rect) => rect.right))) / 2)
          : null;
        const dwellRect = dwellEdgeRef.current.getBoundingClientRect();

        const shouldFailTraffic = widgetStatus === "ready" && Boolean(trafficWidget) && donutSectorRects.length === 0;
        if (shouldFailTraffic !== trafficRenderFailure) {
          setTrafficRenderFailure(shouldFailTraffic);
        }

        const taps: Record<RouteId, number> = {
          entrances: topRects[0].left - containerRect.left + topRects[0].width / 2,
          occupancy: topRects[1].left - containerRect.left + topRects[1].width / 2,
          exits: topRects[2].left - containerRect.left + topRects[2].width / 2,
          traffic: donutCenterX != null
            ? donutCenterX - containerRect.left
            : trafficStemRect.left - containerRect.left + trafficStemRect.width / 2,
          dwell: dwellRect.left - containerRect.left + dwellRect.width / 2,
        };

        setWire({
          width: containerRect.width,
          height: containerRect.height,
          busY: nodeRect.top - containerRect.top + nodeRect.height / 2,
          busX1: Math.min(...Object.values(taps)),
          busX2: Math.max(...Object.values(taps)),
          nodeX: nodeRect.left - containerRect.left + nodeRect.width / 2,
          taps,
          endpointsY: {
            entrances: topRects[0].top - containerRect.top + topRects[0].height / 2,
            occupancy: topRects[1].top - containerRect.top + topRects[1].height / 2,
            exits: topRects[2].top - containerRect.top + topRects[2].height / 2,
            traffic: trafficStemRect.top - containerRect.top + trafficStemRect.height / 2,
            dwell: dwellRect.top - containerRect.top + dwellRect.height / 2,
          },
          trafficTopY: leftSlotRef.current.getBoundingClientRect().top - containerRect.top,
          trafficSocketX: donutCenterX != null
            ? donutCenterX - containerRect.left
            : trafficStemRect.left - containerRect.left + trafficStemRect.width / 2,
          trafficSocketY: donutOuterTop != null
            ? donutOuterTop - containerRect.top
            : trafficStemRect.top - containerRect.top,
        });
      });
    };

    scheduleMeasure();

    const observer = new ResizeObserver(() => scheduleMeasure());
    if (containerRef.current) observer.observe(containerRef.current);
    if (topClusterRef.current) observer.observe(topClusterRef.current);
    if (bottomClusterRef.current) observer.observe(bottomClusterRef.current);
    if (nodeAnchorRef.current) observer.observe(nodeAnchorRef.current);
    TOP_TILES.forEach(({ key }) => {
      const slot = topSlotRefs.current[key];
      const edge = topEdgeRefs.current[key];
      if (slot) observer.observe(slot);
      if (edge) observer.observe(edge);
    });
    if (leftSlotRef.current) observer.observe(leftSlotRef.current);
    if (leftEdgeRef.current) observer.observe(leftEdgeRef.current);
    if (dwellSlotRef.current) observer.observe(dwellSlotRef.current);
    if (dwellEdgeRef.current) observer.observe(dwellEdgeRef.current);

    window.addEventListener("resize", scheduleMeasure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [forceMockTopology, hasTopWidgets, dwellWidget, trafficWidget, trafficRenderFailure, widgetStatus]);

  const nodeX = wire.nodeX || (wire.busX1 + (wire.busX2 - wire.busX1) / 2);
  const flowRoutes = useMemo(
    () =>
      FLOW_ROUTE_DEFINITIONS.map((route) => {
        const tapX = wire.taps[route.id];
        const endpointY = wire.endpointsY[route.id];
        const isToNode = route.direction === "toNode";
        const sourceX = isToNode ? tapX : nodeX;
        const sourceY = isToNode ? endpointY : wire.busY;
        const targetX = isToNode ? nodeX : tapX;
        const targetY = isToNode ? wire.busY : endpointY;
        return {
          ...route,
          d: `M ${sourceX} ${sourceY} L ${tapX} ${wire.busY} L ${targetX} ${targetY}`,
          gradientId: `topology-gradient-${route.id}`,
        };
      }),
    [nodeX, wire],
  );

  const renderMockTile = (label: string, value: string) => (
    <article className={styles.mockTile}>
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );

  return (
    <section className={styles.preview} aria-label="System overview topology preview">
      <div className={styles.canvas} ref={containerRef} data-topology-mock={forceMockTopology ? "true" : "false"}>
        {wire.width > 0 && wire.height > 0 ? (
          <svg className={styles.wireSvg} width={wire.width} height={wire.height} viewBox={`0 0 ${wire.width} ${wire.height}`} aria-hidden="true">
            <line className={styles.busLine} data-testid="topology-bus" x1={wire.busX1} y1={wire.busY} x2={wire.busX2} y2={wire.busY} />
            {FLOW_ROUTE_DEFINITIONS.map((route) => (
              <line
                key={`connector-${route.id}`}
                className={styles.connectorLine}
                data-route-id={route.id}
                x1={wire.taps[route.id]}
                y1={wire.endpointsY[route.id]}
                x2={wire.taps[route.id]}
                y2={wire.busY}
              />
            ))}
            <line
              className={styles.nodeDropConnector}
              data-testid="traffic-node-drop-connector"
              x1={wire.trafficSocketX}
              y1={wire.endpointsY.traffic}
              x2={wire.trafficSocketX}
              y2={wire.trafficSocketY}
            />
            <path
              className={styles.trafficReceivePulse}
              data-testid="traffic-receive-pulse"
              d={`M ${wire.trafficSocketX} ${wire.trafficSocketY} A 12 12 0 0 1 ${wire.trafficSocketX + 10.5} ${wire.trafficSocketY + 5.3}`}
            />
            <defs>
              {flowRoutes.map((route) => {
                const isToNode = route.direction === "toNode";
                const x1 = isToNode ? wire.taps[route.id] : nodeX;
                const x2 = isToNode ? nodeX : wire.taps[route.id];
                return (
                  <linearGradient key={route.gradientId} id={route.gradientId} gradientUnits="userSpaceOnUse" x1={x1} y1={wire.busY} x2={x2} y2={wire.busY}>
                    <stop offset="0%" stopColor="rgba(136, 188, 252, 0.78)" />
                    <stop offset="58%" stopColor="rgba(97, 159, 236, 0.56)" />
                    <stop offset="100%" stopColor="rgba(136, 188, 252, 0.78)" />
                  </linearGradient>
                );
              })}
            </defs>
            {flowRoutes.map((route) => (
              <path
                key={route.id}
                data-route-id={route.id}
                data-direction={route.direction}
                className={styles.beamRoute}
                style={{ stroke: `url(#${route.gradientId})` }}
                d={route.d}
              />
            ))}
          </svg>
        ) : null}

        <div className={styles.topCluster} ref={topClusterRef}>
          {hasKpis ? (
            topWidgets.map((item) => (
              <div
                key={item.widgetId}
                className={`${styles.kpiSlot} ${item.slotClass}`}
                data-testid={item.key === "footfall" ? "footfall-module" : undefined}
                ref={(node) => {
                  topSlotRefs.current[item.key] = node;
                }}
              >
                <div className={styles.wireAnchorSlot}>
                  {forceMockTopology
                    ? renderMockTile(item.key, item.key === "occupancy" ? "67%" : "2,481")
                    : <DashboardKpiSection mode="preview" kpiWidgets={[item.widget!]} onRemoveWidget={NOOP_REMOVE} />}
                  <span
                    className={`${styles.wireEdgeAnchor} ${styles.wireEdgeAnchorBottom}`}
                    data-anchor-id={`top-${item.key}`}
                    ref={(node) => {
                      topEdgeRefs.current[item.key] = node;
                    }}
                  />
                </div>
              </div>
            ))
          ) : hasError ? (
            <div className={`${styles.inlineNotice} ${styles.topNotice}`}>Preview unavailable.</div>
          ) : (
            <div className={`${styles.inlineNotice} ${styles.topNotice}`}>Loading live KPI preview…</div>
          )}

          <article className={styles.capacityTile} data-testid="capacity-module">
            <div className={styles.capacityHeaderRow}>
              <p className={styles.capacityLabel}>Capacity</p>
              <p className={styles.capacityValue}>{CAPACITY_PERCENT}%</p>
            </div>
            <div className={styles.capacityTrack}><div className={styles.capacityFill} style={{ width: `${CAPACITY_PERCENT}%` }} /></div>
          </article>
        </div>

        <div className={styles.midZone}>
          <div className={styles.nodeStack}>
            <div className={styles.node}>camOS<span className={styles.nodeSub}>System Sheet</span><span className={styles.nodeAnchor} ref={nodeAnchorRef} /></div>
            <span className={styles.nodeCtaConnector} aria-hidden="true" />
            <button
              type="button"
              className={styles.previewNodeCta}
              data-testid="preview-enter-demo-cta"
              onClick={onAccessDemo}
            >
              <span className={styles.previewNodeCtaLabel}>Access Demo</span>
            </button>
          </div>
        </div>

        <div className={styles.bottomCluster} ref={bottomClusterRef}>
          <article className={styles.trafficTile} data-testid="traffic-split-module">
            {!trafficWidget || trafficRenderFailure || hasError ? (
              <div className={styles.inlineNotice} data-testid="traffic-split-error">Traffic Split data unavailable.</div>
            ) : (
              <div className={styles.wireAnchorSlot} ref={leftSlotRef}>
                <span className={styles.trafficStemAnchor} ref={trafficStemAnchorRef} aria-hidden="true" />
                <DashboardKpiSection mode="preview" kpiWidgets={[trafficWidget]} onRemoveWidget={NOOP_REMOVE} />
                <span className={styles.trafficTitleMask} aria-hidden="true">Traffic Split</span>
                <span className={`${styles.wireEdgeAnchor} ${styles.wireEdgeAnchorTop}`} data-anchor-id="bottom-traffic" ref={leftEdgeRef} />
              </div>
            )}
          </article>

          <div className={`${styles.kpiSlot} ${styles.tileT5}`}>
            {dwellWidget || forceMockTopology ? (
              <div className={styles.wireAnchorSlot} ref={dwellSlotRef}>
                {forceMockTopology
                  ? renderMockTile("Dwell Minutes", "18.2")
                  : <DashboardKpiSection mode="preview" kpiWidgets={[dwellWidget!]} onRemoveWidget={NOOP_REMOVE} />}
                <span className={`${styles.wireEdgeAnchor} ${styles.wireEdgeAnchorTop}`} data-anchor-id="bottom-dwell" ref={dwellEdgeRef} />
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

const SystemOverviewPreview: React.FC<{ onAccessDemo: () => void }> = ({ onAccessDemo }) => {
  const location = useLocation();
  const forceMockTopology = useMemo(() => {
    if (!import.meta.env.DEV && !import.meta.env.MODE.includes("test")) {
      return false;
    }
    return new URLSearchParams(location.search).get(TOPOLOGY_MOCK_PARAM) === "1";
  }, [location.search]);
  const hasViewToken = Boolean(getViewTokenFromLocation(location.search));
  const isLoggedIn = typeof window !== "undefined" && Boolean(window.sessionStorage.getItem("camOS_credentials"));
  const [bootstrapState, setBootstrapState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const bootstrapStartedRef = useRef(false);

  const runBootstrap = async () => {
    if (forceMockTopology || isLoggedIn || hasViewToken || isDemoSessionActive()) {
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
  }, [hasViewToken, isLoggedIn, forceMockTopology]);

  const handleRetry = () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(LANDING_BOOTSTRAP_KEY);
    }
    bootstrapStartedRef.current = false;
    setBootstrapState("idle");
  };

  useEffect(() => {
    if (bootstrapState !== "idle" || bootstrapStartedRef.current) {
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

  return <SystemOverviewLiveKpis forceMockTopology={forceMockTopology} onAccessDemo={onAccessDemo} />;
};

export default SystemOverviewPreview;
