"""Organisation-to-table configuration helpers for analytics queries."""
from __future__ import annotations

import json
import os
import logging
from typing import Dict


logger = logging.getLogger(__name__)


class OrganisationNotConfiguredError(KeyError):
    """Raised when no BigQuery table has been configured for an organisation."""


class BigQueryConfigurationError(RuntimeError):
    """Raised when required BigQuery configuration is missing."""


DEFAULT_ORG_TABLE_IDS: Dict[str, str] = {
    # Route the default demo orgs directly to the raw B1 tables to preserve event-level
    # timestamps (e.g., for hour-of-day demographics) instead of the legacy compat views.
    "client0": "nigzsu.demodata0.client0",
    "client1": "nigzsu.demodata0.client1",
    # Fully-qualified VRM demo tables
    "demodata0.client0": "nigzsu.demodata0.client0",
    "demodata0.client1": "nigzsu.demodata0.client1",
    "client2": "nigzsu.demodata0.client1",
}


def _parse_event_timestamp_columns(value: str | None) -> Dict[str, str]:
    """Parse per-organisation event timestamp column overrides.

    Accepts either JSON (``{"org": "event_ts"}``) or a comma-delimited list of
    ``org=column`` pairs (``org1=event_ts,org2=event_timestamp``).
    """

    if not value:
        return {}

    try:
        parsed = json.loads(value)
        if isinstance(parsed, dict):
            return {str(k): str(v) for k, v in parsed.items()}
    except Exception:
        logger.warning("analytics.org_config.event_timestamp.json_parse_failed", exc_info=True)

    mapping: Dict[str, str] = {}
    for part in value.split(","):
        if not part or "=" not in part:
            continue
        org, column = part.split("=", 1)
        org = org.strip()
        column = column.strip()
        if org and column:
            mapping[org] = column
    return mapping


# Default mappings for known organisations. Some entries are "locked" to avoid
# accidental overrides by misconfigured environment variables.
DEFAULT_ORG_EVENT_TIMESTAMP_COLUMNS: Dict[str, str] = {
    # VRM demo datasets use the raw event timestamp column named "timestamp"
    "demodata0.client0": "timestamp",
    "demodata0.client1": "timestamp",
    "client0": "timestamp",
    "client1": "timestamp",
}

# Organisations whose default timestamp columns should not be overridden by
# environment variables (to avoid emitting invalid SQL when schemas differ from
# deployment settings).
LOCKED_ORG_EVENT_TIMESTAMP_COLUMNS = {
    "demodata0.client0",
    "demodata0.client1",
    "client0",
    "client1",
}


def _strip_compat_suffix(table_id: str) -> str:
    """Remove trailing ``_compat`` references to avoid view usage at runtime."""

    suffix = "_compat"
    if table_id.endswith(suffix):
        return table_id[: -len(suffix)]
    return table_id


def _qualify_table_name(table_id: str) -> str:
    """Return a fully-qualified BigQuery table name for ``table_id``."""

    table_id = _strip_compat_suffix(table_id)

    if table_id.count(".") == 2:
        return table_id

    project = os.getenv("BQ_PROJECT")
    dataset = os.getenv("BQ_DATASET")
    if not project or not dataset:
        raise BigQueryConfigurationError(
            "BQ_PROJECT and BQ_DATASET must be set to resolve analytics tables"
        )
    return f"{project}.{dataset}.{table_id}"


def build_org_table_map(overrides: Dict[str, str] | None = None) -> Dict[str, str]:
    """Construct the organisation → raw table identifier mapping."""

    mapping = dict(DEFAULT_ORG_TABLE_IDS)
    if overrides:
        mapping.update(overrides)
    return mapping


def build_org_event_timestamp_columns(
    overrides: Dict[str, str] | None = None,
) -> Dict[str, str]:
    """Construct the organisation → event timestamp column mapping."""

    env_mapping = _parse_event_timestamp_columns(os.getenv("EVENT_TIMESTAMP_COLUMNS"))

    mapping = dict(DEFAULT_ORG_EVENT_TIMESTAMP_COLUMNS)

    # Apply environment overrides except for locked organisations where we want
    # to guarantee the real, schema-backed column name.
    for org, column in env_mapping.items():
        if org in LOCKED_ORG_EVENT_TIMESTAMP_COLUMNS:
            logger.warning(
                "analytics.org_config.timestamp_column.env_ignored",
                extra={"organisation": org, "column": column},
            )
            continue
        mapping[org] = column

    if overrides:
        mapping.update(overrides)
    return mapping


# The resolved table mapping used by production code. Tests may monkeypatch this.
ORG_TABLE_MAP: Dict[str, str] = build_org_table_map()
ORG_EVENT_TIMESTAMP_COLUMNS: Dict[str, str] = build_org_event_timestamp_columns()


def resolve_table_for_org(organisation: str) -> str:
    """Return the fully-qualified table name for ``organisation``."""

    try:
        table_id = ORG_TABLE_MAP[organisation]
    except KeyError as exc:
        raise OrganisationNotConfiguredError(organisation) from exc

    stripped_table_id = _strip_compat_suffix(table_id)
    if stripped_table_id != table_id:
        logger.warning(
            "analytics.org_table.sanitised_compat", extra={"original": table_id, "sanitised": stripped_table_id}
        )
    return _qualify_table_name(stripped_table_id)


def override_org_table_map(mapping: Dict[str, str]) -> None:
    """Override the global organisation → table mapping (primarily for tests)."""

    global ORG_TABLE_MAP
    ORG_TABLE_MAP = dict(mapping)


def override_org_event_timestamp_columns(mapping: Dict[str, str]) -> None:
    """Override the organisation → event timestamp column mapping for tests."""

    global ORG_EVENT_TIMESTAMP_COLUMNS
    ORG_EVENT_TIMESTAMP_COLUMNS = dict(mapping)
