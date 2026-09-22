import { useEffect, useState } from "react";
import {
  responseJson,
  scopeParams,
  usePortal,
  verifyScope,
} from "./PortalContext";

export function usePortalQuery<T>(path: string, filters: string) {
  const portal = usePortal();
  const [revision, setRevision] = useState(0);
  const key = `${portal.key}:${portal.context?.clock.effective_now}:${path}:${filters}:${revision}`;
  const [result, setResult] = useState<{
    key: string;
    data?: T;
    error?: string;
  }>();
  useEffect(() => {
    const abort = new AbortController();
    setResult(undefined);
    Promise.resolve().then(async () => {
      if (abort.signal.aborted) return;
      try {
        const params = scopeParams(portal);
        new URLSearchParams(filters).forEach((v, k) => params.append(k, v));
        const data = await responseJson(
          await portal.source.request(path, params, abort.signal),
        );
        verifyScope(portal, data);
        if (!abort.signal.aborted) setResult({ key, data });
      } catch (error) {
        if (!abort.signal.aborted)
          setResult({
            key,
            error: error instanceof Error ? error.message : "Data unavailable.",
          });
      }
    });
    return () => abort.abort();
  }, [key, portal.source]);
  return {
    data: result?.key === key ? result.data : undefined,
    error: result?.key === key ? result.error : undefined,
    loading: result?.key !== key,
    retry: () => setRevision((v) => v + 1),
  };
}
