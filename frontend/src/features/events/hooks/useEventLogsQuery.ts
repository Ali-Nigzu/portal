import { useEffect, useState } from "react";
import { usePortalQuery } from "../../../context/usePortalQuery";
export function useEventLogsQuery(filters: string) {
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [page, setPage] = useState(0);
  const [count, setCount] = useState<{ filters: string; total: number }>();
  const params = new URLSearchParams(filters);
  if (cursors[page]) params.set("cursor", cursors[page]!);
  const query = usePortalQuery<EventResult>("/events", params.toString());
  useEffect(() => {
    if (query.data?.total != null)
      setCount({ filters, total: query.data.total });
  }, [query.data, filters]);
  return {
    ...query,
    page,
    total:
      query.data?.total ??
      (count?.filters === filters ? count.total : undefined),
    previous: () => setPage((p) => Math.max(0, p - 1)),
    next: () => {
      const cursor = query.data?.page.next_cursor;
      if (cursor) {
        setCursors((v) => [...v.slice(0, page + 1), cursor]);
        setPage((p) => p + 1);
      }
    },
  };
}

export type EventData = {
  event_id: string;
  site: { id: string; name: string };
  source: { ref: string; kind: "device"; label: string };
  timestamp: string;
  event: { value: string; label: string };
  sex: { value: string; label: string };
  age: { value: string; label: string };
};
export type EventResult = {
  items: EventData[];
  total: number | null;
  page: { size: number; next_cursor: string | null };
};
