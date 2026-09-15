"""Relational identity and canonical Snapshot reads, independent of app mode."""

import hashlib
import re
import unicodedata
from datetime import datetime, timezone
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Number = Annotated[float, Field(strict=True, ge=0, allow_inf_nan=False)]
Series96 = Annotated[list[Number], Field(min_length=96, max_length=96)]


class CanonicalModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Rollup(CanonicalModel):
    entrances: list[Number]
    occupancy: list[tuple[Number, Number, Number]]
    exits: list[Number]
    age_pct: Annotated[list[Number], Field(min_length=6, max_length=6)]
    sex_pct: Annotated[list[Number], Field(min_length=2, max_length=2)]

    @model_validator(mode="after")
    def aligned(self):
        if len(self.entrances) != len(self.occupancy) or len(self.exits) != len(self.entrances):
            raise ValueError("Rollup series must align")
        if any(value > 100 for value in self.age_pct + self.sex_pct):
            raise ValueError("Invalid demographic percentage")
        return self


def entity_id(value):
    # Decimal serialization preserves PostgreSQL bigint identity in JavaScript.
    if isinstance(value, bool) or not re.fullmatch(r"[1-9][0-9]*", str(value)):
        raise ValueError("Invalid entity ID")
    if int(value) > 9223372036854775807:
        raise ValueError("Invalid entity ID")
    return str(value)


class DeviceAxis(CanonicalModel):
    device_id: str
    name: str
    _id = field_validator("device_id", mode="before")(entity_id)


class SiteAxis(CanonicalModel):
    site_id: str
    name: str
    _id = field_validator("site_id", mode="before")(entity_id)


class SnapshotPayload(CanonicalModel):
    entrances_96: Series96
    occupancy_96: Series96
    exits_96: Series96
    footfall_96: Series96
    dwell_time_96: Series96
    traffic_devices: list[DeviceAxis | SiteAxis]
    traffic_split_96: Annotated[list[list[Number]], Field(min_length=96, max_length=96)]
    capacity: Annotated[list[tuple[Number, Number]], Field(min_length=96, max_length=96)]
    today: Rollup
    yesterday: Rollup
    week: Rollup
    month: Rollup
    quarter: Rollup
    year: Rollup
    all_time: Rollup

    @model_validator(mode="after")
    def dimensions(self):
        width = len(self.traffic_devices)
        if any(len(row) != width or any(v > 100 for v in row) for row in self.traffic_split_96):
            raise ValueError("Traffic matrix must align with its axis")
        for key, length in (("yesterday", 24), ("week", 7), ("month", 4), ("quarter", 12), ("year", 12)):
            if len(getattr(self, key).entrances) != length:
                raise ValueError("Invalid period length")
        if len(self.today.entrances) > 24:
            raise ValueError("Invalid today length")
        return self


class EntityNotFound(RuntimeError):
    pass


class InvalidSnapshot(RuntimeError):
    pass


def slug(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", name).casefold()
    normalized = "".join(c for c in normalized if not unicodedata.combining(c))
    return re.sub(r"[\W_]+", "-", normalized, flags=re.UNICODE).strip("-") or "unnamed"


def site_slugs(sites):
    """Resolve normalization collisions using names, never database IDs/history."""
    bases = [slug(site["name"]) for site in sites]
    for site, base in zip(sites, bases):
        site["slug"] = base if bases.count(base) == 1 else (
            base + "-" + hashlib.sha256(site["name"].encode("utf-8")).hexdigest()
        )
    return sites


class OrganisationDashboard:
    def __init__(self, database):
        self.database = database

    def load_organisation_context(self, organisation_id: int):
        with self.database.connection() as connection:
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
                    "SELECT id, name, organisation_id, enabled, max_capacity "
                    "FROM public.sites WHERE organisation_id = %s ORDER BY id",
                    (organisation_id,),
                )
                sites = [
                    dict(id=entity_id(row[0]), name=row[1], organisation_id=entity_id(row[2]),
                         enabled=row[3], max_capacity=row[4])
                    for row in cursor.fetchall()
                ]
                return {
                    "organisation": dict(id=entity_id(organisation[0]), name=organisation[1],
                                         enabled=organisation[2], slug=slug(organisation[1])),
                    "sites": site_slugs(sites),
                }
            finally:
                cursor.close()

    def load_organisation_snapshot(self, organisation_id: int):
        return self._snapshot(
            "SELECT o.id, o.name, os.ts, os.payload FROM public.organisations AS o "
            "JOIN public.organisation_snapshots AS os ON os.organisation_id = o.id "
            "WHERE o.id = %s", (organisation_id,), "organisation",
        )

    def load_site_snapshot(self, organisation_id: int, site_id: int):
        return self._snapshot(
            "SELECT s.id, s.name, ss.ts, ss.payload FROM public.sites AS s "
            "JOIN public.site_snapshots AS ss ON ss.site_id = s.id "
            "WHERE s.id = %s AND s.organisation_id = %s",
            (site_id, organisation_id), "site",
        )

    def _snapshot(self, sql, parameters, scope: Literal["organisation", "site"]):
        with self.database.connection() as connection:
            cursor = connection.cursor()
            try:
                cursor.execute(sql, parameters)
                row = cursor.fetchone()
            finally:
                cursor.close()
        if row is None:
            raise EntityNotFound()
        try:
            payload = SnapshotPayload.model_validate(row[3])
            expected_axis = SiteAxis if scope == "organisation" else DeviceAxis
            if any(not isinstance(item, expected_axis) for item in payload.traffic_devices):
                raise ValueError("Invalid traffic scope")
            ids = [item.model_dump().get("site_id", item.model_dump().get("device_id")) for item in payload.traffic_devices]
            if len(ids) != len(set(ids)):
                raise ValueError("Duplicate traffic entity")
            ts = row[2]
            if not isinstance(ts, datetime) or ts.tzinfo is None:
                raise ValueError("Snapshot timestamp must be timezone aware")
            return dict(scope=scope, entity_id=entity_id(row[0]), entity_name=row[1],
                        ts=ts.astimezone(timezone.utc).isoformat(), payload=payload.model_dump(mode="json"))
        except (ValueError, TypeError) as exc:
            raise InvalidSnapshot() from exc
