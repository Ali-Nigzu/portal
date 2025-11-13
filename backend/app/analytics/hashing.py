"""Utilities for deterministic ChartSpec hashing and cache keys."""
from __future__ import annotations

import hashlib
import json
from typing import Any, Dict


def _normalize(obj: Any) -> Any:
    """Recursively normalise a JSON-like structure for hashing."""

    if isinstance(obj, dict):
        return {key: _normalize(obj[key]) for key in sorted(obj)}
    if isinstance(obj, list):
        return [_normalize(item) for item in obj]
    return obj


def hash_spec(spec: Dict[str, Any]) -> str:
    """Return a deterministic hash for a ChartSpec-like dictionary."""

    normalized = _normalize(spec)
    payload = json.dumps(normalized, separators=(",", ":"), sort_keys=True)
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    return digest


def build_cache_key(spec: Dict[str, Any], *, table_name: str) -> str:
    """Combine the spec hash and routed table into a cache key."""

    spec_hash = hash_spec(spec)
    return f"{table_name}:{spec_hash}"
