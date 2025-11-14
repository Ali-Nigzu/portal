// API Configuration
const getApiBaseUrl = (): string => {
  // Use environment variable if explicitly set
  const envUrl = process.env.REACT_APP_API_URL;

  if (envUrl) {
    return envUrl;
  }

  // Production environment (Cloud Run with nginx proxy)
  if (process.env.REACT_APP_ENVIRONMENT === 'production') {
    // In production, nginx proxies API calls, so use same origin
    return window.location.origin;
  }

  // Development environments (localhost and Replit)
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:8000'; // FastAPI dev server
  }

  // Replit environment - frontend on port 5000, backend on port 8000
  // Use the proxy configured in package.json by using relative URLs
  return '';
};

export const API_BASE_URL = getApiBaseUrl();
export const API_ENDPOINTS = {
  CHART_DATA: `${API_BASE_URL}/api/chart-data`,
  SEARCH_EVENTS: `${API_BASE_URL}/api/search-events`,
  USERS: `${API_BASE_URL}/api/users`,
} as const;

export type AnalyticsTransportMode = 'fixtures' | 'live';

export type ExperienceVersion = 'legacy' | 'v2';

type BooleanString = 'true' | '1' | 'false' | '0' | 'yes' | 'no' | 'on' | 'off';

const parseBooleanFlag = (value?: string): boolean | undefined => {
  if (!value) {
    return undefined;
  }

  const normalized = value.toLowerCase() as BooleanString;
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') {
    return false;
  }
  return undefined;
};

const parseExperienceVersion = (value?: string): ExperienceVersion | undefined => {
  if (!value) {
    return undefined;
  }

  const normalized = value.toLowerCase();
  if (normalized === 'legacy' || normalized === 'v2') {
    return normalized as ExperienceVersion;
  }

  return undefined;
};

export const PORTAL_ENVIRONMENT = process.env.REACT_APP_ENVIRONMENT ?? 'development';
const IS_PRODUCTION = PORTAL_ENVIRONMENT === 'production';

const resolveAnalyticsV2Transport = (): AnalyticsTransportMode => {
  const envValue = process.env.REACT_APP_ANALYTICS_V2_TRANSPORT?.toLowerCase();
  if (envValue === 'live') {
    return 'live';
  }
  return 'fixtures';
};

const analyticsExperienceFromEnv = parseExperienceVersion(process.env.REACT_APP_ANALYTICS_EXPERIENCE);
const dashboardExperienceFromEnv = parseExperienceVersion(process.env.REACT_APP_DASHBOARD_EXPERIENCE);

const analyticsFeatureFlag = parseBooleanFlag(process.env.REACT_APP_FEATURE_ANALYTICS_V2) ?? false;
const dashboardFeatureFlag = parseBooleanFlag(process.env.REACT_APP_FEATURE_DASHBOARD_V2) ?? false;

const analyticsDefault: ExperienceVersion = IS_PRODUCTION
  ? 'v2'
  : analyticsExperienceFromEnv ?? 'v2';

const dashboardDefault: ExperienceVersion = IS_PRODUCTION
  ? 'v2'
  : dashboardExperienceFromEnv ?? 'v2';

const analyticsLegacyRouteEnabled =
  analyticsDefault === 'legacy'
    ? true
    : (!IS_PRODUCTION && (parseBooleanFlag(process.env.REACT_APP_EXPOSE_ANALYTICS_LEGACY) ?? false));

const dashboardLegacyRouteEnabled =
  dashboardDefault === 'legacy'
    ? true
    : (!IS_PRODUCTION && (parseBooleanFlag(process.env.REACT_APP_EXPOSE_DASHBOARD_LEGACY) ?? false));

const analyticsV2RouteEnabled =
  analyticsDefault === 'v2'
    ? true
    : (parseBooleanFlag(process.env.REACT_APP_EXPOSE_ANALYTICS_V2) ?? analyticsFeatureFlag);

const dashboardV2RouteEnabled =
  dashboardDefault === 'v2'
    ? true
    : (parseBooleanFlag(process.env.REACT_APP_EXPOSE_DASHBOARD_V2) ?? dashboardFeatureFlag);

export const EXPERIENCE_GATES = {
  analytics: {
    default: analyticsDefault,
    routes: {
      legacy: analyticsLegacyRouteEnabled,
      v2: analyticsV2RouteEnabled,
    },
  },
  dashboard: {
    default: dashboardDefault,
    routes: {
      legacy: dashboardLegacyRouteEnabled,
      v2: dashboardV2RouteEnabled,
    },
  },
  environment: PORTAL_ENVIRONMENT,
} as const;

export const FEATURE_FLAGS = {
  analyticsV2: EXPERIENCE_GATES.analytics.routes.v2,
  dashboardV2: EXPERIENCE_GATES.dashboard.routes.v2,
} as const;

export const ANALYTICS_V2_TRANSPORT: AnalyticsTransportMode = resolveAnalyticsV2Transport();
