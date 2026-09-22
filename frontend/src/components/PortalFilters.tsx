import { usePortal } from "../context/PortalContext";
import DevicesMultiSelect from "../features/events/components/DevicesMultiSelect";
import "../features/events/EventLogsPage.css";
export type Filters = {
  sources: string[];
  start: string;
  end: string;
  severity?: string;
  event?: string;
  sex?: string;
  age?: string;
  event_id?: string;
};
export const emptyFilters: Filters = { sources: [], start: "", end: "" };
export function filterParams(filters: Filters) {
  const params = new URLSearchParams();
  filters.sources.forEach((source) => params.append("source", source));
  for (const [key, value] of Object.entries(filters))
    if (key !== "sources" && value)
      params.set(
        key,
        key === "start" || key === "end"
          ? new Date(String(value)).toISOString()
          : String(value),
      );
  return params;
}
export function PortalFilters({
  value,
  onChange,
  alarms = false,
}: {
  value: Filters;
  onChange: (value: Filters) => void;
  alarms?: boolean;
}) {
  const { context, selection } = usePortal();
  const sites = context!.sites.filter(
    (s) => selection?.scope !== "site" || s.id === selection.id,
  );
  const select = (key: keyof Filters, label: string, options: string[][]) => (
    <label className="vrm-label">
      {label}
      <select
        aria-label={label}
        className="vrm-input"
        value={String(value[key] ?? "")}
        onChange={(e) => onChange({ ...value, [key]: e.target.value })}
      >
        <option value="">All</option>
        {options.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="portal-filter-grid">
      <div>
        <label className="vrm-label" htmlFor="portal-sources">
          Sources
        </label>
        <DevicesMultiSelect
          id="portal-sources"
          value={value.sources}
          onChange={(sources) => onChange({ ...value, sources })}
          options={sites.flatMap((site) =>
            context!.sources
              .filter((s) => s.site_id === site.id)
              .map((s) => ({
                token: s.ref,
                label: s.label,
                group:
                  selection?.scope === "organisation" ? site.name : undefined,
              })),
          )}
        />
      </div>
      <label className="vrm-label">
        From (local time)
        <input
          className="vrm-input"
          type="datetime-local"
          value={value.start}
          onChange={(e) => onChange({ ...value, start: e.target.value })}
        />
      </label>
      <label className="vrm-label">
        Before (local time)
        <input
          className="vrm-input"
          type="datetime-local"
          value={value.end}
          onChange={(e) => onChange({ ...value, end: e.target.value })}
        />
      </label>
      {alarms ? (
        select("severity", "Severity", [
          ["low", "Low"],
          ["medium", "Medium"],
          ["high", "High"],
        ])
      ) : (
        <>
          {select("event", "Event Type", [
            ["entrance", "Entrance"],
            ["exit", "Exit"],
          ])}
          {select("sex", "Sex", [
            ["male", "Male"],
            ["female", "Female"],
          ])}
          {select(
            "age",
            "Age",
            ["0–4", "5–13", "14–25", "26–45", "46–65", "66+"].map(
              (label, i) => [String(i), label],
            ),
          )}
          <label className="vrm-label">
            Event ID
            <input
              className="vrm-input"
              value={value.event_id ?? ""}
              onChange={(e) => onChange({ ...value, event_id: e.target.value })}
            />
          </label>
        </>
      )}
    </div>
  );
}
