import DeviceListPage from "../devices/DeviceListPage";
import type { Credentials } from "../../types/credentials";
import { fetchDemoDeviceList } from "./transport/fetchDemoDeviceList";

const demoCredentials: Credentials = {
  username: "client1",
  password: "",
  orgId: "client1",
};

const DemoDeviceListPage = () => (
  <DeviceListPage
    credentials={demoCredentials}
    isDemo
    fetchDeviceListFn={fetchDemoDeviceList}
    viewTokenOverride={null}
  />
);

export default DemoDeviceListPage;
