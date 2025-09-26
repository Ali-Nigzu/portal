// API Configuration
const getApiBaseUrl = (): string => {
  // Use environment variable in production, fallback to localhost for development
  const envUrl = process.env.REACT_APP_API_URL;
  
  if (envUrl) {
    return envUrl;
  }
  
  // For development, use current domain with port 8000
  if (window.location.hostname === 'localhost') {
    return 'http://localhost:8000';
  }
  
  // For deployed environments, use same origin (relative path)
  return window.location.origin;
};

export const API_BASE_URL = getApiBaseUrl();
export const API_ENDPOINTS = {
  CHART_DATA: `${API_BASE_URL}/api/chart-data`,
  USERS: `${API_BASE_URL}/api/users`,
} as const;