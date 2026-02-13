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
  {
    label: "Entrances",
    value: "12,480",
    spark: [12, 14, 15, 16, 14, 17, 19, 18, 20, 21, 20, 22],
  },
  {
    label: "Occupancy",
    value: "318",
    spark: [260, 268, 274, 280, 286, 295, 301, 309, 315, 320, 316, 318],
  },
  {
    label: "Exits",
    value: "11,906",
    spark: [11, 12, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
  },
  {
    label: "Footfall",
    value: "24,386",
    spark: [18, 20, 22, 23, 25, 26, 27, 29, 30, 31, 32, 33],
  },
];

const DWELL_TILE: Metric = {
  label: "Dwell",
  value: "8m 42s",
  spark: [6.1, 6.2, 6.5, 6.8, 7.1, 7.5, 7.9, 8.1, 8.4, 8.6, 8.5, 8.7],
};

const TRAFFIC_PIE: Segment[] = [
  {
    label: "North",
    value: 42,
    color: "color-mix(in srgb, var(--sys-accent) 60%, white 8%)",
  },
  {
    label: "South",
    value: 33,
    color: "color-mix(in srgb, var(--sys-accent) 44%, var(--sys-text-2) 56%)",
  },
  {
    label: "East",
    value: 25,
    color: "color-mix(in srgb, var(--sys-accent) 26%, var(--sys-text-3) 74%)",
  },
];

const CAPACITY_PERCENT = 68;

const sparkPath = (points: number[], width = 220, height = 46) => {
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
  const radius = 44;
  const cx = 62;
  const cy = 62;
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

const MetricTile = ({
  metric,
  className,
}: {
  metric: Metric;
  className?: string;
}) => (
  <article className={`${styles.tile} ${styles.metricTile} ${className ?? ""}`}>
    <p className={styles.tileLabel}>{metric.label}</p>
    <p className={styles.metricValue}>{metric.value}</p>
    <svg className={styles.sparkline} viewBox="0 0 220 46" aria-hidden="true">
      <path d={sparkPath(metric.spark)} className={styles.sparklinePath} />
    </svg>
  </article>
);

type WireLayout = {
  width: number;
  height: number;
  busY: number;
  busX1: number;
  busX2: number;
  taps: number[];
  topBottomY: number[];
  leftTopY: number;
  rightTopY: number;
};

const initialWireLayout: WireLayout = {
  width: 0,
  height: 0,
  busY: 0,
  busX1: 0,
  busX2: 0,
  taps: [0, 0, 0, 0, 0],
  topBottomY: [0, 0, 0],
  leftTopY: 0,
  rightTopY: 0,
};

const topTileClasses = [styles.tileT1, styles.tileT2, styles.tileT3, styles.tileT4];

const SystemOverviewPreview: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const topClusterRef = useRef<HTMLDivElement | null>(null);
  const bottomClusterRef = useRef<HTMLDivElement | null>(null);
  const topWireRefs = useRef<(HTMLDivElement | null)[]>([]);
  const leftRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);
  const [wire, setWire] = useState<WireLayout>(initialWireLayout);

  useLayoutEffect(() => {
    const update = () => {
      if (
        !containerRef.current ||
        !topClusterRef.current ||
        !bottomClusterRef.current ||
        !leftRef.current ||
        !rightRef.current ||
        topWireRefs.current.some((ref) => !ref)
      ) {
        return;
      }

      const container = containerRef.current.getBoundingClientRect();
      const topCluster = topClusterRef.current.getBoundingClientRect();
      const bottomCluster = bottomClusterRef.current.getBoundingClientRect();
      const left = leftRef.current.getBoundingClientRect();
      const right = rightRef.current.getBoundingClientRect();

      const busY = ((topCluster.bottom - container.top) + (bottomCluster.top - container.top)) / 2;
      const busX1 = 18;
      const busX2 = container.width - 18;

      const topBottomY = topWireRefs.current.map((tile) => {
        const rect = (tile as HTMLDivElement).getBoundingClientRect();
        return rect.bottom - container.top;
      });

      const taps = [
        ...topWireRefs.current.map((tile) => {
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
        topBottomY,
        leftTopY: left.top - container.top,
        rightTopY: right.top - container.top,
      });
    };

    update();
    const observer = new ResizeObserver(update);
    if (containerRef.current) observer.observe(containerRef.current);
    if (topClusterRef.current) observer.observe(topClusterRef.current);
    if (bottomClusterRef.current) observer.observe(bottomClusterRef.current);
    topWireRefs.current.forEach((ref) => ref && observer.observe(ref));
    if (leftRef.current) observer.observe(leftRef.current);
    if (rightRef.current) observer.observe(rightRef.current);
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
        {wire.width > 0 && wire.height > 0 ? (
          <svg
            className={styles.wireSvg}
            width={wire.width}
            height={wire.height}
            viewBox={`0 0 ${wire.width} ${wire.height}`}
            aria-hidden="true"
          >
            <line className={styles.wireLine} x1={wire.busX1} y1={wire.busY} x2={wire.busX2} y2={wire.busY} />

            <line className={styles.wireLine} x1={wire.taps[0]} y1={wire.topBottomY[0]} x2={wire.taps[0]} y2={wire.busY} />
            <line className={styles.wireLine} x1={wire.taps[1]} y1={wire.topBottomY[1]} x2={wire.taps[1]} y2={wire.busY} />
            <line className={styles.wireLine} x1={wire.taps[2]} y1={wire.topBottomY[2]} x2={wire.taps[2]} y2={wire.busY} />

            <line className={styles.wireLine} x1={wire.taps[3]} y1={wire.leftTopY} x2={wire.taps[3]} y2={wire.busY} />
            <line className={styles.wireLine} x1={wire.taps[4]} y1={wire.busY} x2={wire.taps[4]} y2={wire.rightTopY} />

            {wire.taps.map((tap, index) => (
              <circle key={`tap-${index}`} className={styles.tapMark} cx={tap} cy={wire.busY} r="2.2" />
            ))}
          </svg>
        ) : null}

        <div className={styles.topCluster} ref={topClusterRef}>
          {METRICS_TOP.map((metric, index) => (
            <div
              key={metric.label}
              className={topTileClasses[index]}
              ref={(node) => {
                if (index < 3) {
                  topWireRefs.current[index] = node;
                }
              }}
            >
              <MetricTile metric={metric} />
            </div>
          ))}

          <article className={`${styles.tile} ${styles.capacityTile}`}>
            <p className={styles.tileLabel}>Capacity</p>
            <div className={styles.capacityTrack}>
              <div className={styles.capacityFill} style={{ width: `${CAPACITY_PERCENT}%` }} />
            </div>
            <p className={styles.capacityMeta}>{CAPACITY_PERCENT}% active capacity</p>
          </article>
        </div>

        <div className={styles.midZone}>
          <div className={styles.node}>
            camOS
            <span className={styles.nodeSub}>System Sheet</span>
          </div>
        </div>

        <div className={styles.bottomCluster} ref={bottomClusterRef}>
          <article className={`${styles.tile} ${styles.pieTile}`} ref={leftRef}>
            <p className={styles.tileLabel}>Traffic Distribution</p>
            <div className={styles.pieWrap}>
              <svg className={styles.pieSvg} viewBox="0 0 124 124" aria-hidden="true">
                {arcs.map((arc) => (
                  <path key={arc.label} d={arc.d} fill={arc.color} />
                ))}
                <circle cx="62" cy="62" r="17" fill="color-mix(in srgb, var(--sys-bg-1) 88%, transparent)" />
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
