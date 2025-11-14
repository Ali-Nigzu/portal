import type { DashboardManifest, DashboardWidget } from '../types';

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

describe('dashboard manifest mutations', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      REACT_APP_API_URL: 'https://api.example.com',
      REACT_APP_ENVIRONMENT: 'development',
    };
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  it('pins a dashboard widget via POST and returns updated manifest', async () => {
    const { pinDashboardWidget } = await import('./mutateDashboardManifest');

    const manifest: DashboardManifest = {
      id: 'dashboard-default',
      orgId: 'client0',
      widgets: [],
      layout: { kpiBand: [], grid: { columns: 12, placements: {} } },
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => manifest,
    });

    const widget: DashboardWidget = {
      id: 'widget-1',
      title: 'Activity KPI',
      kind: 'kpi',
      chartSpecId: 'dashboard.kpi.activity',
    };

    const payload = { widget };

    const result = await pinDashboardWidget('client0', 'dashboard-default', payload);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/api/dashboards/dashboard-default/widgets?orgId=client0',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    );
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.signal).toBeDefined();
    expect(result).toEqual(manifest);
  });

  it('throws on pin failure with status text', async () => {
    const { pinDashboardWidget } = await import('./mutateDashboardManifest');

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'boom',
    });

    await expect(
      pinDashboardWidget('client0', 'dashboard-default', {
        widget: {
          id: 'widget-err',
          title: 'Broken',
          kind: 'kpi',
          chartSpecId: 'spec',
        },
      }),
    ).rejects.toThrow(/Failed to pin widget: 500 boom/);
  });

  it('unpins a dashboard widget via DELETE and returns updated manifest', async () => {
    const { unpinDashboardWidget } = await import('./mutateDashboardManifest');

    const manifest: DashboardManifest = {
      id: 'dashboard-default',
      orgId: 'client0',
      widgets: [],
      layout: { kpiBand: [], grid: { columns: 12, placements: {} } },
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => manifest,
    });

    const result = await unpinDashboardWidget('client0', 'dashboard-default', 'widget-1');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/api/dashboards/dashboard-default/widgets/widget-1?orgId=client0',
      expect.objectContaining({
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const [, deleteInit] = (global.fetch as jest.Mock).mock.calls.slice(-1)[0];
    expect(deleteInit.signal).toBeDefined();
    expect(result).toEqual(manifest);
  });

  it('throws on unpin failure with status text', async () => {
    const { unpinDashboardWidget } = await import('./mutateDashboardManifest');

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'missing',
    });

    await expect(
      unpinDashboardWidget('client0', 'dashboard-default', 'missing-widget'),
    ).rejects.toThrow(/Failed to remove widget: 404 missing/);
  });
});
