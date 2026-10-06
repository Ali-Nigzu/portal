"""Canonical, read-only current Snapshot retrieval for a resolved Portal scope."""

from datetime import datetime, timezone

from .organisation_dashboard import entity_id


class ReportSnapshotNotFound(RuntimeError):
    pass


class InvalidReportSnapshot(RuntimeError):
    pass


class PortalReports:
    def __init__(self, database):
        self.database = database

    def read_snapshot(self, scope, *, allow_empty=False):
        organisation_id = scope.identity.organisation_id
        if scope.site_id is None:
            sql = (
                "SELECT o.id, o.name, os.ts, os.payload "
                "FROM public.organisations AS o "
                "JOIN public.organisation_snapshots AS os ON os.organisation_id = o.id "
                "WHERE o.id = %s"
            )
            parameters = (organisation_id,)
            selected_scope = "organisation"
        else:
            sql = (
                "SELECT s.id, s.name, ss.ts, ss.payload "
                "FROM public.sites AS s "
                "JOIN public.site_snapshots AS ss ON ss.site_id = s.id "
                "WHERE s.id = %s AND s.organisation_id = %s"
            )
            parameters = (int(scope.site_id), organisation_id)
            selected_scope = "site"
        with self.database.connection() as connection:
            cursor = connection.cursor()
            try:
                cursor.execute(sql, parameters)
                row = cursor.fetchone()
            finally:
                cursor.close()
        if row is None:
            if allow_empty:
                from .zero_snapshot import build_zero_scope_snapshot

                return {"scope": scope.dto, "snapshot": build_zero_scope_snapshot(scope)}
            raise ReportSnapshotNotFound()
        try:
            timestamp, payload = row[2], row[3]
            if not isinstance(timestamp, datetime) or timestamp.tzinfo is None:
                raise ValueError()
            if not isinstance(payload, dict):
                raise ValueError()
            if not isinstance(row[1], str) or not row[1].strip():
                raise ValueError()
            snapshot = {
                "scope": selected_scope,
                "entity_id": entity_id(row[0]),
                "entity_name": row[1],
                "ts": timestamp.astimezone(timezone.utc).isoformat(),
                "payload": dict(payload),
            }
        except (TypeError, ValueError, IndexError) as exc:
            raise InvalidReportSnapshot() from exc
        return {"scope": scope.dto, "snapshot": snapshot}
