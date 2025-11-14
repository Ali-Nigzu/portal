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
    return 'http://localhost:8000';  // FastAPI dev server
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

export type AnalyticsTransportMode = "fixtures" | "live";

const resolveAnalyticsV2Transport = (): AnalyticsTransportMode => {
  const envValue = process.env.REACT_APP_ANALYTICS_V2_TRANSPORT?.toLowerCase();
  if (envValue === "live") {
    return "live";
  }
  return "fixtures";
};

export const FEATURE_FLAGS = {
  analyticsV2:
    process.env.REACT_APP_FEATURE_ANALYTICS_V2 === "true" ||
    process.env.REACT_APP_FEATURE_ANALYTICS_V2 === "1",
  dashboardV2:
    process.env.REACT_APP_FEATURE_DASHBOARD_V2 === "true" ||
    process.env.REACT_APP_FEATURE_DASHBOARD_V2 === "1",
} as const;

export const ANALYTICS_V2_TRANSPORT: AnalyticsTransportMode =
  resolveAnalyticsV2Transport();