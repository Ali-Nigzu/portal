import { DashboardPage } from "../dashboard/DashboardPage";
import type { Credentials } from "../../types/credentials";
import { fetchDemoDashboardManifest } from "./transport/fetchDemoDashboardManifest";
import { loadDemoWidgetResult } from "./transport/loadDemoWidgetResult";

const demoCredentials: Credentials = {
  username: "client1",
  password: "",
  orgId: "client1",
};

const DemoPage = () => (
  <DashboardPage
    credentials={demoCredentials}
    manifestLoader={fetchDemoDashboardManifest}
    widgetResultLoader={loadDemoWidgetResult}
  />
);

export default DemoPage;
