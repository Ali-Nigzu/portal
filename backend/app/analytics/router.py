"""Table routing helpers for ChartSpec execution."""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Callable, Dict


class UnknownOrganisationError(KeyError):
    """Raised when a ChartSpec references an organisation without a table mapping."""


@dataclass(frozen=True)
class TableRouter:
    """Resolve organisation identifiers to fully-qualified BigQuery table names."""

    mapping: Dict[str, str]
    timestamp_columns: Dict[str, str] = field(default_factory=dict)
    default_event_timestamp_column: str = "timestamp"
    timestamp_candidates: tuple[str, ...] = (
        "event_ts",
        "event_timestamp",
        "event_time",
        "timestamp",
        "bucket_start",
    )
    _resolved_cache: Dict[str, str] = field(default_factory=dict, init=False, repr=False)

    def __post_init__(self) -> None:
        object.__setattr__(self, "_logger", logging.getLogger(__name__))

    def resolve(self, organisation: str) -> str:
        try:
            table_name = self.mapping[organisation]
        except KeyError as exc:  # pragma: no cover - defensive, but unit tested indirectly
            raise UnknownOrganisationError(organisation) from exc
        if table_name.count(".") != 2:
            raise ValueError(
                "Table names must be fully-qualified in the form project.dataset.table"
            )
        return table_name

    def resolve_event_timestamp_column(
        self,
        organisation: str,
        *,
        table_name: str | None = None,
        schema_loader: Callable[[str], list[str]] | None = None,
    ) -> str:
        """Return the raw event timestamp column for an organisation.

        Preference order:
        1. Per-organisation override provided to the router.
        2. ``EVENT_TIMESTAMP_COLUMN`` environment variable (global default).
        3. Auto-detection from the table schema (if provided) using
           ``timestamp_candidates`` in order.
        4. Hardcoded fallback to ``timestamp``.
        """

        schema_columns: set[str] | None = None

        def _has_column(column: str) -> bool:
            return schema_columns is None or column in schema_columns

        if table_name and schema_loader:
            cached = self._resolved_cache.get(table_name)
            if cached:
                return cached

            try:
                schema_columns = set(schema_loader(table_name))
            except Exception:
                schema_columns = None

        override = self.timestamp_columns.get(organisation)
        if override and _has_column(override):
            if schema_columns is not None:
                self._resolved_cache[table_name] = override
            return override
        if override and schema_columns is not None and override not in schema_columns:
            self._logger.warning(
                "analytics.router.timestamp_column.override_missing",
                extra={"organisation": organisation, "column": override, "table": table_name},
            )

        env_default = os.getenv("EVENT_TIMESTAMP_COLUMN")
        if env_default and _has_column(env_default):
            if schema_columns is not None:
                self._resolved_cache[table_name] = env_default
            return env_default
        if env_default and schema_columns is not None and env_default not in schema_columns:
            self._logger.warning(
                "analytics.router.timestamp_column.env_missing",
                extra={"column": env_default, "table": table_name},
            )

        if schema_columns is not None:
            for candidate in self.timestamp_candidates:
                if candidate in schema_columns:
                    self._resolved_cache[table_name] = candidate
                    return candidate

        return self.default_event_timestamp_column
