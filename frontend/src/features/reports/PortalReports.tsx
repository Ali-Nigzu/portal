import { useEffect, useRef } from "react";
import {
  responseJson,
  scopeParams,
  usePortal,
  verifyScope,
} from "../../context/PortalContext";
import ReportsPage from "./ReportsPage";
import {
  buildSiteActivityReportData,
  buildVisitorProfileReportData,
  validateSchemaPayload,
  type LoadReportDataOptions,
} from "./engine/ReportsEngine";

export default function PortalReports() {
  const portal = usePortal();
  const controller = useRef<AbortController>();
  useEffect(() => () => controller.current?.abort(), [portal.key]);
  const name =
    portal.selection?.scope === "site"
      ? portal.context!.sites.find((s) => s.id === portal.selection!.id)?.name
      : portal.context!.organisation.name;
  async function load(options: LoadReportDataOptions) {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const snapshot = await responseJson(
      await portal.source.request(
        "/reports/snapshot",
        scopeParams(portal),
        abort.signal,
      ),
    );
    if (abort.signal.aborted) throw new Error("Report request cancelled");
    verifyScope(portal, snapshot);
    if (snapshot.fallback !== false)
      throw new Error("Report fallback is not permitted");
    validateSchemaPayload(snapshot.payload);
    const args = {
      snapshot,
      siteView: portal.key,
      timeframe: options.timeframe,
      now: new Date(portal.context!.clock.effective_now),
    };
    return options.reportType === "visitor-profile"
      ? buildVisitorProfileReportData(args)
      : buildSiteActivityReportData(args);
  }
  return <ReportsPage reportDataLoader={load} scopeLabel={name} />;
}
