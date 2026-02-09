import type { SnapshotResponse } from "../../../lib/snapshots";

export const fetchDemoLatestSnapshot = async (): Promise<SnapshotResponse> => {
  const response = await fetch("/api/demo/snapshots/latest", {
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Snapshot fetch failed: ${response.status} ${text}`);
  }
  return (await response.json()) as SnapshotResponse;
};
