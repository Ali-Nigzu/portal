import AlarmLogsPage from "../alarms/AlarmLogsPage";
import type { Credentials } from "../../types/credentials";
import { fetchDemoAlarmLogs } from "./transport/fetchDemoAlarmLogs";

const demoCredentials: Credentials = {
  username: "client1",
  password: "",
  orgId: "client1",
};

const DemoAlarmLogsPage = () => (
  <AlarmLogsPage
    credentials={demoCredentials}
    isDemo
    fetchAlarmLogsFn={fetchDemoAlarmLogs}
    viewTokenOverride={null}
  />
);

export default DemoAlarmLogsPage;
