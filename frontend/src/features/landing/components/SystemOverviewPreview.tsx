import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import styles from "./SystemOverviewPreview.module.css";

type Metric = {
  label: string;
  value: string;
  spark: number[];
};

type Segment = {
  label: string;
  value: number;
  color: string;
};

const METRICS_TOP: Metric[] = [
  { label: "Entrances", value: "12,480", spark: [12, 14, 13, 17, 19, 18, 20, 22, 21, 23] },
  { label: "Occupancy", value: "318", spark: [240, 252, 265, 280, 290, 304, 312, 320, 316, 318] },
  { label: "Exits", value: "11,906", spark: [10, 12, 13, 14, 16, 18, 19, 18, 20, 21] },
  { label: "Footfall", value: "24,386", spark: [19, 21, 23, 24, 25, 26, 29, 30, 31, 33] },
];

const DWELL_TILE: Metric = {
  label: "Dwell",
  value: "8m 42s",
  spark: [6.1, 6.4, 6.8, 7.2, 7.7, 8.1, 8.4, 8.6, 8.5, 8.7],
};

const TRAFFIC_PIE: Segment[] = [
  { label: "North", value: 42, color: "color-mix(in srgb, var(--sys-accent) 55%, white 12%)" },
  { label: "South", value: 33, color: "color-mix(in srgb, var(--sys-accent) 38%, var(--sys-text-2) 62%)" },
  { label: "East", value: 25, color: "color-mix(in srgb, var(--sys-accent) 22%, var(--sys-text-3) 78%)" },
];

const CAPACITY_PERCENT = 68;

const sparkPath = (points: number[], width = 220, height = 36) => {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = Math.max(max - min, 1);
  return points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - ((point - min) / span) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
};

const pieArcs = (segments: Segment[]) => {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  let acc = -Math.PI / 2;
  const radius = 54;
  const cx = 70;
  const cy = 70;

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
      color: segment.color,
      label: segment.label,
      value: segment.value,
    };
  });
};

const MetricTile = ({ metric }: { metric: Metric }) => (
  <article className={styles.metricTile}>
    <p className={styles.metricLabel}>{metric.label}</p>
    <p className={styles.metricValue}>{metric.value}</p>
    <svg className={styles.sparkline} viewBox="0 0 220 36" aria-hidden="true">
      <path d={sparkPath(metric.spark)} className={styles.sparklinePath} />
    </svg>
  </article>
);

const SystemOverviewPreview: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const topRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const leftRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);
  const [wire, setWire] = useState({ busY: 0, busX1: 24, busX2: 24, tapLX: 0, tapRX: 0, leftTop: 0, rightTop: 0 });

  useLayoutEffect(() => {
    const update = () => {
      if (!containerRef.current || !topRef.current || !bottomRef.current || !leftRef.current || !rightRef.current) {
        return;
      }

      const container = containerRef.current.getBoundingClientRect();
      const top = topRef.current.getBoundingClientRect();
      const bottom = bottomRef.current.getBoundingClientRect();
      const left = leftRef.current.getBoundingClientRect();
      const right = rightRef.current.getBoundingClientRect();

      const busY = ((top.bottom - container.top) + (bottom.top - container.top)) / 2;
      const busX1 = 20;
      const busX2 = container.width - 20;
      const tapLX = left.left - container.left + left.width / 2;
      const tapRX = right.left - container.left + right.width / 2;
      const leftTop = left.top - container.top;
      const rightTop = right.top - container.top;

      setWire({ busY, busX1, busX2, tapLX, tapRX, leftTop, rightTop });
    };

    update();
    const observer = new ResizeObserver(update);
    if (containerRef.current) observer.observe(containerRef.current);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  const arcs = useMemo(() => pieArcs(TRAFFIC_PIE), []);

  return (
    <section className={styles.preview} aria-label="System overview topology preview">
      <div className={styles.canvas} ref={containerRef}>
        <svg className={styles.wireSvg} viewBox={`0 0 1200 800`} preserveAspectRatio="none" aria-hidden="true">
          <line className={styles.wireLine} x1={wire.busX1} y1={wire.busY} x2={wire.busX2} y2={wire.busY} />
          <line className={styles.wireLine} x1={wire.tapLX} y1={wire.busY} x2={wire.tapLX} y2={wire.leftTop} />
          <line className={styles.wireLine} x1={wire.tapRX} y1={wire.busY} x2={wire.tapRX} y2={wire.rightTop} />
        </svg>

        <div className={styles.topZone} ref={topRef}>
          <div className={styles.metricsRow}>
            {METRICS_TOP.map((metric) => (
              <MetricTile key={metric.label} metric={metric} />
            ))}
          </div>
          <div className={styles.topZoneInner}>
            <div />
            <div />
            <div />
            <article className={`${styles.capacityTile} ${styles.capacitySlot}`}>
              <p className={styles.tileLabel}>Capacity</p>
              <div className={styles.capacityTrack}>
                <div className={styles.capacityFill} style={{ width: `${CAPACITY_PERCENT}%` }} />
              </div>
              <p className={styles.capacityMeta}>{CAPACITY_PERCENT}% active capacity</p>
            </article>
          </div>
        </div>

        <div className={styles.midZone}>
          <div className={styles.node}>
            camOS
            <span className={styles.nodeSub}>system overview</span>
          </div>
        </div>

        <div className={styles.bottomZone} ref={bottomRef}>
          <article className={styles.pieTile} ref={leftRef}>
            <p className={styles.tileLabel}>Traffic Distribution</p>
            <div className={styles.pieWrap}>
              <svg className={styles.pieSvg} viewBox="0 0 140 140" aria-hidden="true">
                {arcs.map((arc) => (
                  <path key={arc.label} d={arc.d} fill={arc.color} />
                ))}
                <circle cx="70" cy="70" r="22" fill="color-mix(in srgb, var(--sys-bg-1) 86%, transparent)" />
              </svg>
            </div>
            <div className={styles.legend}>
              {arcs.map((arc) => (
                <div key={arc.label} className={styles.legendRow}>
                  <span className={styles.legendLabel}>
                    <span className={styles.legendSwatch} style={{ background: arc.color }} />
                    {arc.label}
                  </span>
                  <span>{arc.value}%</span>
                </div>
              ))}
            </div>
          </article>

          <div ref={rightRef}>
            <MetricTile metric={DWELL_TILE} />
          </div>
        </div>
      </div>
    </section>
  );
};

export default SystemOverviewPreview;
