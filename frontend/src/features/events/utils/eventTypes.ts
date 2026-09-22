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
