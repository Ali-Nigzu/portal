import type { Credentials } from "../../types/credentials";
import ReportsPage from "../reports/ReportsPage";
import { fetchDemoLatestSnapshot } from "./transport/fetchDemoLatestSnapshot";

const demoCredentials: Credentials = {
  username: "client1",
  password: "",
  orgId: "client1",
};

const DemoReportsPage = () => (
  <ReportsPage
    credentials={demoCredentials}
    fetchSnapshotFn={fetchDemoLatestSnapshot}
  />
);

export default DemoReportsPage;
