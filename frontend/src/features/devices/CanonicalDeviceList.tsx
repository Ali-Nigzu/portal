import { usePortal } from "../../context/PortalContext";
import "./DeviceListPage.css";
export default function CanonicalDeviceList() {
  const { context, selection, retry } = usePortal();
  const sources = context!.sources.filter(
    (s) => selection?.scope !== "site" || s.site_id === selection.id,
  );
  const name =
    selection?.scope === "site"
      ? context!.sites.find((s) => s.id === selection.id)?.name
      : context!.organisation.name;
  return (
    <div className="device-runtime-page">
      <header className="device-runtime-header">
        <h1 className="device-runtime-title">Device List</h1>
      </header>
      <span className="device-runtime-scope-pill">{name}</span>
      <div className="vrm-card">
        <div className="vrm-card-header">
          <h3>Sources ({sources.length})</h3>
          <button className="vrm-btn" onClick={retry}>
            Refresh
          </button>
        </div>
        <div className="vrm-table-scroll">
          <table className="vrm-table">
            <thead>
              <tr>
                <th>Site</th>
                <th>Source</th>
                <th>Type</th>
                <th>Analyzed until</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.ref}>
                  <td>
                    {context!.sites.find((site) => site.id === s.site_id)?.name}
                  </td>
                  <td>{s.label}</td>
                  <td>{s.kind === "gateway" ? "Gateway" : "Device"}</td>
                  <td>
                    {s.analyzed_until
                      ? new Date(s.analyzed_until).toLocaleString()
                      : "Unavailable"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!sources.length && (
          <p className="vrm-card-body">No sources in this scope.</p>
        )}
      </div>
    </div>
  );
}
