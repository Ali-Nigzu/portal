"""Bounded canonical row operations; identifiers come only from admin_registry."""

import base64
from contextlib import closing
from datetime import datetime, timezone
from decimal import Decimal
import json
from .admin_registry import TABLES, AdminError, table, values


def select_columns(t):
    return ",".join(
        f'"{c.name}"' + ("::text" if c.type == "jsonb" else "") for c in t.columns
    )


def row(t, data):
    if data is None:
        raise AdminError(404, "Row not found")
    result = {}
    for col, v in zip(t.columns, data):
        if v is not None:
            if col.type == "bigint":
                v = str(v)
            elif col.type == "uuid":
                v = str(v)
            elif col.type == "bytea":
                v = "\\x" + bytes(v).hex()
            elif col.type == "timestamptz":
                v = v.astimezone(timezone.utc).isoformat()
            elif col.type == "jsonb":
                v = json.loads(v, parse_float=Decimal)
        result[col.name] = v
    return result


def where(key):
    return " AND ".join(f'"{n}" = %s' for n in key)


def parameter(col):
    return "%s::jsonb" if col.type == "jsonb" else "%s"


def translate(error):
    info = error.args[0] if error.args else None
    state = info.get("C") if isinstance(info, dict) else None
    if state == "23505":
        constraint = info.get("n", "")
        if constraint in ("uq_users_email_ci", "uq_users_username_ci"):
            return AdminError(
                409, "Email or username already exists (case-insensitive)"
            )
        return AdminError(
            409,
            "Duplicate row or unique value; check primary key and parent/name assignment",
        )
    return (
        AdminError(
            422,
            {
                "23503": "Referenced row does not exist",
                "23514": "Value violates a table constraint",
                "23502": "A required field cannot be NULL",
                "22003": "Integer is outside the column range",
            }.get(state, "Invalid row"),
        )
        if state in ("23503", "23514", "23502", "22003")
        else error
    )


class AdminRepository:
    def __init__(self, database):
        self.database = database

    def get(self, name, key):
        t = table(name)
        key = values(t, key, key=True)
        with self.database.connection() as con, closing(con.cursor()) as cur:
            cur.execute(
                f'SELECT {select_columns(t)} FROM public."{t.name}" WHERE {where(key)}',
                tuple(key.values()),
            )
            return row(t, cur.fetchone())

    def list(self, name, page_size=50, cursor=None, filters=None):
        t = table(name)
        if type(page_size) is not int or not 1 <= page_size <= 100:
            raise AdminError(422, "Page size must be between 1 and 100")
        filters = filters or {}
        if set(filters) - set(t.filters):
            raise AdminError(422, "Unsupported filter")
        from .admin_registry import decode

        checked = {n: decode(t.fields[n], v) for n, v in filters.items()}
        clauses = [f'"{n}" IS NOT DISTINCT FROM %s' for n in checked]
        params = list(checked.values())
        if cursor:
            try:
                if len(cursor) > 4096:
                    raise ValueError()
                data = json.loads(
                    base64.b64decode(
                        cursor + "=" * (-len(cursor) % 4), altchars=b"-_", validate=True
                    )
                )
                if (
                    set(data) != {"table", "filters", "key"}
                    or data["table"] != name
                    or data["filters"] != filters
                ):
                    raise ValueError()
                key = values(t, data["key"], key=True)
            except (ValueError, TypeError, KeyError, AdminError):
                raise AdminError(422, "Invalid continuation") from None
            names = ",".join(f'"{n}"' for n in t.pk)
            clauses.append(f'({names}) > ({",".join("%s" for _ in t.pk)})')
            params.extend(key[n] for n in t.pk)
        sql = f'SELECT {select_columns(t)} FROM public."{t.name}"'
        if clauses:
            sql += " WHERE " + " AND ".join(clauses)
        sql += " ORDER BY " + ",".join(f'"{n}"' for n in t.pk) + " LIMIT %s"
        with self.database.connection() as con, closing(con.cursor()) as cur:
            cur.execute(sql, tuple(params + [page_size + 1]))
            items = [row(t, r) for r in cur.fetchall()]
        next_cursor = None
        if len(items) > page_size:
            last = items[page_size - 1]
            data = {
                "table": name,
                "filters": filters,
                "key": {n: last[n] for n in t.pk},
            }
            next_cursor = (
                base64.urlsafe_b64encode(
                    json.dumps(data, separators=(",", ":")).encode()
                )
                .decode()
                .rstrip("=")
            )
        return {"items": items[:page_size], "next_cursor": next_cursor}

    @staticmethod
    def lock(cur, oid):
        cur.execute(
            "SELECT pg_advisory_xact_lock(hashtextextended(%s,0))",
            (f"camos:memberships:{oid}",),
        )

    def mutate(self, name, data, key=None):
        t = table(name)
        checked = values(t, data, create=key is None)
        k = values(t, key, key=True) if key is not None else None
        try:
            with self.database.transaction() as con, closing(con.cursor()) as cur:
                if name in ("memberships", "organisations"):
                    oid = (
                        checked.get("organisation_id")
                        if name == "memberships" and k is None
                        else (k or {}).get(
                            "organisation_id" if name == "memberships" else "id"
                        )
                    )
                    if oid is not None:
                        self.lock(cur, oid)
                if k is None:
                    columns = ",".join(f'"{n}"' for n in checked)
                    placeholders = ",".join(parameter(t.fields[n]) for n in checked)
                    sql = f'INSERT INTO public."{t.name}" ({columns}) VALUES ({placeholders})'
                    params = list(checked.values())
                else:
                    assignments = ",".join(
                        f'"{n}"={parameter(t.fields[n])}' for n in checked
                    )
                    sql = f'UPDATE public."{t.name}" SET {assignments} WHERE {where(k)}'
                    params = list(checked.values()) + list(k.values())
                cur.execute(sql + " RETURNING " + select_columns(t), tuple(params))
                result = row(t, cur.fetchone())
                if name == "users" and k is None and result["id"] == "999999":
                    raise AdminError(
                        409, "Reserved Admin ID cannot be allocated by Create User"
                    )
                return result
        except Exception as error:
            mapped = translate(error)
            if mapped is error:
                raise
            raise mapped from None

    def context(self, oid, page_size=50, cursor=None, membership_cursor=None):
        # Repeatable read gives one coherent projection; child collections bounded.
        with self.database.transaction() as con, closing(con.cursor()) as cur:
            cur.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            org = TABLES["organisations"]
            key = values(org, {"id": oid}, key=True)
            cur.execute(
                f"SELECT {select_columns(org)} FROM public.organisations WHERE id=%s",
                (key["id"],),
            )
            organisation = row(org, cur.fetchone())
            cur.execute(
                "SELECT 1 FROM public.organisation_snapshots WHERE organisation_id=%s",
                (key["id"],),
            )
            snapshot = cur.fetchone() is not None
            if type(page_size) is not int or not 1 <= page_size <= 100:
                raise AdminError(422, "Invalid page size")
            after = None
            if cursor:
                try:
                    data = json.loads(
                        base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4))
                    )
                    if data["organisation"] != oid:
                        raise ValueError()
                    after = values(TABLES["sites"], {"id": data["id"]}, key=True)["id"]
                except (ValueError, KeyError, TypeError, AdminError):
                    raise AdminError(422, "Invalid context continuation") from None
            cur.execute(
                "SELECT s.id,s.name,s.enabled,s.max_capacity,EXISTS(SELECT 1 FROM public.site_snapshots ss WHERE ss.site_id=s.id),"
                "(SELECT count(*) FROM public.devices d WHERE d.site_id=s.id),"
                "(SELECT g.gateway_id FROM public.gateways g WHERE g.site_id=s.id) "
                "FROM public.sites s WHERE s.organisation_id=%s AND (%s::bigint IS NULL OR s.id>%s) ORDER BY s.id LIMIT %s",
                (key["id"], after, after, page_size + 1),
            )
            sites = [
                dict(
                    id=str(r[0]),
                    name=r[1],
                    enabled=r[2],
                    max_capacity=r[3],
                    snapshot_exists=r[4],
                    device_count=str(r[5]),
                    gateway_id=str(r[6]) if r[6] else None,
                )
                for r in cur.fetchall()
            ]
            next_cursor = None
            if len(sites) > page_size:
                next_cursor = (
                    base64.urlsafe_b64encode(
                        json.dumps(
                            {"organisation": oid, "id": sites[page_size - 1]["id"]}
                        ).encode()
                    )
                    .decode()
                    .rstrip("=")
                )
            # Membership page uses the same snapshot and a scalar composite-key tail.
            after_user = None
            if membership_cursor:
                try:
                    data = json.loads(
                        base64.urlsafe_b64decode(
                            membership_cursor + "=" * (-len(membership_cursor) % 4)
                        )
                    )
                    if data["organisation"] != oid:
                        raise ValueError()
                    from .admin_registry import decode

                    after_user = decode(
                        TABLES["memberships"].fields["user_id"], data["user_id"]
                    )
                except (ValueError, KeyError, TypeError, AdminError):
                    raise AdminError(422, "Invalid membership continuation") from None
            m = TABLES["memberships"]
            cur.execute(
                f"SELECT {select_columns(m)} FROM public.memberships WHERE organisation_id=%s AND (%s::bigint IS NULL OR user_id>%s) ORDER BY user_id LIMIT %s",
                (key["id"], after_user, after_user, page_size + 1),
            )
            members = [row(m, r) for r in cur.fetchall()]
            next_members = None
            if len(members) > page_size:
                next_members = (
                    base64.urlsafe_b64encode(
                        json.dumps(
                            {
                                "organisation": oid,
                                "user_id": members[page_size - 1]["user_id"],
                            }
                        ).encode()
                    )
                    .decode()
                    .rstrip("=")
                )
            return dict(
                organisation=organisation,
                snapshot_exists=snapshot,
                sites=sites[:page_size],
                next_cursor=next_cursor,
                memberships=members[:page_size],
                next_membership_cursor=next_members,
            )
