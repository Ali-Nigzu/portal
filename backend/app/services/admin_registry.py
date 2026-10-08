"""Frozen, application-owned row contract. No browser-supplied schema metadata."""

from dataclasses import dataclass
from types import MappingProxyType
import json
import re
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID


class AdminError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message
        super().__init__(message)


@dataclass(frozen=True)
class Column:
    name: str
    type: str
    nullable: bool = False
    default: bool = False
    identity: bool = False
    enum: tuple = ()
    minimum: int | None = None


@dataclass(frozen=True)
class Table:
    name: str
    columns: tuple[Column, ...]
    pk: tuple[str, ...]
    filters: tuple[str, ...] = ()

    @property
    def fields(self):
        return {c.name: c for c in self.columns}


def c(name, type, **kwargs):
    return Column(name, type, **kwargs)


def identity():
    return c("id", "bigint", identity=True, default=True)


def timestamps():
    return (
        c("created_at", "timestamptz", default=True),
        c("updated_at", "timestamptz", default=True),
    )


TABLES = MappingProxyType(
    {
        t.name: t
        for t in (
            Table(
                "organisations",
                (
                    identity(),
                    c("name", "text"),
                    *timestamps(),
                    c("enabled", "boolean", default=True),
                ),
                ("id",),
            ),
            Table(
                "sites",
                (
                    identity(),
                    c("name", "text"),
                    c("organisation_id", "bigint"),
                    *timestamps(),
                    c("max_capacity", "smallint"),
                    c("enabled", "boolean", default=True),
                ),
                ("id",),
                ("organisation_id",),
            ),
            Table(
                "devices",
                (
                    identity(),
                    c("name", "text"),
                    c("site_id", "bigint"),
                    c("enabled", "boolean", default=True),
                    c("analysis_interval_minutes", "integer", minimum=1),
                    c("analyzed_until", "timestamptz", nullable=True),
                    *timestamps(),
                    c("last_connected_at", "timestamptz", nullable=True),
                    c("last_frame_seen_at", "timestamptz", nullable=True),
                    c("last_frame_uploaded_at", "timestamptz", nullable=True),
                    c("rtsp_uri", "text", nullable=True),
                    c("rtsp_username", "text", default=True),
                    c("rtsp_password", "text", default=True),
                    c("capture_fps", "smallint", default=True),
                    c("change_threshold_bp", "smallint", default=True),
                    *(
                        c(n, "smallint", nullable=True)
                        for n in ("line_ax", "line_ay", "line_bx", "line_by")
                    ),
                    c(
                        "frame_package_interval_minutes",
                        "integer",
                        default=True,
                        minimum=1,
                    ),
                ),
                ("id",),
                ("site_id",),
            ),
            Table(
                "gateways",
                (
                    c("gateway_id", "uuid"),
                    c("site_id", "bigint", nullable=True),
                    c("desired_state", "smallint", default=True, enum=(0, 1, 2)),
                    c("restart_requested_at", "timestamptz", nullable=True),
                    c("last_seen_at", "timestamptz", nullable=True),
                    c("commission_hash", "bytea", nullable=True),
                    c("desired_version", "text", default=True),
                    c("reported_version", "text", nullable=True),
                ),
                ("gateway_id",),
                ("site_id",),
            ),
            Table(
                "users",
                (
                    identity(),
                    c("email", "text"),
                    c("username", "text"),
                    c("phone_number", "text", nullable=True),
                    c("password_hash", "text"),
                    c("status", "smallint", enum=(0, 1)),
                    c("created_at", "timestamptz"),
                    c("session_version", "bigint", default=True, minimum=0),
                ),
                ("id",),
            ),
            Table(
                "memberships",
                (
                    c("user_id", "bigint"),
                    c("organisation_id", "bigint"),
                    c("role", "smallint", enum=(0, 1)),
                    c("status", "smallint", enum=(0, 1, 2, 3)),
                    c("created_at", "timestamptz"),
                    c("status_changed_at", "timestamptz", nullable=True, default=True),
                ),
                ("user_id", "organisation_id"),
                ("user_id", "organisation_id"),
            ),
            *(
                Table(
                    name,
                    (
                        c(key, "bigint"),
                        c("ts", "timestamptz"),
                        c("payload", "jsonb"),
                        c("state", "jsonb"),
                        c("updated_at", "timestamptz"),
                    ),
                    (key,),
                )
                for name, key in (
                    ("organisation_snapshots", "organisation_id"),
                    ("site_snapshots", "site_id"),
                )
            ),
            Table(
                "alarms",
                (
                    identity(),
                    c("organisation_id", "bigint"),
                    c("site_id", "bigint"),
                    c("device_id", "bigint", nullable=True),
                    c("gateway_id", "uuid", nullable=True),
                    c("alarm_type", "text"),
                    c("severity", "text", enum=("low", "medium", "high")),
                    c("started_at", "timestamptz"),
                    c("cleared_at", "timestamptz", nullable=True),
                ),
                ("id",),
                ("organisation_id", "site_id"),
            ),
            Table(
                "user_lifecycle_challenges",
                (
                    c("id", "text"),
                    c("purpose", "smallint", enum=(0, 1, 2)),
                    c("user_id", "bigint", nullable=True),
                    c("payload", "jsonb", default=True),
                    c("code_hash", "text"),
                    c("code_expires_at", "timestamptz"),
                    c("attempts", "smallint", default=True, minimum=0),
                    c("resends", "smallint", default=True, minimum=0),
                    c("last_sent_at", "timestamptz", default=True),
                    c("verified_at", "timestamptz", nullable=True),
                    c("consumed_at", "timestamptz", nullable=True),
                    c("created_at", "timestamptz", default=True),
                ),
                ("id",),
                ("user_id", "purpose"),
            ),
        )
    }
)


def table(name):
    if name not in TABLES:
        raise AdminError(404, "Unknown Admin table")
    return TABLES[name]


def json_text(value):
    """Serialize Decimal JSON numbers without changing their value or quoting them."""
    if value is None:
        return "null"
    if type(value) is bool:
        return "true" if value else "false"
    if isinstance(value, (int, Decimal)) and not isinstance(value, bool):
        if isinstance(value, Decimal) and not value.is_finite():
            raise ValueError("Invalid JSON number")
        return str(value)
    if type(value) is float:
        return json.dumps(value, allow_nan=False)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, list):
        return "[" + ",".join(json_text(v) for v in value) + "]"
    if isinstance(value, dict) and all(isinstance(k, str) for k in value):
        return (
            "{"
            + ",".join(
                json.dumps(k, ensure_ascii=False) + ":" + json_text(v)
                for k, v in value.items()
            )
            + "}"
        )
    raise ValueError("Invalid JSON value")


def decode(column, value):
    try:
        if value is None:
            if not column.nullable:
                raise ValueError()
            return None
        kind = column.type
        if kind == "bigint":
            if type(value) is not str or not re.fullmatch(r"0|-?[1-9][0-9]*", value):
                raise ValueError()
            value = int(value)
            if not -(2**63) <= value < 2**63:
                raise ValueError()
        elif kind in ("smallint", "integer"):
            bits = 16 if kind == "smallint" else 32
            if type(value) is not int or not -(2 ** (bits - 1)) <= value < 2 ** (
                bits - 1
            ):
                raise ValueError()
        elif kind == "boolean":
            if type(value) is not bool:
                raise ValueError()
        elif kind == "text":
            if type(value) is not str or "\x00" in value:
                raise ValueError()
        elif kind == "uuid":
            if type(value) is not str:
                raise ValueError()
            value = UUID(value)
        elif kind == "timestamptz":
            if type(value) is not str:
                raise ValueError()
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if value.tzinfo is None or value.utcoffset() is None:
                raise ValueError()
            value = value.astimezone(timezone.utc)
        elif kind == "bytea":
            if type(value) is not str or not re.fullmatch(
                r"\\x(?:[0-9a-fA-F]{2})*", value
            ):
                raise ValueError()
            value = bytes.fromhex(value[2:])
        elif kind == "jsonb":
            # JSON null is valid even in a NOT NULL JSONB column.
            value = json_text(value)
        if column.enum and value not in column.enum:
            raise ValueError()
        if column.minimum is not None and value < column.minimum:
            raise ValueError()
        return value
    except (ValueError, TypeError, OverflowError, RecursionError):
        raise AdminError(
            422,
            f"{column.name}: expected {column.type}"
            + (" or SQL NULL" if column.nullable else ""),
        ) from None


def values(t, data, *, create=False, key=False):
    if type(data) is not dict:
        raise AdminError(422, "Expected a row object")
    allowed = (
        set(t.pk)
        if key
        else {
            col.name
            for col in t.columns
            if not col.identity and (create or col.name not in t.pk)
        }
    )
    if set(data) - allowed:
        raise AdminError(422, "Unknown or immutable column")
    if key and set(data) != set(t.pk):
        raise AdminError(422, "Complete primary key required")
    if create:
        missing = [
            col.name
            for col in t.columns
            if not col.default and not col.nullable and col.name not in data
        ]
        if missing:
            raise AdminError(422, "Required fields: " + ", ".join(missing))
    if not data:
        raise AdminError(422, "No fields supplied")
    result = {}
    for name, v in data.items():
        col = t.fields[name]
        if col.type == "jsonb" and v is None:
            result[name] = "null"
        else:
            result[name] = decode(col, v)
    return result


def registry():
    return [
        {
            "name": t.name,
            "pk": list(t.pk),
            "filters": list(t.filters),
            "columns": [
                {
                    "name": col.name,
                    "type": col.type,
                    "nullable": col.nullable,
                    "default": col.default,
                    "identity": col.identity,
                    "enum": list(col.enum),
                    "minimum": col.minimum,
                    "mutable": col.name not in t.pk,
                }
                for col in t.columns
            ],
        }
        for t in TABLES.values()
    ]
