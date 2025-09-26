// API Configuration
const getApiBaseUrl = (): string => {
  // Use environment variable in production, fallback to localhost for development
  const envUrl = process.env.REACT_APP_API_URL;
  
  if (envUrl) {
    return envUrl;
  }
  
  // For development, use localhost with FastAPI port
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:8000';
  }
  
  // For Replit deployment and other environments, use relative path (proxied)
  return window.location.origin;
};

export const API_BASE_URL = getApiBaseUrl();
export const API_ENDPOINTS = {
  CHART_DATA: `${API_BASE_URL}/api/chart-data`,
  USERS: `${API_BASE_URL}/api/users`,
} as const;