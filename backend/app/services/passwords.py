"""The canonical Argon2 policy. Passwords are never normalized or trimmed."""

from argon2 import PasswordHasher, extract_parameters
from argon2.exceptions import InvalidHashError, VerificationError
from contextlib import contextmanager
import os
from threading import BoundedSemaphore
from pathlib import Path

hasher = PasswordHasher()
# Each operation retains Argon2's 64 MiB policy. The default reserves room for
# the app/providers in a 512 MiB container; deployment can explicitly tune it.
HASH_CONCURRENCY = int(os.getenv('PORTAL_HASH_CONCURRENCY', '2'))
if not 1 <= HASH_CONCURRENCY <= 8:
    raise RuntimeError('PORTAL_HASH_CONCURRENCY must be between 1 and 8')
try:
    memory_limit = int(Path('/sys/fs/cgroup/memory.max').read_text().strip())
except (OSError, ValueError):
    memory_limit = None
if memory_limit is not None and 256 * 1024 * 1024 + HASH_CONCURRENCY * hasher.memory_cost * 1024 > memory_limit:
    raise RuntimeError('Container memory is insufficient for PORTAL_HASH_CONCURRENCY; use at least 512 MiB with the default.')
MAX_STORED_MEMORY_KIB = min(262144, ((memory_limit or 512 * 1024 * 1024) - 256 * 1024 * 1024) // HASH_CONCURRENCY // 1024)
_slots = BoundedSemaphore(HASH_CONCURRENCY)


class PasswordCapacityError(RuntimeError):
    pass


@contextmanager
def hash_slot():
    if not _slots.acquire(timeout=1):
        raise PasswordCapacityError('Password service busy. Please retry.')
    try:
        yield
    finally:
        _slots.release()


def hash_password(password: str) -> str:
    with hash_slot():
        return hasher.hash(password)


def verify_password(password: str, stored_hash: str | None) -> bool:
    if stored_hash is None:
        return False
    try:
        policy = extract_parameters(stored_hash)
        if policy.memory_cost > MAX_STORED_MEMORY_KIB or policy.time_cost > 10 or policy.parallelism > 16:
            raise PasswordCapacityError('Stored password hash exceeds the configured resource budget')
        with hash_slot():
            return hasher.verify(stored_hash, password)
    except (InvalidHashError, VerificationError):
        return False
