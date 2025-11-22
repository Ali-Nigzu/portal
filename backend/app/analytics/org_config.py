"""Organisation-to-table configuration helpers for analytics queries."""
from __future__ import annotations

import os
import logging
from typing import Dict


logger = logging.getLogger(__name__)


class OrganisationNotConfiguredError(KeyError):
    """Raised when no BigQuery table has been configured for an organisation."""


class BigQueryConfigurationError(RuntimeError):
    """Raised when required BigQuery configuration is missing."""


DEFAULT_ORG_TABLE_IDS: Dict[str, str] = {
    "client0": "client0",
    "client1": "client1",
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


# The resolved table mapping used by production code. Tests may monkeypatch this.
ORG_TABLE_MAP: Dict[str, str] = build_org_table_map()


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
