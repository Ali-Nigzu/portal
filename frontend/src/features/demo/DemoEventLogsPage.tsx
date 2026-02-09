import EventLogsPage from "../events/EventLogsPage";
import type { Credentials } from "../../types/credentials";
import { searchDemoEvents } from "./transport/searchDemoEvents";

const demoCredentials: Credentials = {
  username: "client1",
  password: "",
  orgId: "client1",
};

const DemoEventLogsPage = () => (
  <EventLogsPage
    credentials={demoCredentials}
    searchEventsFn={searchDemoEvents}
    viewTokenOverride={null}
    clientIdOverride={null}
  />
);

export default DemoEventLogsPage;
