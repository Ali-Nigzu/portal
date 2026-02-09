import { API_ENDPOINTS } from "../../../config";
import { isDemoSessionActive } from "../../../lib/demoSession";
import type { Credentials } from "../../../types/credentials";

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
