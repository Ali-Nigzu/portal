import type { Credentials } from "../../../types/credentials";
import type { SearchEventsResult } from "../../events/transport/searchEvents";

export const searchDemoEvents = async ({
  searchParams,
}: {
  searchParams: URLSearchParams;
  viewToken?: string | null;
  credentials?: Credentials;
  clientId?: string | null;
}): Promise<SearchEventsResult> => {
  const apiUrl = `/api/demo/event-logs?${searchParams.toString()}`;
  const response = await fetch(apiUrl, {
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
};
