import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import type { Credentials } from "../../../types/credentials";
import { getViewTokenFromLocation } from "../../../lib/viewToken";
import { isDemoSessionActive } from "../../../lib/demoSession";
import { useDashboardManifest } from "../../dashboard/hooks/useDashboardManifest";
import { useDashboardWidgets } from "../../dashboard/hooks/useDashboardWidgets";
import { VRM_KPI_IDS } from "../../dashboard/utils/applyVRMOverrides";
import DashboardKpiSection from "../../dashboard/components/DashboardKpiSection";
import camOSLogo from "../../../assets/Untitled design (4).svg";
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
const TOPOLOGY_MOCK_PARAM = "topologyMock";
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


const SystemOverviewLiveKpis: React.FC<{ forceMockTopology: boolean; onAccessDemo: () => void; previewOrgId?: string }> = ({ forceMockTopology, onAccessDemo, previewOrgId }) => {
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
  const topDockRefs = useRef<Record<TopTileId, HTMLDivElement | null>>({
    entrances: null,
    occupancy: null,
    exits: null,
    footfall: null,
  });
  const leftSlotRef = useRef<HTMLDivElement | null>(null);
  const trafficDockRef = useRef<HTMLDivElement | null>(null);
  const dwellSlotRef = useRef<HTMLDivElement | null>(null);
  const dwellDockRef = useRef<HTMLDivElement | null>(null);
  const nodeAnchorRef = useRef<HTMLSpanElement | null>(null);
  const nodeShellRef = useRef<HTMLDivElement | null>(null);
  const wireSvgRef = useRef<SVGSVGElement | null>(null);
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
  } = useDashboardManifest({ credentials: PREVIEW_CREDENTIALS, orgIdOverride: previewOrgId });

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

  const renderMockTrafficSplit = () => (
    <article className={`${styles.mockTile} ${styles.mockTrafficTile}`}>
      <p>Traffic Split</p>
      <div className={styles.mockTrafficContent}>
        <div className={styles.mockTrafficDonut} aria-hidden="true" />
        <div className={styles.mockTrafficLegend}>
          <span><i className={styles.mockTrafficSwatchA} />Cam 1 <strong>48%</strong></span>
          <span><i className={styles.mockTrafficSwatchB} />Cam 2 <strong>32%</strong></span>
          <span><i className={styles.mockTrafficSwatchC} />Cam 3 <strong>20%</strong></span>
        </div>
      </div>
    </article>
  );


  useLayoutEffect(() => {
    const getSurfaceRect = (dockHost: HTMLElement | null): DOMRect | null => {
      if (!dockHost) {
        return null;
      }
      const surface = dockHost.querySelector<HTMLElement>(".kpi-panel, .mockTile, .inlineNotice");
      return (surface ?? dockHost).getBoundingClientRect();
    };

    const getDonutNorthInCanvas = (slotHost: HTMLElement, toCanvasPoint: (x: number, y: number) => { x: number; y: number }) => {
      const sectorPaths = Array.from(slotHost.querySelectorAll<SVGPathElement>("svg .recharts-sector"));
      if (sectorPaths.length === 0) {
        return null;
      }

      let bestX = 0;
      let bestY = Number.POSITIVE_INFINITY;
      let found = false;

      sectorPaths.forEach((path) => {
        const ctm = path.getScreenCTM();
        if (!ctm) {
          return;
        }
        const total = path.getTotalLength();
        const steps = Math.max(48, Math.ceil(total / 2));
        for (let i = 0; i <= steps; i += 1) {
          const point = path.getPointAtLength((total * i) / steps);
          const screen = new DOMPoint(point.x, point.y).matrixTransform(ctm);
          if (!found || screen.y < bestY) {
            found = true;
            bestX = screen.x;
            bestY = screen.y;
          }
        }
      });

      if (!found) {
        return null;
      }
      return toCanvasPoint(bestX, bestY);
    };

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
          !nodeShellRef.current ||
          !capacityTileRef.current
        ) {
          return;
        }

        const containerEl = containerRef.current;
        const containerRect = containerEl.getBoundingClientRect();
        const localWidth = containerEl.clientWidth || containerRect.width;
        const localHeight = containerEl.clientHeight || containerRect.height;
        const scaleX = containerRect.width > 0 ? containerRect.width / localWidth : 1;
        const scaleY = containerRect.height > 0 ? containerRect.height / localHeight : 1;

        const toLocalRect = (el: Element) => {
          const rect = el.getBoundingClientRect();
          return {
            left: (rect.left - containerRect.left) / scaleX,
            right: (rect.right - containerRect.left) / scaleX,
            top: (rect.top - containerRect.top) / scaleY,
            bottom: (rect.bottom - containerRect.top) / scaleY,
            width: rect.width / scaleX,
            height: rect.height / scaleY,
          };
        };

        const isMobilePortrait = window.matchMedia("(max-width: 767px) and (orientation: portrait)").matches;
        const busGapBelowTop = isMobilePortrait ? 20 : BUS_GAP_BELOW_TOP;
        const busGapAboveNode = isMobilePortrait ? 56 : BUS_GAP_ABOVE_NODE;
        const busCorridorGapTop = isMobilePortrait ? 26 : BUS_CORRIDOR_GAP_TOP;
        const busCorridorGapNode = isMobilePortrait ? 104 : BUS_CORRIDOR_GAP_NODE;
        const busBiasFromNode = isMobilePortrait ? 14 : BUS_BIAS_FROM_NODE;

        const nodeRect = toLocalRect(nodeShellRef.current);
        const topTileSlots = TOP_TILES.map(({ key }) => topSlotRefs.current[key]);
        if (topTileSlots.some((slot) => !slot)) {
          return;
        }

        const topTileRects = topTileSlots.map((slot) => toLocalRect(slot as HTMLDivElement));
        const capacityRect = toLocalRect(capacityTileRef.current);

        const topBandBottom = Math.max(
          ...topTileRects.map((rect) => rect.bottom),
          capacityRect.bottom,
        );
        const nodeBandTop = nodeRect.top;
        const minBusY = topBandBottom + busCorridorGapTop;
        const maxBusY = nodeBandTop - busCorridorGapNode;

        const preferredBusY = Math.min(
          topBandBottom + busGapBelowTop + busCorridorGapTop,
          nodeBandTop - busGapAboveNode - busBiasFromNode,
        );
        const busY = maxBusY <= minBusY
          ? ((topBandBottom + nodeBandTop) / 2)
          : Math.max(minBusY, Math.min(preferredBusY, maxBusY));

        const baseWire: Partial<WireLayout> = {
          width: localWidth,
          height: localHeight,
          busY,
          nodeX: nodeRect.left + (nodeRect.width / 2),
          nodeRadius: Math.max(0, (Math.min(nodeRect.width, nodeRect.height) / 2) - 1),
          nodeHalfWidth: nodeRect.width / 2,
          nodeHalfHeight: nodeRect.height / 2,
          nodeCornerRadius: Math.max(0, Number.parseFloat(window.getComputedStyle(nodeShellRef.current).borderTopLeftRadius) || 0),
        };

        const connectedTopDocks = CONNECTED_TOP_IDS.map((id) => topDockRefs.current[id]);
        const hasRouteDocks = !connectedTopDocks.some((dock) => !dock) && Boolean(dwellDockRef.current);

        if (!hasRouteDocks) {
          setWire((prev) => ({
            ...prev,
            ...baseWire,
          }));
          return;
        }

        const toCanvasPoint = (screenX: number, screenY: number) => {
          const svg = wireSvgRef.current;
          const matrix = svg?.getScreenCTM();
          if (matrix) {
            const local = new DOMPoint(screenX, screenY).matrixTransform(matrix.inverse());
            return {
              x: local.x,
              y: local.y,
            };
          }
          return {
            x: (screenX - containerRect.left) / scaleX,
            y: (screenY - containerRect.top) / scaleY,
          };
        };

        const topPoints = connectedTopDocks.map((dock) => {
          const rect = getSurfaceRect(dock as HTMLDivElement);
          if (!rect) {
            return null;
          }
          return toCanvasPoint(rect.left + (rect.width / 2), rect.bottom);
        });
        if (topPoints.some((point) => !point)) {
          setWire((prev) => ({
            ...prev,
            ...baseWire,
          }));
          return;
        }

        const dwellRect = getSurfaceRect(dwellDockRef.current);
        if (!dwellRect) {
          setWire((prev) => ({
            ...prev,
            ...baseWire,
          }));
          return;
        }
        const dwellPoint = toCanvasPoint(dwellRect.left + (dwellRect.width / 2), dwellRect.top);

        const trafficFallbackRect = getSurfaceRect(trafficDockRef.current);
        const trafficFallbackPoint = trafficFallbackRect
          ? toCanvasPoint(trafficFallbackRect.left + (trafficFallbackRect.width / 2), trafficFallbackRect.top)
          : null;

        const trafficPoint = leftSlotRef.current
          ? (getDonutNorthInCanvas(leftSlotRef.current, toCanvasPoint) ?? trafficFallbackPoint)
          : trafficFallbackPoint;
        if (!trafficPoint) {
          setWire((prev) => ({
            ...prev,
            ...baseWire,
          }));
          return;
        }

        const taps: Record<RouteId, number> = {
          entrances: (topPoints[0] as { x: number; y: number }).x,
          occupancy: (topPoints[1] as { x: number; y: number }).x,
          exits: (topPoints[2] as { x: number; y: number }).x,
          traffic: trafficPoint.x,
          dwell: dwellPoint.x,
        };

        setWire((prev) => ({
          ...prev,
          ...baseWire,
          busX1: Math.min(...Object.values(taps)),
          busX2: Math.max(...Object.values(taps)),
          taps,
          endpointsY: {
            entrances: (topPoints[0] as { x: number; y: number }).y,
            occupancy: (topPoints[1] as { x: number; y: number }).y,
            exits: (topPoints[2] as { x: number; y: number }).y,
            traffic: trafficPoint.y,
            dwell: dwellPoint.y,
          },
          trafficTopY: leftSlotRef.current
            ? toLocalRect(leftSlotRef.current).top
            : prev.trafficTopY,
          trafficSocketX: trafficPoint.x,
          trafficSocketY: trafficPoint.y,
        }));
      });
    };

    scheduleMeasure();
    if (typeof document !== "undefined" && "fonts" in document) {
      void (document as Document & { fonts?: FontFaceSet }).fonts?.ready.then(() => scheduleMeasure());
    }

    const observer = new ResizeObserver(() => scheduleMeasure());
    if (containerRef.current) observer.observe(containerRef.current);
    if (topClusterRef.current) observer.observe(topClusterRef.current);
    if (bottomClusterRef.current) observer.observe(bottomClusterRef.current);
    if (nodeShellRef.current) observer.observe(nodeShellRef.current);
    if (nodeAnchorRef.current) observer.observe(nodeAnchorRef.current);
    TOP_TILES.forEach(({ key }) => {
      const slot = topSlotRefs.current[key];
      const dock = topDockRefs.current[key];
      if (slot) observer.observe(slot);
      if (dock) observer.observe(dock);
    });
    if (leftSlotRef.current) observer.observe(leftSlotRef.current);
    if (trafficDockRef.current) observer.observe(trafficDockRef.current);
    if (dwellSlotRef.current) observer.observe(dwellSlotRef.current);
    if (dwellDockRef.current) observer.observe(dwellDockRef.current);

    const mutationObserver = new MutationObserver(() => scheduleMeasure());
    if (leftSlotRef.current) {
      mutationObserver.observe(leftSlotRef.current, {
        childList: true,
        subtree: true,
        attributes: true,
      });
    }
    if (topClusterRef.current) {
      mutationObserver.observe(topClusterRef.current, {
        childList: true,
        subtree: true,
        attributes: true,
      });
    }
    if (bottomClusterRef.current) {
      mutationObserver.observe(bottomClusterRef.current, {
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
  }, [forceMockTopology, hasTopWidgets, dwellWidget, trafficWidget, widgetStatus]);

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

  const renderMockTile = (label: string, value: string) => (
    <article className={styles.mockTile}>
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );

  return (
    <section className={styles.preview} aria-label="System overview topology preview">
      <div className={styles.consoleSurface}>
        <div className={styles.gatedContent}>
          <div className={styles.canvas} ref={containerRef} data-topology-mock={forceMockTopology ? "true" : "false"}>
            {wire.width > 0 && wire.height > 0 ? (
              <svg ref={wireSvgRef} className={styles.wireSvg} width={wire.width} height={wire.height} viewBox={`0 0 ${wire.width} ${wire.height}`} aria-hidden="true">
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
                            <stop offset="0%" stopColor={`rgba(184, 138, 47, ${ALPHA_BASE})`} />
                            <stop offset={`${inboundWindowStartPct.toFixed(2)}%`} stopColor={`rgba(184, 138, 47, ${ALPHA_BASE})`} />
                            <stop offset={`${inboundShoulderPct.toFixed(2)}%`} stopColor={`rgba(184, 138, 47, ${ALPHA_LIFT})`} />
                            <stop offset={`${inboundCorePct.toFixed(2)}%`} stopColor={`rgba(184, 138, 47, ${ALPHA_TRANSITION})`} />
                            <stop offset="100%" stopColor={`rgba(184, 138, 47, ${ALPHA_EDGE})`} />
                          </>
                        ) : (
                          <>
                            <stop offset="0%" stopColor={`rgba(184, 138, 47, ${ALPHA_EDGE})`} />
                            <stop offset={`${corePct.toFixed(2)}%`} stopColor={`rgba(184, 138, 47, ${ALPHA_TRANSITION})`} />
                            <stop offset={`${shoulderPct.toFixed(2)}%`} stopColor={`rgba(184, 138, 47, ${ALPHA_LIFT})`} />
                            <stop offset={`${windowPct.toFixed(2)}%`} stopColor={`rgba(184, 138, 47, ${ALPHA_BASE})`} />
                            <stop offset="100%" stopColor={`rgba(184, 138, 47, ${ALPHA_BASE})`} />
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
                      <div
                        className={styles.dockSurface}
                        ref={(node) => {
                          topDockRefs.current[item.key] = node;
                        }}
                      >
                        {forceMockTopology
                          ? renderMockTile(item.key, item.key === "occupancy" ? "67%" : "2,481")
                          : <DashboardKpiSection mode="preview" kpiWidgets={[item.widget!]} onRemoveWidget={NOOP_REMOVE} />}
                      </div>
                      <span
                        className={`${styles.wireEdgeAnchor} ${styles.wireEdgeAnchorBottom}`}
                        data-anchor-id={`top-${item.key}`}
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
                    <div className={styles.dockSurface} ref={trafficDockRef}>
                      {forceMockTopology
                        ? renderMockTrafficSplit()
                        : (
                          <DashboardKpiSection
                            mode="preview"
                            kpiWidgets={[trafficWidget!]}
                            onRemoveWidget={NOOP_REMOVE}
                            rendererClassName="dashboard-v2__kpi-renderer--landing-preview-traffic"
                          />
                        )}
                    </div>
                    <span className={`${styles.wireEdgeAnchor} ${styles.wireEdgeAnchorTop}`} data-anchor-id="bottom-traffic" />
                  </div>
                )}
              </article>

              <div className={`${styles.kpiSlot} ${styles.tileT5}`}>
                {dwellWidget || forceMockTopology ? (
                  <div className={styles.wireAnchorSlot} ref={dwellSlotRef}>
                    <div className={styles.dockSurface} ref={dwellDockRef}>
                      {forceMockTopology
                        ? renderMockTile("Dwell Minutes", "18.2")
                        : <DashboardKpiSection mode="preview" kpiWidgets={[dwellWidget!]} onRemoveWidget={NOOP_REMOVE} />}
                    </div>
                    <span className={`${styles.wireEdgeAnchor} ${styles.wireEdgeAnchorTop}`} data-anchor-id="bottom-dwell" />
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
              <img src={camOSLogo} alt="camOS Logo" className={styles.nodeLogo} />
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
      {!forceMockTopology && (manifestStatus === "error" || widgetStatus === "error") && (manifestError || widgetError) ? (
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
  const shouldUsePublicPreviewOrg = !hasViewToken && !isDemoSessionActive();
  const [bootstrapState, setBootstrapState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [bootstrapDegraded, setBootstrapDegraded] = useState(false);
  const bootstrapStartedRef = useRef(false);

  const runBootstrap = async () => {
    if (forceMockTopology || hasViewToken || isDemoSessionActive() || shouldUsePublicPreviewOrg) {
      setBootstrapState("ready");
      return;
    }

    setBootstrapState("loading");
    setBootstrapState("ready");
  };

  useEffect(() => {
    if (bootstrapStartedRef.current) {
      return;
    }
    bootstrapStartedRef.current = true;
    void runBootstrap();
  }, [hasViewToken, forceMockTopology, shouldUsePublicPreviewOrg]);

  const handleRetry = () => {
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

  return (
    <>
      <SystemOverviewLiveKpis
        forceMockTopology={forceMockTopology}
        onAccessDemo={onAccessDemo}
        previewOrgId={shouldUsePublicPreviewOrg ? "client1" : undefined}
      />
      {bootstrapDegraded ? <p className={styles.errorNote}>Demo bootstrap unavailable; preview is using direct live data flow.</p> : null}
    </>
  );
};

export default SystemOverviewPreview;
