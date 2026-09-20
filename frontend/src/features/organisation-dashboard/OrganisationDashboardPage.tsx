import { useMemo, useState } from "react";
import ErrorBoundary from "../../common/components/ErrorBoundary";
import DashboardKpiSection from "../dashboard/components/DashboardKpiSection";
import DashboardHeader from "../dashboard/components/DashboardHeader";
import DashboardLoadingState from "./DashboardLoadingState";
import type { DashboardWidgetState } from "../dashboard/types";
import { Card } from "../../analytics/components/Card/Card";
import { ChartRenderer } from "../../analytics/components/ChartRenderer/ChartRenderer";
import { DemoDonutTooltipBoundary, DemoDonutTooltipProvider } from "../../analytics/components/ChartRenderer/primitives/DemoDonutTooltipOwnerContext";
import { useDashboardSnapshot } from "./OrganisationDashboardProvider";
import { PERIOD_OPTIONS, projectActivity, projectDemographics, projectKpis } from "./projection";
import type { Period } from "./types";
import "../dashboard/styles/DashboardPage.css";

export default function OrganisationDashboardPage() {
  const { context, selection, snapshot, error, notFound, retry } = useDashboardSnapshot();
  const [period, setPeriod] = useState<Period>("today");
  const [mode, setMode] = useState("activity");
  const kpis = useMemo<DashboardWidgetState[]>(() => snapshot ? projectKpis(snapshot).map(({id,title,result}) => ({
    widget: {id,title,kind:"kpi",locked:true}, status:"ready", result,
  })) : [], [snapshot]);
  const activity = useMemo(() => snapshot && projectActivity(snapshot, period), [snapshot,period]);
  const demographics = useMemo(() => snapshot && projectDemographics(snapshot.payload[period]), [snapshot,period]);
  const entity = selection?.scope === "site" ? context?.sites.find(site => site.id === selection.id)
    : selection?.scope === "organisation" ? context?.organisation : undefined;
  return <ErrorBoundary name="organisation-dashboard"><DemoDonutTooltipProvider><DemoDonutTooltipBoundary>
    <div className="dashboard-v2" data-snapshot-ts={snapshot?.ts}>
      <div className="dashboard-v2__content vrm-dashboard-shell">
      {entity && <DashboardHeader siteLabelOverride={entity.name} status={{realtime:entity.realtime, enabled:entity.enabled}} />}
      {notFound ? <p role="alert">Dashboard not found.</p> : error ? <div role="alert"><p>{error}</p><button className="vrm-btn" onClick={retry}>Retry</button></div> : !snapshot ? <DashboardLoadingState /> : <>
        <DashboardKpiSection kpiWidgets={kpis} onRemoveWidget={() => {}} donutTooltipMode="demo_cursor_hover" />
        <Card title="Site Flow" className="dashboard-v2__chart-card dashboard-v2__chart-card--site-flow vrm-card vrm-card--chart-panel"
          dateSelector={<div className="site-flow-card__controls">
              <select className="vrm-select" aria-label="Site Flow view" value={mode} onChange={e => setMode(e.target.value)}><option value="activity">Activity</option><option value="demographics">Demographics</option></select>
              <select className="vrm-select" aria-label="Site Flow period" value={period} onChange={e => setPeriod(e.target.value as Period)}>{PERIOD_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
            </div>}>
          <div className="vrm-card-body site-flow-body">{mode === "activity" ? <div className="site-flow-activity" tabIndex={0} role="region" aria-label="Site Flow activity timeline"><ChartRenderer result={activity!} height={340} /></div> : <div className="site-flow-demographics">{demographics!.map(({id,result}) => <div key={id}><ChartRenderer className="site-flow-demographics__chart" result={result} height={200} donutTooltipMode="demo_cursor_hover" donutTooltipOwnerId={id} /></div>)}</div>}</div>
        </Card>
      </>}
      </div>
    </div>
  </DemoDonutTooltipBoundary></DemoDonutTooltipProvider></ErrorBoundary>;
}
