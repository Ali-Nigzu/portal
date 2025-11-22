import { lookupCapacity, resolveUiClient } from "./vrmDecorators";

describe("vrm capacity mapping", () => {
  it("maps table client0 to ui client1 with capacity 10", () => {
    expect(resolveUiClient("client0")).toBe("client1");
    expect(lookupCapacity("client0")).toBe(10);
  });

  it("maps table client1 to ui client2 with capacity 100", () => {
    expect(resolveUiClient("client1")).toBe("client2");
    expect(lookupCapacity("client1")).toBe(100);
  });

  it("throws for unknown clients", () => {
    expect(() => lookupCapacity("unknown-client")).toThrow("Unknown client for capacity usage");
  });
});
