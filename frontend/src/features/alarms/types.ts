export type AlarmEvent = {
  id: string;
  site: { id: string; name: string };
  source: { ref: string; kind: "device" | "gateway"; label: string };
  type: { code: string; label: string };
  severity: "low" | "medium" | "high";
  status: "active" | "cleared";
  started_at: string;
  cleared_at: string | null;
};
export type AlarmResult = {
  counts?: { active: number; cleared: number };
  active?: { items: AlarmEvent[] };
  cleared: {
    items: AlarmEvent[];
    next_cursor: string | null;
    has_more: boolean;
  };
};
export interface AlarmUser {
  role: "admin" | "client";
  name: string;
  csv_url?: string;
}
