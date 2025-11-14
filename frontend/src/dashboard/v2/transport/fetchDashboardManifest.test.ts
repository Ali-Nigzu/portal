import { jest } from '@jest/globals';
import type { MockedFunction } from 'jest-mock';
import type { DashboardManifest } from '../types';

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

describe('fetchDashboardManifest', () => {
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

  it('requests the manifest with orgId query and returns payload', async () => {
    const { fetchDashboardManifest } = await import('./fetchDashboardManifest');

    const manifest: DashboardManifest = {
      id: 'dashboard-default',
      orgId: 'client0',
      widgets: [],
      layout: { kpiBand: [], grid: { columns: 12, placements: {} } },
    };

    const fetchMock = global.fetch as MockedFunction<typeof global.fetch>;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => manifest,
    } as unknown as Response);

    const result = await fetchDashboardManifest('client0', 'dashboard-default');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/api/dashboards/dashboard-default?orgId=client0',
      expect.objectContaining({
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const [, init] = (fetchMock.mock.calls[0] ?? []) as [RequestInfo | URL, RequestInit];
    expect(init.signal).toBeDefined();
    expect(result).toEqual(manifest);
  });

  it('throws when the manifest endpoint responds with an error', async () => {
    const { fetchDashboardManifest } = await import('./fetchDashboardManifest');

    const fetchMock = global.fetch as MockedFunction<typeof global.fetch>;
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'unavailable',
    } as unknown as Response);

    await expect(fetchDashboardManifest('client0', 'dashboard-default')).rejects.toThrow(
      /Failed to load dashboard manifest: 503 unavailable/,
    );
  });
});
