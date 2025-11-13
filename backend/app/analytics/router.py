"""Table routing helpers for ChartSpec execution."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict


class UnknownOrganisationError(KeyError):
    """Raised when a ChartSpec references an organisation without a table mapping."""


@dataclass(frozen=True)
class TableRouter:
    """Resolve organisation identifiers to fully-qualified BigQuery table names."""

    mapping: Dict[str, str]

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
