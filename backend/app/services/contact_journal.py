"""Atomic JSON-array journal updates with bounded history memory and file locking."""

import fcntl
import json
import os
import tempfile
from threading import Lock
import ijson

_lock = Lock()
CHUNK = 64 * 1024


def _last_content(source, before):
    while before:
        start = max(0, before - CHUNK)
        source.seek(start)
        block = source.read(before - start).rstrip(b' \t\r\n')
        if block:
            return start + len(block)
        before = start
    return 0


def append(path, record):
    directory = os.path.dirname(path) or '.'
    os.makedirs(directory, exist_ok=True)
    with _lock, open(path + '.lock', 'a') as lock_file:
        fcntl.flock(lock_file, fcntl.LOCK_EX)
        temporary = None
        try:
            has_items = False
            prefix_end = None
            if os.path.exists(path):
                with open(path, 'rb') as source:
                    events = ijson.parse(source)
                    if next(events, None) != ('', 'start_array', None):
                        raise ValueError('Contact journal must be a JSON array')
                    last = None
                    for prefix, event, value in events:
                        has_items |= prefix == 'item'
                        last = (prefix, event)
                    if last != ('', 'end_array'):
                        raise ValueError('Incomplete Contact journal')
                    end = _last_content(source, os.fstat(source.fileno()).st_size)
                    prefix_end = _last_content(source, end - 1)
            descriptor, temporary = tempfile.mkstemp(prefix='.contact-', dir=directory)
            with os.fdopen(descriptor, 'wb') as target:
                if prefix_end is None:
                    target.write(b'[')
                else:
                    with open(path, 'rb') as source:
                        remaining = prefix_end
                        while remaining:
                            block = source.read(min(CHUNK, remaining))
                            if not block:
                                raise OSError('Contact journal changed during append')
                            target.write(block)
                            remaining -= len(block)
                target.write(b',\n' if has_items else b'\n')
                encoded = ('  ' + json.dumps(record, indent=2, allow_nan=False).replace('\n', '\n  ')).encode()
                target.write(encoded + b'\n]')
                target.flush()
                os.fsync(target.fileno())
            os.replace(temporary, path)
            temporary = None
        finally:
            if temporary is not None:
                os.unlink(temporary)
            fcntl.flock(lock_file, fcntl.LOCK_UN)
