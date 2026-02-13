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

type Segment = {
  label: string;
  value: number;
  color: string;
};

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
};

const TRAFFIC_PIE: Segment[] = [
  { label: "North", value: 42, color: "color-mix(in srgb, var(--sys-accent) 60%, white 8%)" },
  { label: "South", value: 33, color: "color-mix(in srgb, var(--sys-accent) 44%, var(--sys-text-2) 56%)" },
  { label: "East", value: 25, color: "color-mix(in srgb, var(--sys-accent) 26%, var(--sys-text-3) 74%)" },
];

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
};

const pieArcs = (segments: Segment[]) => {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const radius = 33;
  const cx = 50;
  const cy = 50;
  let acc = -Math.PI / 2;

  return segments.map((segment) => {
    const angle = (segment.value / total) * Math.PI * 2;
    const start = acc;
    const end = acc + angle;
    const x1 = cx + radius * Math.cos(start);
    const y1 = cy + radius * Math.sin(start);
    const x2 = cx + radius * Math.cos(end);
    const y2 = cy + radius * Math.sin(end);
    const large = angle > Math.PI ? 1 : 0;
    acc = end;
    return {
      d: `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`,
      label: segment.label,
      value: segment.value,
      color: segment.color,
    };
  });
};

const getKpiTileFromSlot = (slot: HTMLDivElement | null) =>
  slot?.querySelector<HTMLDivElement>(".dashboard-v2__kpi-tile") ?? null;

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
  const dwellSlotRef = useRef<HTMLDivElement | null>(null);
  const leftRef = useRef<HTMLDivElement | null>(null);
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

  useLayoutEffect(() => {
    const update = () => {
      if (
        !containerRef.current ||
        !topClusterRef.current ||
        !bottomClusterRef.current ||
        !leftRef.current ||
        !dwellSlotRef.current
      ) {
        return;
      }

      const topTilesById = Object.fromEntries(
        TOP_TILES.map(({ key }) => [key, getKpiTileFromSlot(topSlotRefs.current[key])]),
      ) as Record<TopTileId, HTMLDivElement | null>;
      const dwellTile = getKpiTileFromSlot(dwellSlotRef.current);

      const connectedTopTiles = CONNECTED_TOP_IDS.map((id) => topTilesById[id]);
      if (connectedTopTiles.some((tile) => !tile) || !dwellTile) {
        return;
      }

      const container = containerRef.current.getBoundingClientRect();
      const topCluster = topClusterRef.current.getBoundingClientRect();
      const bottomCluster = bottomClusterRef.current.getBoundingClientRect();
      const left = leftRef.current.getBoundingClientRect();
      const right = dwellTile.getBoundingClientRect();

      const busY = ((topCluster.bottom - container.top) + (bottomCluster.top - container.top)) / 2;
      const busX1 = 14;
      const busX2 = container.width - 14;

      const connectedBottomY = connectedTopTiles.map((tile) => (tile as HTMLDivElement).getBoundingClientRect().bottom - container.top);
      const taps = [
        ...connectedTopTiles.map((tile) => {
          const rect = (tile as HTMLDivElement).getBoundingClientRect();
          return rect.left - container.left + rect.width / 2;
        }),
        left.left - container.left + left.width / 2,
        right.left - container.left + right.width / 2,
      ];

      setWire({
        width: container.width,
        height: container.height,
        busY,
        busX1,
        busX2,
        taps,
        connectedBottomY,
        leftTopY: left.top - container.top,
        rightTopY: right.top - container.top,
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
    if (leftRef.current) observer.observe(leftRef.current);
    window.addEventListener("resize", update);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [hasTopWidgets, dwellWidget]);

  const arcs = useMemo(() => pieArcs(TRAFFIC_PIE), []);
  const hasKpis = hasTopWidgets && Boolean(dwellWidget);
  const hasError = manifestStatus === "error" || widgetStatus === "error";

  return (
    <section className={styles.preview} aria-label="System overview topology preview">
      <div className={styles.canvas} ref={containerRef}>
        {wire.width > 0 && wire.height > 0 ? (
          <svg className={styles.wireSvg} width={wire.width} height={wire.height} viewBox={`0 0 ${wire.width} ${wire.height}`} aria-hidden="true">
            <line className={styles.wireLine} x1={wire.busX1} y1={wire.busY} x2={wire.busX2} y2={wire.busY} />
            <line className={styles.wireLine} x1={wire.taps[0]} y1={wire.connectedBottomY[0]} x2={wire.taps[0]} y2={wire.busY} />
            <line className={styles.wireLine} x1={wire.taps[1]} y1={wire.connectedBottomY[1]} x2={wire.taps[1]} y2={wire.busY} />
            <line className={styles.wireLine} x1={wire.taps[2]} y1={wire.connectedBottomY[2]} x2={wire.taps[2]} y2={wire.busY} />
            <line className={styles.wireLine} x1={wire.taps[3]} y1={wire.leftTopY} x2={wire.taps[3]} y2={wire.busY} />
            <line className={styles.wireLine} x1={wire.taps[4]} y1={wire.busY} x2={wire.taps[4]} y2={wire.rightTopY} />
            {wire.taps.map((tap, index) => (
              <circle key={`tap-${index}`} className={styles.tapMark} cx={tap} cy={wire.busY} r="2" />
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
                <DashboardKpiSection mode="preview" kpiWidgets={[item.widget!]} onRemoveWidget={NOOP_REMOVE} />
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
          <div className={styles.node}>camOS<span className={styles.nodeSub}>System Sheet</span></div>
        </div>

        <div className={styles.bottomCluster} ref={bottomClusterRef}>
          <article className={styles.trafficTile} ref={leftRef}>
            <div className={styles.trafficTitle}>Traffic Distribution</div>
            <div className={styles.pieWrap}>
              <svg className={styles.pieSvg} viewBox="0 0 100 100" aria-hidden="true">
                {arcs.map((arc) => <path key={arc.label} d={arc.d} fill={arc.color} />)}
                <circle cx="50" cy="50" r="14" fill="color-mix(in srgb, var(--sys-bg-1) 90%, transparent)" />
              </svg>
            </div>
            <div className={styles.legend}>
              {arcs.map((arc) => (
                <div key={arc.label} className={styles.legendRow}>
                  <span className={styles.legendLabel}><span className={styles.legendSwatch} style={{ background: arc.color }} />{arc.label}</span>
                  <span>{arc.value}%</span>
                </div>
              ))}
            </div>
          </article>

          <div className={`${styles.kpiSlot} ${styles.tileT5}`} ref={dwellSlotRef}>
            {dwellWidget ? (
              <DashboardKpiSection mode="preview" kpiWidgets={[dwellWidget]} onRemoveWidget={NOOP_REMOVE} />
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
