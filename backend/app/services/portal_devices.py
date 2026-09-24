"""Canonical, scoped Device List read projection."""

from datetime import timedelta

from .organisation_dashboard import entity_id
from .portal_context import iso


EVENTS_TABLE = "`camosbase.camos_prod.events`"


class InvalidGatewayState(RuntimeError):
    """A persisted Gateway administrative state is outside its closed domain."""


def gateway_enabled(desired_state):
    if type(desired_state) is not int:
        raise InvalidGatewayState("Invalid persisted Gateway desired state")
    if desired_state == 0:
        return None
    if desired_state == 1:
        return False
    if desired_state == 2:
        return True
    raise InvalidGatewayState("Invalid persisted Gateway desired state")


class PortalDevices:
    def __init__(self, database, bigquery):
        self.database, self.bigquery = database, bigquery

    def read(self, scope):
        site_names = {site["id"]: site["name"] for site in scope.context["sites"]}
        site_filter = " AND d.site_id = %s" if scope.site_id else ""
        gateway_filter = " AND g.site_id = %s" if scope.site_id else ""
        device_params = [scope.identity.organisation_id]
        gateway_params = [scope.identity.organisation_id]
        if scope.site_id:
            device_params.append(int(scope.site_id))
            gateway_params.append(int(scope.site_id))

        with self.database.connection() as connection:
            cursor = connection.cursor()
            try:
                cursor.execute(
                    "SELECT d.id, d.site_id, d.name, d.enabled, d.analyzed_until "
                    "FROM public.devices d JOIN public.sites s ON s.id = d.site_id "
                    "WHERE s.organisation_id = %s" + site_filter + " ORDER BY d.id",
                    tuple(device_params),
                )
                devices = cursor.fetchall()
                cursor.execute(
                    "SELECT g.gateway_id, g.site_id, g.desired_state FROM public.gateways g "
                    "JOIN public.sites s ON s.id = g.site_id "
                    "WHERE s.organisation_id = %s" + gateway_filter + " ORDER BY g.site_id",
                    tuple(gateway_params),
                )
                gateways = cursor.fetchall()
            finally:
                cursor.close()

        counts = {}
        records_status = "available"
        try:
            clauses = ["organisation_id = @org"]
            params = {"org": scope.identity.organisation_id}
            if scope.site_id:
                clauses.append("site_id = @site")
                params["site"] = int(scope.site_id)
            if scope.identity.cutoff:
                clauses.append("timestamp <= @cutoff")
                params["cutoff"] = scope.identity.cutoff
            rows = self.bigquery.portal_rows(
                f"SELECT site_id, device_id, COUNT(*) AS record_count FROM {EVENTS_TABLE} "
                f"WHERE {' AND '.join(clauses)} GROUP BY site_id, device_id",
                params,
                # One bounded aggregate result set, including historical device ids
                # that still contribute to the canonical gateway/site population.
                limit=10_000,
            )
            counts = {
                (str(row["site_id"]), str(row["device_id"])): int(row["record_count"])
                for row in rows
            }
        except Exception:
            records_status = "unavailable"

        site_totals = {}
        for (site_id, _), count in counts.items():
            site_totals[site_id] = site_totals.get(site_id, 0) + count
        effective_now = scope.identity.cutoff
        items = []
        for device_id, site_id, name, enabled, analyzed_until in devices:
            sid, did = entity_id(site_id), entity_id(device_id)
            freshness = "unknown"
            if analyzed_until is not None and effective_now is not None:
                freshness = (
                    "fresh"
                    if analyzed_until >= effective_now - timedelta(minutes=15)
                    else "stale"
                )
            items.append(
                dict(
                    ref=f"device:{did}", kind="device", site_id=sid,
                    site_name=site_names[sid], name=name,
                    canonical_enabled=bool(enabled), analyzed_until=iso(analyzed_until),
                    freshness=freshness,
                    records=counts.get((sid, did)) if records_status == "available" else None,
                    records_status=records_status,
                )
            )
        for _, site_id, desired_state in gateways:
            enabled = gateway_enabled(desired_state)
            if enabled is None:
                continue
            sid = entity_id(site_id)
            items.append(
                dict(
                    ref=f"gateway:{sid}", kind="gateway", site_id=sid,
                    site_name=site_names[sid], name=f"Gateway {sid}",
                    canonical_enabled=enabled, analyzed_until=None,
                    freshness="unavailable",
                    records=site_totals.get(sid, 0) if records_status == "available" else None,
                    records_status=records_status,
                )
            )
        return dict(scope=scope.dto, records_status=records_status, items=items)
