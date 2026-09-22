"""Canonical Event reads. No analytics/Snapshot dependency."""

import csv
import io
from .portal_context import date_filters, decode_cursor, encode_cursor, iso, query_key

TABLE = "`camosbase.camos_prod.events`"
AGES = ["0–4", "5–13", "14–25", "26–45", "46–65", "66+"]
EVENTS = [("exit", "Exit"), ("entrance", "Entrance")]
SEXES = [("male", "Male"), ("female", "Female")]


class InvalidEventData(RuntimeError):
    pass


def enum(value, options):
    return (
        dict(zip(("value", "label"), options[value]))
        if type(value) is int and 0 <= value < len(options)
        else dict(value="unknown", label="Unknown")
    )


class EventLogs:
    def __init__(self, bigquery):
        self.bigquery = bigquery

    def specification(self, scope, filters, cursor=None):
        start, end = date_filters(filters.get("start"), filters.get("end"))
        params = {"org": scope.identity.organisation_id}
        clauses = ["organisation_id = @org"]
        key = query_key(scope, filters)
        cutoff = scope.identity.cutoff
        continuation = decode_cursor(cursor, key, cutoff) if cursor else None
        if continuation:
            cutoff = continuation[2]
        if scope.site_id:
            clauses.append("site_id = @site")
            params["site"] = int(scope.site_id)
        for name, value, operator in (
            ("start", start, ">="),
            ("end", end, "<"),
            ("cutoff", cutoff, "<="),
        ):
            if value:
                clauses.append(f"timestamp {operator} @{name}")
                params[name] = value
        source_clauses = []
        for kind, column, name in (
            ("device", "device_id", "devices"),
            ("gateway", "site_id", "gateways"),
        ):
            ids = [
                int(s["ref"].split(":")[1]) for s in scope.sources if s["kind"] == kind
            ]
            if ids:
                source_clauses.append(f"{column} IN UNNEST(@{name})")
                params[name] = ids
        if source_clauses:
            clauses.append("(" + " OR ".join(source_clauses) + ")")
        for name, options, column in (
            ("event", [v[0] for v in EVENTS], "event"),
            ("sex", [v[0] for v in SEXES], "sex"),
            ("age", [str(i) for i in range(6)], "age_bucket"),
        ):
            value = filters.get(name)
            if value:
                if value not in options:
                    raise ValueError(f"Invalid {name}")
                params[name] = options.index(value)
                clauses.append(f"{column} = @{name}")
        event_id = filters.get("event_id")
        if event_id:
            if len(event_id) > 256:
                raise ValueError("Event ID is too long")
            clauses.append("event_id = @event_id")
            params["event_id"] = event_id
        return clauses, params, key, cutoff, continuation

    def search(self, scope, filters, *, cursor=None, page_size=20):
        if not 1 <= page_size <= 100:
            raise ValueError("Page size must be between 1 and 100")
        clauses, params, key, cutoff, continuation = self.specification(
            scope, filters, cursor
        )
        total = None
        if not cursor:
            # Validate uniqueness/non-nullness for the actual search before keyset paging.
            rows = self.bigquery.portal_rows(
                f"SELECT COUNT(*) AS total, COUNT(DISTINCT event_id) AS unique_ids FROM {TABLE} WHERE "
                + " AND ".join(clauses),
                params,
                limit=1,
            )
            total = int(rows[0]["total"])
            if total != int(rows[0]["unique_ids"]):
                raise InvalidEventData("Event IDs must be unique and non-null")
        if continuation:
            clauses.append(
                "(timestamp < @last_ts OR (timestamp = @last_ts AND event_id < @last_id))"
            )
            params.update(last_ts=continuation[0], last_id=continuation[1])
        params["limit"] = page_size + 1
        rows = self.bigquery.portal_rows(
            f"SELECT site_id, device_id, event_id, event, timestamp, sex, age_bucket FROM {TABLE} WHERE "
            + " AND ".join(clauses)
            + " ORDER BY timestamp DESC, event_id DESC LIMIT @limit",
            params,
            limit=page_size + 1,
        )
        visible = rows[:page_size]
        next_cursor = (
            encode_cursor(
                key, visible[-1]["timestamp"], visible[-1]["event_id"], cutoff
            )
            if len(rows) > page_size
            else None
        )
        lookups = self.lookups(scope)
        return dict(
            scope=scope.dto,
            effective_now=iso(cutoff),
            items=[self.present(scope, r, lookups) for r in visible],
            total=total,
            page=dict(size=page_size, next_cursor=next_cursor),
        )

    @staticmethod
    def lookups(scope):
        sites = {s["id"]: s["name"] for s in scope.context["sites"]}
        devices = {
            s["ref"]: s for s in scope.context["sources"] if s["kind"] == "device"
        }
        return sites, devices

    @staticmethod
    def present(scope, row, lookups=None):
        sites, devices = lookups if lookups is not None else EventLogs.lookups(scope)
        site_id, ref = str(row["site_id"]), f"device:{row['device_id']}"
        source = devices.get(ref)
        return dict(
            event_id=row["event_id"],
            site=dict(id=site_id, name=sites.get(site_id, "Unavailable site")),
            source=dict(
                ref=ref,
                kind="device",
                label=(
                    source["label"]
                    if source and source["site_id"] == site_id
                    else "Unavailable device"
                ),
            ),
            timestamp=iso(row["timestamp"]),
            event=enum(row["event"], EVENTS),
            sex=enum(row["sex"], SEXES),
            age=enum(
                row["age_bucket"], [(str(i), label) for i, label in enumerate(AGES)]
            ),
        )

    def export(self, scope, filters, limit=100000):
        clauses, params, _, _, _ = self.specification(scope, filters)
        # One bounded result prevents count/page races from silently truncating a CSV.
        params["limit"] = limit + 1
        rows = self.bigquery.portal_rows(
            f"SELECT site_id, device_id, event_id, event, timestamp, sex, age_bucket FROM {TABLE} WHERE "
            + " AND ".join(clauses)
            + " ORDER BY timestamp DESC, event_id DESC LIMIT @limit",
            params,
            limit=limit + 1,
        )
        if len(rows) > limit:
            raise ValueError("Export exceeds 100,000 rows. Narrow the filters.")
        lookups = self.lookups(scope)

        def chunks():
            buffer = io.StringIO()
            writer = csv.writer(buffer)
            writer.writerow(
                ["Event ID", "Site", "Source", "Event Type", "Timestamp", "Sex", "Age"]
            )
            yield buffer.getvalue()
            for row in rows:
                value = self.present(scope, row, lookups)
                fields = [
                    value["event_id"],
                    value["site"]["name"],
                    value["source"]["label"],
                    value["event"]["label"],
                    value["timestamp"],
                    value["sex"]["label"],
                    value["age"]["label"],
                ]
                buffer.seek(0)
                buffer.truncate()
                writer.writerow(
                    [
                        (
                            "'" + str(v)
                            if str(v).lstrip().startswith(("=", "+", "-", "@"))
                            or str(v).startswith(("\t", "\r", "\n"))
                            else v
                        )
                        for v in fields
                    ]
                )
                yield buffer.getvalue()

        return chunks()
