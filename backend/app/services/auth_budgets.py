"""Authoritative temporary account/purpose budgets in the existing challenge table."""
import hashlib
import json
from datetime import timedelta


def insert_budget(cursor, record):
    columns = list(record)
    values = [json.dumps(value) if key == 'payload' else value for key, value in record.items()]
    cursor.execute('INSERT INTO public.user_lifecycle_challenges (' + ','.join(columns) + ') VALUES ('
                   + ','.join(['%s'] * len(columns)) + ')', tuple(values))


def consume_budget(cursor, purpose, email, now, *, namespace="start", limit=5, window_seconds=3600):
    """Bounded account/purpose attempts, shared across instances.

    A non-credential row uses the existing temporary table. Its namespaced
    ID cannot equal the SHA-256 lookup of any browser handle. No schema or
    new account/session authority is introduced. Cleanup removes it normally.
    """
    key = f'camos:{namespace}:{purpose}:{email}'
    budget_id = 'budget:' + hashlib.sha256(key.encode()).hexdigest()
    cursor.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,2))', (key,))
    cursor.execute('SELECT payload,created_at FROM public.user_lifecycle_challenges WHERE id=%s FOR UPDATE',
                   (budget_id,))
    row = cursor.fetchone()
    if row and row[1] + timedelta(seconds=window_seconds) > now:
        payload = json.loads(row[0]) if isinstance(row[0], str) else row[0]
        starts = payload['starts']
        if starts >= limit:
            return False
        cursor.execute('UPDATE public.user_lifecycle_challenges SET payload=%s WHERE id=%s',
                       (json.dumps({'kind': 'start_budget', 'starts': starts + 1}), budget_id))
    else:
        cursor.execute('DELETE FROM public.user_lifecycle_challenges WHERE id=%s', (budget_id,))
        insert_budget(cursor, dict(
            id=budget_id, purpose=purpose, payload={'kind': 'start_budget', 'starts': 1},
            code_hash='', code_expires_at=now + timedelta(seconds=window_seconds),
            last_sent_at=now, created_at=now,
        ))
    return True
