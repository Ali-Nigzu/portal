import { useEffect, useRef, useState } from "react";
import {
  responseJson,
  scopeParams,
  usePortal,
  verifyScope,
} from "../../../context/PortalContext";
import { usePortalQuery } from "../../../context/usePortalQuery";
import type { AlarmResult, AlarmEvent } from "../types";
export function useAlarmLogs(filters: string) {
  const portal = usePortal();
  const query = usePortalQuery<AlarmResult>("/alarms", filters);
  const [more, setMore] = useState<{
    base: AlarmResult;
    items: AlarmEvent[];
    cursor: string | null;
  }>();
  const [moreError, setMoreError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const abortRef = useRef<AbortController>();
  useEffect(() => {
    abortRef.current?.abort();
    setMore(undefined);
    setMoreError("");
    setLoadingMore(false);
    return () => abortRef.current?.abort();
  }, [filters, portal.key, query.data]);
  const current = more?.base === query.data ? more : undefined;
  const items = current?.items ?? query.data?.cleared.items ?? [];
  const cursor = current ? current.cursor : query.data?.cleared.next_cursor;
  async function showMore() {
    if (!cursor || loadingMore || !query.data) return;
    const abort = new AbortController();
    abortRef.current = abort;
    const base = query.data;
    setLoadingMore(true);
    setMoreError("");
    try {
      const params = scopeParams(portal);
      new URLSearchParams(filters).forEach((v, k) => params.append(k, v));
      params.set("cursor", cursor);
      const result = await responseJson(
        await portal.source.request("/alarms", params, abort.signal),
      );
      verifyScope(portal, result);
      if (!abort.signal.aborted) {
        const ids = new Set(items.map((r) => r.id));
        if (result.cleared.items.some((r: AlarmEvent) => ids.has(r.id)))
          throw new Error(
            "Alarm continuation repeated rows. Refresh this search.",
          );
        setMore({
          base,
          items: [...items, ...result.cleared.items],
          cursor: result.cleared.next_cursor,
        });
      }
    } catch (error) {
      if (!abort.signal.aborted)
        setMoreError(
          error instanceof Error
            ? error.message
            : "Unable to load more alarms.",
        );
    } finally {
      if (!abort.signal.aborted) setLoadingMore(false);
    }
  }
  return { ...query, items, cursor, showMore, loadingMore, moreError };
}
