import React from "react";
import { ChartRenderer } from "../../../analytics/components/ChartRenderer/ChartRenderer";
import type { ChartResult } from "../../../analytics/schemas/charting";

type Props = {
  result: ChartResult;
};

const SystemOverviewKpiTile = React.forwardRef<HTMLDivElement, Props>(({ result }, ref) => (
  <div ref={ref} className="dashboard-v2__kpi-tile vrm-kpi-tile vrm-kpi-tile--panel" style={{ paddingBottom: 0 }}>
    <div className="dashboard-v2__kpi-content" aria-label={String(result.meta.summary?.title ?? "KPI")}>
      <ChartRenderer result={result} height={168} className="dashboard-v2__kpi-renderer" widgetId={result.series[0]?.id} />
    </div>
  </div>
));

SystemOverviewKpiTile.displayName = "SystemOverviewKpiTile";

export default SystemOverviewKpiTile;
