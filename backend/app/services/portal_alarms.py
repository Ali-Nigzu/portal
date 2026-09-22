"""Read-only canonical alarms: active rows and ten-row cleared continuations."""

from .organisation_dashboard import entity_id
from .portal_context import date_filters, decode_cursor, encode_cursor, iso, query_key

FROM = """ FROM public.alarms a
JOIN public.sites s ON s.id = a.site_id AND s.organisation_id = a.organisation_id
LEFT JOIN public.devices d ON d.id = a.device_id AND d.site_id = a.site_id
LEFT JOIN public.gateways g ON g.gateway_id = a.gateway_id AND g.site_id = a.site_id """
SELECT = "SELECT a.id, a.site_id, s.name, a.alarm_type, a.severity, a.started_at, a.cleared_at, a.device_id, d.name, g.site_id"


class AlarmLogs:
    def __init__(self, database):
        self.database = database

    def search(self, scope, filters, cursor=None):
        start, end = date_filters(filters.get("start"), filters.get("end"))
        severity = filters.get("severity")
        if severity and severity not in ("low", "medium", "high"):
            raise ValueError("Invalid severity")
        key = query_key(scope, filters)
        cutoff = scope.identity.cutoff
        continuation = decode_cursor(cursor, key, cutoff) if cursor else None
        if continuation:
            cutoff = continuation[2]
            entity_id(continuation[1])
        clauses, params = ["a.organisation_id = %s"], [scope.identity.organisation_id]
        if scope.site_id:
            clauses.append("a.site_id = %s")
            params.append(int(scope.site_id))
        for value, clause in (
            (start, "a.started_at >= %s"),
            (end, "a.started_at < %s"),
            (cutoff, "a.started_at <= %s"),
            (severity, "a.severity = %s"),
        ):
            if value:
                clauses.append(clause)
                params.append(value)
        if scope.sources:
            parts = []
            for source in scope.sources:
                if source["kind"] == "device":
                    parts.append("a.device_id = %s")
                    params.append(int(source["ref"].split(":")[1]))
                else:
                    parts.append("a.gateway_id = %s")
                    params.append(scope.gateways[source["ref"]])
            clauses.append("(" + " OR ".join(parts) + ")")
        where = " WHERE " + " AND ".join(clauses)
        result = dict(scope=scope.dto, effective_now=iso(cutoff))
        with self.database.connection() as connection:
            db = connection.cursor()
            try:
                db.execute(
                    "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
                )
                if not cursor:
                    db.execute(
                        "SELECT COUNT(*) FILTER (WHERE a.cleared_at IS NULL), "
                        "COUNT(*) FILTER (WHERE a.cleared_at IS NOT NULL)"
                        + FROM
                        + where,
                        tuple(params),
                    )
                    active, cleared = db.fetchone()
                    result["counts"] = dict(active=active, cleared=cleared)
                    # Active lists are usually tiny; fail explicitly rather than return an unbounded response.
                    db.execute(
                        SELECT
                        + FROM
                        + where
                        + " AND a.cleared_at IS NULL ORDER BY a.started_at DESC, a.id DESC LIMIT 1001",
                        tuple(params),
                    )
                    rows = db.fetchall()
                    if len(rows) > 1000:
                        raise ValueError(
                            "More than 1,000 active alarms. Narrow the filters."
                        )
                    result["active"] = dict(items=[self.present(r) for r in rows])
                cleared_where = where + " AND a.cleared_at IS NOT NULL"
                if continuation:
                    cleared_where += (
                        " AND (a.started_at < %s OR (a.started_at = %s AND a.id < %s))"
                    )
                    params += [continuation[0], continuation[0], int(continuation[1])]
                db.execute(
                    SELECT
                    + FROM
                    + cleared_where
                    + " ORDER BY a.started_at DESC, a.id DESC LIMIT 11",
                    tuple(params),
                )
                rows = db.fetchall()
                db.execute("COMMIT")
            except Exception:
                db.execute("ROLLBACK")
                raise
            finally:
                db.close()
        visible = rows[:10]
        next_cursor = (
            encode_cursor(key, visible[-1][5], visible[-1][0], cutoff)
            if len(rows) > 10
            else None
        )
        result["cleared"] = dict(
            items=[self.present(r) for r in visible],
            next_cursor=next_cursor,
            has_more=next_cursor is not None,
        )
        return result

    @staticmethod
    def present(row):
        (
            alarm_id,
            site_id,
            site_name,
            kind,
            severity,
            started,
            cleared,
            device_id,
            device_name,
            gateway_site,
        ) = row
        device = device_id is not None
        ref = f"device:{device_id}" if device else f"gateway:{site_id}"
        label = (
            (device_name or "Unavailable device")
            if device
            else (
                f"Gateway {gateway_site}"
                if gateway_site is not None
                else "Unavailable gateway"
            )
        )
        return dict(
            id=str(alarm_id),
            site=dict(id=str(site_id), name=site_name),
            source=dict(ref=ref, kind="device" if device else "gateway", label=label),
            type=dict(
                code=kind, label=kind.replace("_", " ") if kind else "Unknown alarm"
            ),
            severity=severity,
            status="active" if cleared is None else "cleared",
            started_at=iso(started),
            cleared_at=iso(cleared),
        )
