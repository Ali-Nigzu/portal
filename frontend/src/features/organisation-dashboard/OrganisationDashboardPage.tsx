import { useMemo, useState } from "react";
import ErrorBoundary from "../../common/components/ErrorBoundary";
import DashboardKpiSection from "../dashboard/components/DashboardKpiSection";
import type { DashboardWidgetState } from "../dashboard/types";
import { ChartRenderer } from "../../analytics/components/ChartRenderer/ChartRenderer";
import { DemoDonutTooltipProvider } from "../../analytics/components/ChartRenderer/primitives/DemoDonutTooltipOwnerContext";
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
  const name = selection?.scope === "site" ? context?.sites.find(site => site.id === selection.id)?.name : context?.organisation.name;
  return <ErrorBoundary name="organisation-dashboard"><DemoDonutTooltipProvider>
    <main className="dashboard-v2" data-snapshot-ts={snapshot?.ts}>
      <header className="vrm-card-header" style={{marginBottom:20}}>
        <div><h1>{name ?? "Dashboard"}</h1>{snapshot && <p>Snapshot: <time dateTime={snapshot.ts}>{new Date(snapshot.ts).toLocaleString("en-GB",{timeZone:"UTC"})} UTC</time></p>}</div>
      </header>
      {notFound ? <p role="alert">Dashboard not found.</p> : error ? <div role="alert"><p>{error}</p><button className="vrm-btn" onClick={retry}>Retry</button></div> : !snapshot ? <p role="status">Loading dashboard…</p> : <>
        <DashboardKpiSection kpiWidgets={kpis} onRemoveWidget={() => {}} donutTooltipMode="demo_cursor_hover" />
        <section className="vrm-card" style={{marginTop:24}} aria-label="Site Flow">
          <div className="vrm-card-header"><h2 className="vrm-card-title">Site Flow</h2>
            <div style={{display:"flex",gap:12}}>
              <select aria-label="Site Flow view" value={mode} onChange={e => setMode(e.target.value)}><option value="activity">Activity</option><option value="demographics">Demographics</option></select>
              <select aria-label="Site Flow period" value={period} onChange={e => setPeriod(e.target.value as Period)}>{PERIOD_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
            </div>
          </div>
          <div className="vrm-card-body">{mode === "activity" ? <ChartRenderer result={activity!} height={340} /> : <div style={{display:"flex",flexWrap:"wrap",gap:24}}>{demographics!.map(({id,result}) => <div key={id} style={{flex:"1 1 240px"}}><ChartRenderer result={result} height={240} donutTooltipMode="demo_cursor_hover" donutTooltipOwnerId={id} /></div>)}</div>}</div>
        </section>
      </>}
    </main>
  </DemoDonutTooltipProvider></ErrorBoundary>;
}
