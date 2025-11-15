"""Organisation-to-table configuration helpers for analytics queries."""
from __future__ import annotations

import os
from typing import Dict


class OrganisationNotConfiguredError(KeyError):
    """Raised when no BigQuery table has been configured for an organisation."""


class BigQueryConfigurationError(RuntimeError):
    """Raised when required BigQuery configuration is missing."""


DEFAULT_ORG_TABLE_IDS: Dict[str, str] = {
    "client0": "client0",
    "client1": "client1",
}


def _qualify_table_name(table_id: str) -> str:
    """Return a fully-qualified BigQuery table name for ``table_id``."""

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


# The resolved table mapping used by production code. Tests may monkeypatch this.
ORG_TABLE_MAP: Dict[str, str] = build_org_table_map()


def resolve_table_for_org(organisation: str) -> str:
    """Return the fully-qualified table name for ``organisation``."""

    try:
        table_id = ORG_TABLE_MAP[organisation]
    except KeyError as exc:
        raise OrganisationNotConfiguredError(organisation) from exc
    return _qualify_table_name(table_id)


def override_org_table_map(mapping: Dict[str, str]) -> None:
    """Override the global organisation → table mapping (primarily for tests)."""

    global ORG_TABLE_MAP
    ORG_TABLE_MAP = dict(mapping)
