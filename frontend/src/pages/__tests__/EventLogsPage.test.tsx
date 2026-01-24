import React from "react";
import renderer, { act } from "react-test-renderer";
import EventLogsPage from "../EventLogsPage";

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

describe("EventLogsPage search behavior", () => {
  const credentials = { username: "client1", password: "client123" };

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events: [], total: 0, total_pages: 1 }),
    } as Response);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("does not auto-fetch when draft filters change", async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<EventLogsPage credentials={credentials} />);
      await flushPromises();
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    (global.fetch as jest.Mock).mockClear();

    const eventSelect = (tree as renderer.ReactTestRenderer).root.findByProps({ id: "event-type" });
    act(() => {
      eventSelect.props.onChange({ target: { value: "entry" } });
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("fetches only when Search is triggered", async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<EventLogsPage credentials={credentials} />);
      await flushPromises();
    });

    (global.fetch as jest.Mock).mockClear();

    const trackInput = (tree as renderer.ReactTestRenderer).root.findByProps({ id: "event-track-id" });
    act(() => {
      trackInput.props.onChange({ target: { value: "ABC123" } });
    });

    const searchButton = (tree as renderer.ReactTestRenderer).root
      .findAllByType("button")
      .find((button) => button.props.children?.toString().includes("Search"));
    expect(searchButton).toBeDefined();

    await act(async () => {
      searchButton?.props.onClick();
      await flushPromises();
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("triggers search on Enter in Track ID field", async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<EventLogsPage credentials={credentials} />);
      await flushPromises();
    });

    (global.fetch as jest.Mock).mockClear();

    const trackInput = (tree as renderer.ReactTestRenderer).root.findByProps({ id: "event-track-id" });
    await act(async () => {
      trackInput.props.onKeyDown({ key: "Enter", preventDefault: jest.fn() });
      await flushPromises();
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("removes the Site/Client filter", async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<EventLogsPage credentials={credentials} />);
      await flushPromises();
    });

    expect(() => (tree as renderer.ReactTestRenderer).root.findByProps({ id: "event-site" })).toThrow();
  });
});
