"""Relational identity and canonical Snapshot reads, independent of app mode."""

import hashlib
import math
import re
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from typing import Literal


class EntityNotFound(RuntimeError):
    pass


class InvalidSnapshot(RuntimeError):
    pass


def build_zero_organisation_snapshot(organisation_id, organisation_name, timestamp=None):
    """Build a transient Dashboard projection for a real organisation with no Sites."""
    from .zero_snapshot import build_zero_snapshot

    return build_zero_snapshot(
        "organisation", organisation_id, organisation_name,
        timestamp or datetime.now(timezone.utc),
    )


def entity_id(value):
    # Decimal serialization preserves PostgreSQL bigint identity in JavaScript.
    if isinstance(value, bool) or not re.fullmatch(r"[1-9][0-9]*", str(value)):
        raise ValueError("Invalid entity ID")
    if int(value) > 9223372036854775807:
        raise ValueError("Invalid entity ID")
    return str(value)


def slug(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", name).casefold()
    normalized = "".join(c for c in normalized if not unicodedata.combining(c))
    return re.sub(r"[\W_]+", "-", normalized, flags=re.UNICODE).strip("-") or "unnamed"


def site_slugs(sites):
    """Resolve normalization collisions using names, never database IDs/history."""
    bases = [slug(site["name"]) for site in sites]
    frequencies = Counter(bases)
    for site, base in zip(sites, bases):
        site["slug"] = base if frequencies[base] == 1 else (
            base + "-" + hashlib.sha256(site["name"].encode("utf-8")).hexdigest()
        )
    return sites


def _usable_payload(payload, scope):
    """Guard the existing SnapshotPayload consumed by Dashboard projections.

    This is a read-time check only. Admin JSONB writes remain unrestricted.
    Fixed rolling arrays, occupancy triples, capacity pairs and traffic widths
    follow projection.ts/types.ts; rollup demographics/ranges follow ReportsEngine.
    No freshness limit, capacity cap or fixed all_time length is introduced.
    """

    def numbers(value, length=None):
        return (
            isinstance(value, list)
            and (length is None or len(value) == length)
            and all(type(v) in (int, float) and math.isfinite(v) for v in value)
        )

    def occupancy(value, length=None):
        return (
            isinstance(value, list)
            and (length is None or len(value) == length)
            and all(
                numbers(bucket, 3) and bucket[1] <= bucket[0] <= bucket[2]
                for bucket in value
            )
        )

    try:
        if not isinstance(payload, dict):
            return False
        if not all(
            numbers(payload.get(k), 96)
            for k in ("entrances_96", "exits_96", "footfall_96", "dwell_time_96")
        ):
            return False
        if not occupancy(payload.get("occupancy_96"), 96):
            return False
        capacity = payload.get("capacity")
        if (
            not isinstance(capacity, list)
            or len(capacity) != 96
            or not all(numbers(v, 2) for v in capacity)
        ):
            return False
        traffic = payload.get("traffic_devices")
        if not isinstance(traffic, list):
            return False
        entity_key = "site_id" if scope == "organisation" else "device_id"
        for entity in traffic:
            if not isinstance(entity, dict) or not isinstance(entity.get("name"), str):
                return False
            entity_id(entity.get(entity_key))
        split = payload.get("traffic_split_96")
        if (
            not isinstance(split, list)
            or len(split) != 96
            or not all(numbers(v, len(traffic)) for v in split)
        ):
            return False
        for period in (
            "today",
            "yesterday",
            "week",
            "month",
            "quarter",
            "year",
            "all_time",
        ):
            rollup = payload.get(period)
            if not isinstance(rollup, dict):
                return False
            if (
                not numbers(rollup.get("entrances"))
                or not numbers(rollup.get("exits"))
                or not occupancy(rollup.get("occupancy"))
            ):
                return False
            for key, length in (("age_pct", 6), ("sex_pct", 2)):
                percentages = rollup.get(key)
                if not numbers(percentages, length) or sum(percentages) not in (0, 100):
                    return False
        return True
    except (ValueError, TypeError, OverflowError):
        return False


class OrganisationDashboard:
    def __init__(self, database):
        self.database = database

    def load_organisation_context(self, organisation_id: int):
        with self.database.connection() as connection:
            return self._load_organisation_context(connection, organisation_id)

    def _load_organisation_context(self, connection, organisation_id: int):
        cursor = connection.cursor()
        try:
            cursor.execute(
                "SELECT id, name, enabled FROM public.organisations WHERE id = %s",
                (organisation_id,),
            )
            organisation = cursor.fetchone()
            if organisation is None:
                raise EntityNotFound()
            cursor.execute(
                "SELECT s.id, s.name, s.organisation_id, s.enabled, s.max_capacity, "
                "EXISTS (SELECT 1 FROM public.devices AS d WHERE d.site_id = s.id "
                "AND d.analyzed_until >= CURRENT_TIMESTAMP - INTERVAL '15 minutes') AS realtime "
                "FROM public.sites AS s WHERE s.organisation_id = %s ORDER BY s.id",
                (organisation_id,),
            )
            sites = [
                dict(id=entity_id(row[0]), name=row[1], organisation_id=entity_id(row[2]),
                     enabled=row[3], max_capacity=row[4], realtime=bool(row[5]))
                for row in cursor.fetchall()
            ]
            return {
                "organisation": dict(id=entity_id(organisation[0]), name=organisation[1],
                                     enabled=organisation[2], slug=slug(organisation[1]),
                                     realtime=any(site["realtime"] for site in sites)),
                "sites": site_slugs(sites),
            }
        finally:
            cursor.close()

    def load_organisation_snapshot(self, organisation_id: int, *, zero_scope=None):
        try:
            snapshot = self._snapshot(
                "SELECT o.id, o.name, os.ts, os.payload FROM public.organisations AS o "
                "JOIN public.organisation_snapshots AS os ON os.organisation_id = o.id "
                "WHERE o.id = %s", (organisation_id,), "organisation", missing_ok=True, validate_payload=zero_scope is not None,
            )
        except InvalidSnapshot:
            if zero_scope is None:
                raise
            snapshot = None
        if snapshot is not None:
            return snapshot
        if zero_scope is not None:
            return self._zero_snapshot(organisation_id, None, zero_scope)
        context = self.load_organisation_context(organisation_id)
        if context["sites"]:
            raise EntityNotFound()
        organisation = context["organisation"]
        return build_zero_organisation_snapshot(organisation["id"], organisation["name"])

    def load_site_snapshot(self, organisation_id: int, site_id: int, *, zero_scope=None):
        try:
            snapshot = self._snapshot(
                "SELECT s.id, s.name, ss.ts, ss.payload FROM public.sites AS s "
                "JOIN public.site_snapshots AS ss ON ss.site_id = s.id "
                "WHERE s.id = %s AND s.organisation_id = %s",
                (site_id, organisation_id), "site", missing_ok=zero_scope is not None, validate_payload=zero_scope is not None,
            )
        except InvalidSnapshot:
            if zero_scope is None:
                raise
            snapshot = None
        if snapshot is not None:
            return snapshot
        return self._zero_snapshot(organisation_id, site_id, zero_scope)

    @staticmethod
    def _zero_snapshot(organisation_id, site_id, scope):
        from .zero_snapshot import build_zero_scope_snapshot

        if (scope.identity.organisation_id != organisation_id
                or scope.site_id != (entity_id(site_id) if site_id is not None else None)):
            raise EntityNotFound()
        return build_zero_scope_snapshot(scope)

    def _snapshot(self, sql, parameters, scope: Literal["organisation", "site"], missing_ok=False, validate_payload=False):
        with self.database.connection() as connection:
            cursor = connection.cursor()
            try:
                cursor.execute(sql, parameters)
                row = cursor.fetchone()
            finally:
                cursor.close()
        if row is None:
            if missing_ok:
                return None
            raise EntityNotFound()
        try:
            ts = row[2]
            payload = row[3]
            if not isinstance(ts, datetime) or ts.tzinfo is None:
                raise ValueError("Snapshot timestamp must be timezone aware")
            if not isinstance(payload, dict):
                raise ValueError("Snapshot payload must be a JSON object")
            if validate_payload and not _usable_payload(payload, scope):
                raise ValueError("Snapshot payload is unusable for Dashboard")
            return dict(scope=scope, entity_id=entity_id(row[0]), entity_name=row[1],
                        ts=ts.astimezone(timezone.utc).isoformat(), payload=dict(payload))
        except (ValueError, TypeError) as exc:
            raise InvalidSnapshot() from exc
