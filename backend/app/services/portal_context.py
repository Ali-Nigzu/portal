"""Authorised identity, bulk metadata and clock; no module business datasets."""

from dataclasses import dataclass
from datetime import datetime, timezone
import base64
import hashlib
import json

from .organisation_dashboard import EntityNotFound, entity_id


def instant(value):
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            raise ValueError()
        return parsed.astimezone(timezone.utc)
    except (AttributeError, TypeError, ValueError):
        raise ValueError("A timezone-aware ISO timestamp is required") from None


def iso(value):
    if value is None:
        return None
    if not isinstance(value, datetime) or value.tzinfo is None:
        raise RuntimeError("Invalid stored timestamp")
    return value.astimezone(timezone.utc).isoformat()


@dataclass(frozen=True)
class PortalIdentity:
    organisation_id: int
    cutoff: datetime | None = None
    time_zone: str = "Europe/London"


class PortalMetadata:
    def __init__(self, database, dashboard):
        self.database, self.dashboard = database, dashboard

    def load(self, identity):
        context = self.dashboard.load_organisation_context(identity.organisation_id)
        with self.database.connection() as connection:
            cursor = connection.cursor()
            try:
                cursor.execute(
                    "SELECT d.id, d.site_id, d.name, d.analyzed_until FROM public.devices d "
                    "JOIN public.sites s ON s.id = d.site_id WHERE s.organisation_id = %s ORDER BY d.id",
                    (identity.organisation_id,),
                )
                sources = [
                    dict(
                        ref=f"device:{entity_id(r[0])}",
                        kind="device",
                        site_id=entity_id(r[1]),
                        label=r[2],
                        analyzed_until=iso(r[3]),
                    )
                    for r in cursor.fetchall()
                ]
                cursor.execute(
                    "SELECT g.gateway_id, g.site_id FROM public.gateways g "
                    "JOIN public.sites s ON s.id = g.site_id WHERE s.organisation_id = %s ORDER BY g.site_id",
                    (identity.organisation_id,),
                )
                gateways = {
                    f"gateway:{entity_id(r[1])}": str(r[0]) for r in cursor.fetchall()
                }
                sources += [
                    dict(
                        ref=ref,
                        kind="gateway",
                        site_id=ref.split(":")[1],
                        label=f"Gateway {ref.split(':')[1]}",
                        analyzed_until=None,
                    )
                    for ref in gateways
                ]
            finally:
                cursor.close()
        context["sources"] = sources
        now = datetime.now(timezone.utc)
        context["clock"] = dict(
            server_now=iso(now),
            effective_now=iso(identity.cutoff or now),
            time_zone=identity.time_zone,
        )
        return context, gateways


@dataclass
class PortalScope:
    identity: PortalIdentity
    context: dict
    gateways: dict
    site_id: str | None
    sources: list

    @classmethod
    def resolve(cls, identity, metadata, site_id=None, sources=()):
        context, gateways = metadata.load(identity)
        if site_id is not None:
            site_id = entity_id(site_id)
            if not any(s["id"] == site_id for s in context["sites"]):
                raise EntityNotFound()
        catalogue = {
            s["ref"]: s
            for s in context["sources"]
            if site_id is None or s["site_id"] == site_id
        }
        if any(ref not in catalogue for ref in sources):
            raise EntityNotFound()
        return cls(
            identity,
            context,
            gateways,
            site_id,
            [catalogue[r] for r in sorted(set(sources))],
        )

    @property
    def dto(self):
        return dict(
            organisation_id=entity_id(self.identity.organisation_id),
            site_id=self.site_id,
        )


def query_key(scope, filters):
    # Cursor binding is integrity against accidental reuse, not authorisation.
    # Every request independently revalidates all scope and source predicates.
    value = [scope.dto, sorted(s["ref"] for s in scope.sources), filters]
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, default=str).encode()
    ).hexdigest()


def encode_cursor(key, timestamp, row_id, cutoff):
    return (
        base64.urlsafe_b64encode(
            json.dumps(
                dict(key=key, ts=iso(timestamp), id=str(row_id), cutoff=iso(cutoff))
            ).encode()
        )
        .decode()
        .rstrip("=")
    )


def decode_cursor(value, key, current_cutoff):
    try:
        if len(value) > 2048:
            raise ValueError()
        data = json.loads(
            base64.b64decode(
                value + "=" * (-len(value) % 4), altchars=b"-_", validate=True
            )
        )
        if set(data) != {"key", "ts", "id", "cutoff"} or data["key"] != key:
            raise ValueError()
        timestamp = instant(data["ts"])
        cutoff = instant(data["cutoff"]) if data["cutoff"] else None
        if current_cutoff is not None and (cutoff is None or cutoff > current_cutoff):
            raise ValueError()
        if current_cutoff is None and cutoff is not None:
            raise ValueError()
        if not isinstance(data["id"], str) or not data["id"] or len(data["id"]) > 256:
            raise ValueError()
        return timestamp, data["id"], cutoff
    except (ValueError, TypeError, KeyError, json.JSONDecodeError):
        raise ValueError("Invalid continuation for this search") from None


def date_filters(start=None, end=None):
    start = instant(start) if start else None
    end = instant(end) if end else None
    if start and end and start >= end:
        raise ValueError("Start must be before end")
    return start, end
