import { DashboardPage } from "../dashboard/DashboardPage";
import type { Credentials } from "../../types/credentials";
import { fetchDemoDashboardManifest } from "./transport/fetchDemoDashboardManifest";
import { loadDemoWidgetResult } from "./transport/loadDemoWidgetResult";

const DEMO_DASHBOARD_ID = "dashboard-default";
const demoCredentials: Credentials = {
  username: "client1",
  password: "",
  orgId: "client1",
};

const DemoPage = () => (
  <DashboardPage
    credentials={demoCredentials}
    dashboardId={DEMO_DASHBOARD_ID}
    manifestLoader={fetchDemoDashboardManifest}
    widgetResultLoader={loadDemoWidgetResult}
  />
);

export default DemoPage;
