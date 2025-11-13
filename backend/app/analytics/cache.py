"""Caching abstraction for analytics ChartSpec executions."""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Any, MutableMapping, Optional, Protocol


class CacheBackend(Protocol):
    """Protocol implemented by cache backends used by the analytics engine."""

    def get(self, key: str) -> Any:
        """Return the cached value for *key* or ``None`` when missing."""

    def set(self, key: str, value: Any, *, ttl: Optional[int] = None) -> None:
        """Store *value* under *key* for an optional time-to-live in seconds."""

    def clear(self) -> None:
        """Remove all cached entries."""


@dataclass
class _CacheEntry:
    value: Any
    expires_at: Optional[float]

    def expired(self) -> bool:
        return self.expires_at is not None and time.monotonic() >= self.expires_at


class LocalCacheBackend(CacheBackend):
    """In-process cache backend with optional TTL eviction."""

    def __init__(self) -> None:
        self._store: MutableMapping[str, _CacheEntry] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Any:
        with self._lock:
            entry = self._store.get(key)
            if not entry:
                return None
            if entry.expired():
                self._store.pop(key, None)
                return None
            return entry.value

    def set(self, key: str, value: Any, *, ttl: Optional[int] = None) -> None:
        expires_at = None if ttl is None else time.monotonic() + max(ttl, 0)
        with self._lock:
            self._store[key] = _CacheEntry(value=value, expires_at=expires_at)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()


class NullCacheBackend(CacheBackend):
    """Cache backend that never stores values (useful for tests)."""

    def get(self, key: str) -> Any:  # pragma: no cover - trivial one-liner
        return None

    def set(self, key: str, value: Any, *, ttl: Optional[int] = None) -> None:  # pragma: no cover
        return None

    def clear(self) -> None:  # pragma: no cover
        return None


class SpecCache:
    """Simple helper wrapping a :class:`CacheBackend` with a default TTL."""

    def __init__(self, backend: CacheBackend, *, default_ttl: int = 120) -> None:
        self._backend = backend
        self._default_ttl = default_ttl

    @property
    def backend(self) -> CacheBackend:
        return self._backend

    def get(self, key: str) -> Any:
        return self._backend.get(key)

    def set(self, key: str, value: Any, *, ttl: Optional[int] = None) -> None:
        effective_ttl = ttl if ttl is not None else self._default_ttl
        self._backend.set(key, value, ttl=effective_ttl)

    def clear(self) -> None:
        self._backend.clear()
