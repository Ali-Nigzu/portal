describe('EXPERIENCE_GATES', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  const importConfig = async () => {
    return import('../config');
  };

  test('defaults to v2 experiences in development when no overrides provided', async () => {
    delete process.env.REACT_APP_ENVIRONMENT;
    delete process.env.REACT_APP_ANALYTICS_EXPERIENCE;
    delete process.env.REACT_APP_DASHBOARD_EXPERIENCE;

    const { EXPERIENCE_GATES } = await importConfig();

    expect(EXPERIENCE_GATES.analytics.default).toBe('v2');
    expect(EXPERIENCE_GATES.dashboard.default).toBe('v2');
    expect(EXPERIENCE_GATES.analytics.routes.legacy).toBe(false);
    expect(EXPERIENCE_GATES.dashboard.routes.legacy).toBe(false);
    expect(EXPERIENCE_GATES.dashboard.routes.v2).toBe(true);
  });

  test('forces v2 experiences in production and hides legacy routes', async () => {
    process.env.REACT_APP_ENVIRONMENT = 'production';
    process.env.REACT_APP_ANALYTICS_EXPERIENCE = 'legacy';
    process.env.REACT_APP_DASHBOARD_EXPERIENCE = 'legacy';

    const { EXPERIENCE_GATES } = await importConfig();

    expect(EXPERIENCE_GATES.analytics.default).toBe('v2');
    expect(EXPERIENCE_GATES.dashboard.default).toBe('v2');
    expect(EXPERIENCE_GATES.analytics.routes.legacy).toBe(false);
    expect(EXPERIENCE_GATES.dashboard.routes.legacy).toBe(false);
  });

  test('allows exposing legacy analytics and dashboard routes for QA in development', async () => {
    process.env.REACT_APP_ENVIRONMENT = 'development';
    process.env.REACT_APP_ANALYTICS_EXPERIENCE = 'v2';
    process.env.REACT_APP_EXPOSE_ANALYTICS_LEGACY = 'true';
    process.env.REACT_APP_DASHBOARD_EXPERIENCE = 'v2';
    process.env.REACT_APP_EXPOSE_DASHBOARD_LEGACY = 'true';

    const { EXPERIENCE_GATES } = await importConfig();

    expect(EXPERIENCE_GATES.analytics.default).toBe('v2');
    expect(EXPERIENCE_GATES.analytics.routes.legacy).toBe(true);
    expect(EXPERIENCE_GATES.analytics.routes.v2).toBe(true);
    expect(EXPERIENCE_GATES.dashboard.default).toBe('v2');
    expect(EXPERIENCE_GATES.dashboard.routes.legacy).toBe(true);
    expect(EXPERIENCE_GATES.dashboard.routes.v2).toBe(true);
  });

  test('allows forcing legacy dashboard while keeping v2 route exposed for comparisons', async () => {
    process.env.REACT_APP_ENVIRONMENT = 'development';
    process.env.REACT_APP_DASHBOARD_EXPERIENCE = 'legacy';
    process.env.REACT_APP_EXPOSE_DASHBOARD_V2 = 'true';

    const { EXPERIENCE_GATES } = await importConfig();

    expect(EXPERIENCE_GATES.dashboard.default).toBe('legacy');
    expect(EXPERIENCE_GATES.dashboard.routes.v2).toBe(true);
    expect(EXPERIENCE_GATES.dashboard.routes.legacy).toBe(true);
  });
});
