import json
import os
import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from backend.app.services.local_data import resolve_site_view, snapshot_db_for_site
from backend.app.snapshots import fetch_latest_snapshot_from_sqlite


class LocalDataRoutingTests(unittest.TestCase):
    def test_resolve_site_view(self):
        self.assertEqual(resolve_site_view("all"), "all")
        self.assertEqual(resolve_site_view("site-a"), "site-a")
        self.assertEqual(resolve_site_view("site_b"), "site-b")
        self.assertEqual(resolve_site_view(None), "site-a")

    def test_snapshot_db_selection(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            os.environ["LOCAL_COMBINED_SNAPSHOTS_DB"] = str(
                Path(tmpdir) / "combined_logs_snapshots.db"
            )
            os.environ["LOCAL_SITE_A_SNAPSHOTS_DB"] = str(
                Path(tmpdir) / "user0_snapshots.db"
            )
            os.environ["LOCAL_SITE_B_SNAPSHOTS_DB"] = str(
                Path(tmpdir) / "user1_snapshots.db"
            )
            self.assertTrue(
                str(snapshot_db_for_site("all")).endswith("combined_logs_snapshots.db")
            )
            self.assertTrue(
                str(snapshot_db_for_site("site-a")).endswith("user0_snapshots.db")
            )
            self.assertTrue(
                str(snapshot_db_for_site("site-b")).endswith("user1_snapshots.db")
            )


class LocalSnapshotSQLiteTests(unittest.TestCase):
    def test_fetch_latest_snapshot_from_sqlite(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "user0_snapshots.db"
            conn = sqlite3.connect(str(db_path))
            conn.execute(
                "CREATE TABLE snapshots (ts TEXT NOT NULL, payload TEXT NOT NULL)"
            )
            conn.execute(
                "INSERT INTO snapshots (ts, payload) VALUES (?, ?)",
                (
                    "2026-04-14 00:00:00 UTC",
                    json.dumps(
                        [
                            [1] * 96,
                            [2] * 96,
                            [3] * 96,
                            [4] * 96,
                            [5] * 96,
                            [10, 20, 70],
                            [0, 35],
                        ]
                    ),
                ),
            )
            conn.execute(
                "INSERT INTO snapshots (ts, payload) VALUES (?, ?)",
                (
                    "2026-04-14 00:01:00 UTC",
                    json.dumps(
                        [
                            [9] * 96,
                            [8] * 96,
                            [7] * 96,
                            [6] * 96,
                            [5] * 96,
                            [33, 33, 34],
                            [25, 40],
                        ]
                    ),
                ),
            )
            conn.commit()
            conn.close()

            row = fetch_latest_snapshot_from_sqlite(
                db_path,
                org_id="client1",
                as_of=datetime(2026, 4, 14, 0, 2, tzinfo=timezone.utc),
            )
            self.assertIsNotNone(row)
            assert row is not None
            self.assertEqual(row.ts, "2026-04-14 00:01:00 UTC")
            self.assertEqual(row.payload[5], [33, 33, 34])
            self.assertEqual(row.payload[6], [25, 40])

    def test_fetch_latest_snapshot_without_ts_ignores_future_rows(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "user0_snapshots.db"
            conn = sqlite3.connect(str(db_path))
            conn.execute(
                "CREATE TABLE snapshots (ts TEXT NOT NULL, payload TEXT NOT NULL)"
            )

            now_utc = datetime.now(timezone.utc).replace(microsecond=0)
            past_ts = (now_utc - timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S UTC")
            future_ts = "2100-01-01 00:00:00 UTC"

            conn.execute(
                "INSERT INTO snapshots (ts, payload) VALUES (?, ?)",
                (past_ts, json.dumps([[1] * 96])),
            )
            conn.execute(
                "INSERT INTO snapshots (ts, payload) VALUES (?, ?)",
                (future_ts, json.dumps([[9] * 96])),
            )
            conn.commit()
            conn.close()

            row = fetch_latest_snapshot_from_sqlite(
                db_path, org_id="client1", as_of=None
            )
            self.assertIsNotNone(row)
            assert row is not None
            self.assertEqual(row.ts, past_ts)

    def test_fetch_latest_snapshot_without_ts_uses_demo_now_wall_clock(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "user0_snapshots.db"
            conn = sqlite3.connect(str(db_path))
            conn.execute(
                "CREATE TABLE snapshots (ts TEXT NOT NULL, payload TEXT NOT NULL)"
            )
            conn.execute(
                "INSERT INTO snapshots (ts, payload) VALUES (?, ?)",
                ("2026-04-20 18:45:00 UTC", json.dumps([[1] * 96])),
            )
            conn.execute(
                "INSERT INTO snapshots (ts, payload) VALUES (?, ?)",
                ("2026-04-20 19:45:00 UTC", json.dumps([[2] * 96])),
            )
            conn.commit()
            conn.close()

            with patch(
                "backend.app.snapshots.demo_now",
                return_value=datetime(2026, 4, 20, 19, 56, 0),
            ):
                row = fetch_latest_snapshot_from_sqlite(
                    db_path, org_id="client1", as_of=None
                )

            self.assertIsNotNone(row)
            assert row is not None
            self.assertEqual(row.ts, "2026-04-20 19:45:00 UTC")
