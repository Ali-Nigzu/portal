const getApiBaseUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (envUrl) {
    return envUrl;
  }
  if (import.meta.env.VITE_ENVIRONMENT === "production") {
    return window.location.origin;
  }
  if (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  ) {
    return "http://localhost:8000";
  }
  return "";
};

export const API_BASE_URL = getApiBaseUrl();
export const API_ENDPOINTS = {
  SEARCH_EVENTS: `${API_BASE_URL}/api/search-events`,
} as const;
