import { API_ENDPOINTS } from "../../../config";
import { isDemoSessionActive } from "../../../lib/demoSession";
import type { Credentials } from "../../../types/credentials";
import { resolveSiteViewFromLocation } from "../../../lib/siteView";
import { syntheticSearchEvents } from './syntheticEventLogs';

export interface SearchEventsResult {
  events?: unknown[];
  total_pages?: number;
  total?: number;
}

export const searchEvents = async ({
  searchParams,
  viewToken,
  credentials,
  clientId,
}: {
  searchParams: URLSearchParams;
  viewToken?: string | null;
  credentials?: Credentials;
  clientId?: string | null;
}): Promise<SearchEventsResult> => {
  const isDemoSession = isDemoSessionActive();
  const siteView = resolveSiteViewFromLocation();
  if (siteView && !searchParams.has("siteView")) {
    searchParams.append("siteView", siteView);
  }
  const syntheticMode = import.meta.env.VITE_EVENTLOGS_SYNTHETIC_MODE === 'true';
  const syntheticProfile = import.meta.env.VITE_EVENTLOGS_SYNTHETIC_PROFILE || 'width-stress';
  if (syntheticMode) {
    await new Promise((r) => setTimeout(r, 120));
    return syntheticSearchEvents(syntheticProfile);
  }

  let apiUrl = `${API_ENDPOINTS.SEARCH_EVENTS}?${searchParams.toString()}`;
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (viewToken) {
    apiUrl += `&view_token=${encodeURIComponent(viewToken)}`;
  } else if (!isDemoSession) {
    if (credentials) {
      const auth = btoa(`${credentials.username}:${credentials.password}`);
      headers["Authorization"] = `Basic ${auth}`;
    }
    if (clientId) {
      apiUrl += `&client_id=${encodeURIComponent(clientId)}`;
    }
  }
  const response = await fetch(apiUrl, {
    headers,
    credentials: isDemoSession ? "include" : "same-origin",
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
};
