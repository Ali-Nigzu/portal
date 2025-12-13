import renderer from "react-test-renderer";

import { renderLoading } from "../DashboardV2Page";

describe("DashboardV2 KPI placeholders", () => {
  it("applies the KPI variant class for loading tiles", () => {
    const tree = renderer.create(renderLoading("Test KPI", "kpi")).toJSON() as any;
    expect(tree?.props?.className).toContain("dashboard-v2__placeholder--kpi");
  });

  it("retains the card variant styling by default", () => {
    const tree = renderer.create(renderLoading("Chart"))?.toJSON() as any;
    expect(tree?.props?.className).toContain("dashboard-v2__placeholder--card");
  });
});
