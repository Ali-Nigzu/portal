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
  
  // Development environments
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:8000';  // FastAPI dev server
  }
  
  // For Replit and other deployment environments, use relative path
  return window.location.origin;
};

export const API_BASE_URL = getApiBaseUrl();
export const API_ENDPOINTS = {
  CHART_DATA: `${API_BASE_URL}/api/chart-data`,
  USERS: `${API_BASE_URL}/api/users`,
} as const;