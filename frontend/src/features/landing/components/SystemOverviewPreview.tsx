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
  nodeRadius: number;
  nodeHalfWidth: number;
  nodeHalfHeight: number;
  nodeCornerRadius: number;
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

type FlowRoute = RouteDefinition & {
  d: string;
  gradientId: string;
  nodeBoundaryX: number;
  nodeBoundaryY: number;
  nodeWindowRatio: number;
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
const PREVIEW_DEGRADED_PARAM = "previewDegraded";
const BUS_GAP_BELOW_TOP = 18;
const BUS_GAP_ABOVE_NODE = 28;
const BUS_CORRIDOR_GAP_TOP = 20;
const BUS_CORRIDOR_GAP_NODE = 52;
const BUS_BIAS_FROM_NODE = 10;
const NODE_WINDOW_MIN_PX = 80;
const NODE_WINDOW_MAX_PX = 140;
const NODE_WINDOW_RATIO_MIN = 0.18;
const NODE_WINDOW_RATIO_MAX = 0.42;
const ALPHA_BASE = 0.62;
const ALPHA_LIFT = 0.82;
const ALPHA_EDGE = 0.02;
const ALPHA_TRANSITION = 0.34;

const initialWireLayout: WireLayout = {
  width: 0,
  height: 0,
  busY: 0,
  busX1: 0,
  busX2: 0,
  nodeX: 0,
  nodeRadius: 0,
  nodeHalfWidth: 0,
  nodeHalfHeight: 0,
  nodeCornerRadius: 0,
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
  const capacityTileRef = useRef<HTMLElement | null>(null);
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
  const nodeShellRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
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
  const trafficUnavailable = !forceMockTopology && (!trafficWidget || trafficWidget.status === "error");

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
          !nodeShellRef.current ||
          !capacityTileRef.current
        ) {
          return;
        }

        const connectedTopEdges = CONNECTED_TOP_IDS.map((id) => topEdgeRefs.current[id]);
        if (connectedTopEdges.some((edge) => !edge) || !leftEdgeRef.current || !dwellEdgeRef.current) {
          return;
        }

        const topTileSlots = TOP_TILES.map(({ key }) => topSlotRefs.current[key]);
        if (topTileSlots.some((slot) => !slot)) {
          return;
        }

        const containerRect = containerRef.current.getBoundingClientRect();
        const nodeRect = nodeShellRef.current.getBoundingClientRect();
        const topRects = connectedTopEdges.map((edge) => (edge as HTMLSpanElement).getBoundingClientRect());
        const topTileRects = topTileSlots.map((slot) => (slot as HTMLDivElement).getBoundingClientRect());
        const trafficStemRect = trafficStemAnchorRef.current.getBoundingClientRect();
        const donutSectors = Array.from(leftSlotRef.current.querySelectorAll<SVGElement>("svg .recharts-sector"));
        const donutSectorRects = donutSectors.map((sector) => sector.getBoundingClientRect());
        const donutOuterTop = donutSectorRects.length > 0
          ? Math.min(...donutSectorRects.map((rect) => rect.top))
          : null;
        const donutOuterBottom = donutSectorRects.length > 0
          ? Math.max(...donutSectorRects.map((rect) => rect.bottom))
          : null;
        const donutOuterLeft = donutSectorRects.length > 0
          ? Math.min(...donutSectorRects.map((rect) => rect.left))
          : null;
        const donutOuterRight = donutSectorRects.length > 0
          ? Math.max(...donutSectorRects.map((rect) => rect.right))
          : null;
        const donutCenterX = donutOuterLeft != null && donutOuterRight != null
          ? ((donutOuterLeft + donutOuterRight) / 2)
          : null;
        const donutCenterY = donutOuterTop != null && donutOuterBottom != null
          ? ((donutOuterTop + donutOuterBottom) / 2)
          : null;
        const donutRadius = donutOuterLeft != null && donutOuterRight != null && donutOuterTop != null && donutOuterBottom != null
          ? (Math.min(donutOuterRight - donutOuterLeft, donutOuterBottom - donutOuterTop) / 2)
          : null;
        const donutNorthSurfaceY = donutCenterY != null && donutRadius != null
          ? (donutCenterY - donutRadius)
          : null;
        const dwellRect = dwellEdgeRef.current.getBoundingClientRect();

        const taps: Record<RouteId, number> = {
          entrances: topRects[0].left - containerRect.left + topRects[0].width / 2,
          occupancy: topRects[1].left - containerRect.left + topRects[1].width / 2,
          exits: topRects[2].left - containerRect.left + topRects[2].width / 2,
          traffic: donutCenterX != null
            ? donutCenterX - containerRect.left
            : trafficStemRect.left - containerRect.left + trafficStemRect.width / 2,
          dwell: dwellRect.left - containerRect.left + dwellRect.width / 2,
        };

        const capacityRect = capacityTileRef.current.getBoundingClientRect();
        const topBandBottom = Math.max(
          ...topTileRects.map((rect) => rect.bottom - containerRect.top),
          capacityRect.bottom - containerRect.top,
        );
        const nodeBandTop = nodeRect.top - containerRect.top;
        const minBusY = topBandBottom + BUS_CORRIDOR_GAP_TOP;
        const maxBusY = nodeBandTop - BUS_CORRIDOR_GAP_NODE;

        if (maxBusY <= minBusY) {
          console.error("Topology bus corridor collapsed", {
            minBusY,
            maxBusY,
            topBandBottom,
            nodeBandTop,
          });
          return;
        }

        const preferredBusY = Math.min(
          topBandBottom + BUS_GAP_BELOW_TOP + BUS_CORRIDOR_GAP_TOP,
          nodeBandTop - BUS_GAP_ABOVE_NODE - BUS_BIAS_FROM_NODE,
        );
        const busY = Math.max(minBusY, Math.min(preferredBusY, maxBusY));

        setWire({
          width: containerRect.width,
          height: containerRect.height,
          busY,
          busX1: Math.min(...Object.values(taps)),
          busX2: Math.max(...Object.values(taps)),
          nodeX: nodeRect.left - containerRect.left + nodeRect.width / 2,
          nodeRadius: Math.max(0, (Math.min(nodeRect.width, nodeRect.height) / 2) - 1),
          nodeHalfWidth: nodeRect.width / 2,
          nodeHalfHeight: nodeRect.height / 2,
          nodeCornerRadius: Math.max(0, Number.parseFloat(window.getComputedStyle(nodeShellRef.current).borderTopLeftRadius) || 0),
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
          trafficSocketY: donutNorthSurfaceY != null
            ? donutNorthSurfaceY - containerRect.top
            : trafficStemRect.top - containerRect.top,
        });
      });
    };

    scheduleMeasure();

    const observer = new ResizeObserver(() => scheduleMeasure());
    if (containerRef.current) observer.observe(containerRef.current);
    if (topClusterRef.current) observer.observe(topClusterRef.current);
    if (bottomClusterRef.current) observer.observe(bottomClusterRef.current);
    if (nodeShellRef.current) observer.observe(nodeShellRef.current);
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

    const mutationObserver = new MutationObserver(() => scheduleMeasure());
    if (leftSlotRef.current) {
      mutationObserver.observe(leftSlotRef.current, {
        childList: true,
        subtree: true,
        attributes: true,
      });
    }

    window.addEventListener("resize", scheduleMeasure);

    return () => {
      mutationObserver.disconnect();
      observer.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [forceMockTopology, hasTopWidgets, dwellWidget, trafficWidget , widgetStatus]);

  const nodeLayerStyle = {
    "--node-anchor-x": wire.nodeX > 0 ? `${wire.nodeX}px` : "50%",
    "--node-anchor-y": wire.busY > 0 ? `${wire.busY}px` : "50%",
  } as React.CSSProperties;

  const nodeX = wire.nodeX || (wire.busX1 + (wire.busX2 - wire.busX1) / 2);
  const nodeRadius = wire.nodeRadius || 0;
  const flowRoutes = useMemo(
    () => {
      const projectToNodeBoundary = (towardX: number, towardY: number) => {
        const dx = towardX - nodeX;
        const dy = towardY - wire.busY;
        const len = Math.hypot(dx, dy);
        if (len <= 0) {
          return { x: nodeX, y: wire.busY };
        }

        const ux = dx / len;
        const uy = dy / len;
        const halfWidth = Math.max(0, wire.nodeHalfWidth - 1);
        const halfHeight = Math.max(0, wire.nodeHalfHeight - 1);
        const maxCornerRadius = Math.max(0, Math.min(halfWidth, halfHeight));
        const cornerRadius = Math.max(0, Math.min(wire.nodeCornerRadius, maxCornerRadius));

        if (halfWidth <= 0 || halfHeight <= 0 || cornerRadius <= 0) {
          return {
            x: nodeX + ux * nodeRadius,
            y: wire.busY + uy * nodeRadius,
          };
        }

        const coreHalfWidth = Math.max(0, halfWidth - cornerRadius);
        const coreHalfHeight = Math.max(0, halfHeight - cornerRadius);
        const rectScale = 1 / Math.max(Math.abs(ux) / halfWidth, Math.abs(uy) / halfHeight);
        const rectX = ux * rectScale;
        const rectY = uy * rectScale;

        if (Math.abs(rectX) <= coreHalfWidth || Math.abs(rectY) <= coreHalfHeight) {
          return { x: nodeX + rectX, y: wire.busY + rectY };
        }

        const cornerCenterX = (rectX >= 0 ? 1 : -1) * coreHalfWidth;
        const cornerCenterY = (rectY >= 0 ? 1 : -1) * coreHalfHeight;
        const proj = ux * cornerCenterX + uy * cornerCenterY;
        const centerLenSq = (cornerCenterX * cornerCenterX) + (cornerCenterY * cornerCenterY);
        const radicand = Math.max(0, (proj * proj) - (centerLenSq - (cornerRadius * cornerRadius)));
        const arcDistance = proj + Math.sqrt(radicand);

        return {
          x: nodeX + ux * arcDistance,
          y: wire.busY + uy * arcDistance,
        };
      };

      return FLOW_ROUTE_DEFINITIONS.map((route): FlowRoute => {
        const tapX = wire.taps[route.id];
        const endpointY = wire.endpointsY[route.id];
        const isToNode = route.direction === "toNode";
        const nodeBoundaryPoint = projectToNodeBoundary(tapX, wire.busY);
        const sourceX = isToNode ? tapX : nodeBoundaryPoint.x;
        const sourceY = isToNode ? endpointY : nodeBoundaryPoint.y;
        const targetX = isToNode ? nodeBoundaryPoint.x : tapX;
        const targetY = route.id === "traffic"
          ? wire.trafficSocketY
          : isToNode
            ? nodeBoundaryPoint.y
            : endpointY;
        const segmentA = Math.hypot(tapX - sourceX, wire.busY - sourceY);
        const segmentB = Math.hypot(targetX - tapX, targetY - wire.busY);
        const totalLength = segmentA + segmentB;
        const windowPxTarget = Math.max(
          NODE_WINDOW_MIN_PX,
          Math.min(NODE_WINDOW_MAX_PX, totalLength * 0.3),
        );
        const nodeWindowRatio = totalLength > 0
          ? Math.max(
            NODE_WINDOW_RATIO_MIN,
            Math.min(NODE_WINDOW_RATIO_MAX, windowPxTarget / totalLength),
          )
          : NODE_WINDOW_RATIO_MAX;
        return {
          ...route,
          d: `M ${sourceX} ${sourceY} L ${tapX} ${wire.busY} L ${targetX} ${targetY}`,
          gradientId: `topology-gradient-${route.id}`,
          nodeBoundaryX: nodeBoundaryPoint.x,
          nodeBoundaryY: nodeBoundaryPoint.y,
          nodeWindowRatio,
        };
      });
    },
    [nodeRadius, nodeX, wire],
  );

  const topologyBranch = forceMockTopology
    ? "mock"
    : hasError
      ? "unavailable"
      : hasKpis
        ? "live"
        : "loading";

  const renderMockTile = (label: string, value: string) => (
    <article className={styles.mockTile}>
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );

  return (
    <section className={styles.preview} aria-label="System overview topology preview" data-preview-topology-branch={topologyBranch}>
      <div className={styles.consoleSurface}>
        <div className={styles.gatedContent}>
          <div className={styles.canvas} ref={containerRef} data-topology-mock={forceMockTopology ? "true" : "false"} data-preview-topology-branch={topologyBranch}>
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
                <defs>
                  {flowRoutes.map((route) => {
                    const isToNode = route.direction === "toNode";
                    const x1 = isToNode ? wire.taps[route.id] : route.nodeBoundaryX;
                    const y1 = isToNode ? wire.busY : route.nodeBoundaryY;
                    const x2 = isToNode ? route.nodeBoundaryX : wire.taps[route.id];
                    const y2 = isToNode ? route.nodeBoundaryY : wire.busY;
                    const windowPct = Math.max(0, Math.min(100, route.nodeWindowRatio * 100));
                    const shoulderPct = Math.max(0, Math.min(100, windowPct * 0.60));
                    const corePct = Math.max(0, Math.min(100, windowPct * 0.32));
                    const inboundWindowStartPct = Math.max(0, 100 - windowPct);
                    const inboundShoulderPct = Math.max(0, 100 - shoulderPct);
                    const inboundCorePct = Math.max(0, 100 - corePct);
                    return (
                      <linearGradient key={route.gradientId} id={route.gradientId} gradientUnits="userSpaceOnUse" x1={x1} y1={y1} x2={x2} y2={y2}>
                        {isToNode ? (
                          <>
                            <stop offset="0%" stopColor={`rgba(136, 188, 252, ${ALPHA_BASE})`} />
                            <stop offset={`${inboundWindowStartPct.toFixed(2)}%`} stopColor={`rgba(136, 188, 252, ${ALPHA_BASE})`} />
                            <stop offset={`${inboundShoulderPct.toFixed(2)}%`} stopColor={`rgba(136, 188, 252, ${ALPHA_LIFT})`} />
                            <stop offset={`${inboundCorePct.toFixed(2)}%`} stopColor={`rgba(136, 188, 252, ${ALPHA_TRANSITION})`} />
                            <stop offset="100%" stopColor={`rgba(136, 188, 252, ${ALPHA_EDGE})`} />
                          </>
                        ) : (
                          <>
                            <stop offset="0%" stopColor={`rgba(136, 188, 252, ${ALPHA_EDGE})`} />
                            <stop offset={`${corePct.toFixed(2)}%`} stopColor={`rgba(136, 188, 252, ${ALPHA_TRANSITION})`} />
                            <stop offset={`${shoulderPct.toFixed(2)}%`} stopColor={`rgba(136, 188, 252, ${ALPHA_LIFT})`} />
                            <stop offset={`${windowPct.toFixed(2)}%`} stopColor={`rgba(136, 188, 252, ${ALPHA_BASE})`} />
                            <stop offset="100%" stopColor={`rgba(136, 188, 252, ${ALPHA_BASE})`} />
                          </>
                        )}
                      </linearGradient>
                    );
                  })}
                </defs>
                {flowRoutes.map((route) => (
                  <path
                    key={route.id}
                    data-route-id={route.id}
                    data-direction={route.direction}
                    className={`${styles.beamRoute} ${route.direction === "toNode" ? styles.beamRouteToNode : ""} beamRoute`}
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

              <article className={styles.capacityTile} data-testid="capacity-module" ref={capacityTileRef}>
                <div className={styles.capacityHeaderRow}>
                  <p className={styles.capacityLabel}>Capacity</p>
                  <p className={styles.capacityValue}>{CAPACITY_PERCENT}%</p>
                </div>
                <div className={styles.capacityTrack}><div className={styles.capacityFill} style={{ width: `${CAPACITY_PERCENT}%` }} /></div>
              </article>
            </div>


            <div className={styles.bottomCluster} ref={bottomClusterRef}>
              <article className={styles.trafficTile} data-testid="traffic-split-module">
                {trafficUnavailable ? (
                  <div className={styles.inlineNotice} data-testid="traffic-split-error">Traffic Split data unavailable.</div>
                ) : (
                  <div className={styles.wireAnchorSlot} ref={leftSlotRef}>
                    <span className={styles.trafficStemAnchor} ref={trafficStemAnchorRef} aria-hidden="true" />
                    {forceMockTopology
                      ? renderMockTile("Traffic Split", "48 / 32 / 20")
                      : <DashboardKpiSection mode="preview" kpiWidgets={[trafficWidget!]} onRemoveWidget={NOOP_REMOVE} />}
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
        </div>

        <div className={styles.veilLayer} aria-hidden="true" />

        <div className={styles.nodeLayer} style={nodeLayerStyle}>
          <div className={styles.midZone}>
            <div className={styles.nodeMeasureGhost} ref={nodeShellRef} aria-hidden="true" />
          </div>
          <div className={styles.nodeStack}>
            <div className={styles.node}>
              <span className={styles.nodeTitle}>camOS</span>
              <button
                type="button"
                className={styles.previewNodeCta}
                data-testid="preview-enter-demo-cta"
                onClick={onAccessDemo}
              >
                View Demo
              </button>
              <span className={styles.nodeAnchor} ref={nodeAnchorRef} />
            </div>
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
  const forceDegradedPreview = useMemo(() => {
    if (!import.meta.env.DEV && !import.meta.env.MODE.includes("test")) {
      return false;
    }
    return new URLSearchParams(location.search).get(PREVIEW_DEGRADED_PARAM) === "1";
  }, [location.search]);
  const isLoggedIn = typeof window !== "undefined" && Boolean(window.sessionStorage.getItem("camOS_credentials"));
  const [bootstrapState, setBootstrapState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [bootstrapDegraded, setBootstrapDegraded] = useState(false);
  const bootstrapStartedRef = useRef(false);

  const runBootstrap = async () => {
    if (forceDegradedPreview) {
      setBootstrapDegraded(true);
      setBootstrapState("ready");
      return;
    }
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
    } catch (error) {
      console.warn("Landing demo bootstrap failed; continuing with live preview pipeline.", error);
      setBootstrapDegraded(true);
      setBootstrapState("ready");
    }
  };

  useEffect(() => {
    if (bootstrapStartedRef.current) {
      return;
    }
    bootstrapStartedRef.current = true;
    void runBootstrap();
  }, [hasViewToken, isLoggedIn, forceMockTopology, forceDegradedPreview]);

  const handleRetry = () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(LANDING_BOOTSTRAP_KEY);
    }
    bootstrapStartedRef.current = false;
    setBootstrapDegraded(false);
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
    return <section className={styles.preview} data-preview-bootstrap-branch="loading"><div className={styles.inlineNotice}>Loading live KPI preview…</div></section>;
  }
  if (bootstrapState === "error") {
    return (
      <section className={styles.preview} data-preview-bootstrap-branch="error">
        <div className={styles.inlineNotice}>
          <span>Preview unavailable.</span>
          <button type="button" className={styles.retryButton} onClick={handleRetry}>Retry</button>
        </div>
      </section>
    );
  }

  const bootstrapBranch = forceMockTopology
    ? "mock"
    : bootstrapDegraded
      ? "degraded"
      : (isLoggedIn || hasViewToken || isDemoSessionActive())
        ? "live-equivalent"
        : "default";

  return (
    <div data-preview-bootstrap-branch={bootstrapBranch}>
      <SystemOverviewLiveKpis forceMockTopology={forceMockTopology} onAccessDemo={onAccessDemo} />
      {bootstrapDegraded ? <p className={styles.errorNote}>Demo bootstrap unavailable; preview is using direct live data flow.</p> : null}
    </div>
  );
};

export default SystemOverviewPreview;
