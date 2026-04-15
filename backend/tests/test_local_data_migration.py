import json
import os
import sqlite3
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from backend.app.local_logs import search_events_from_sqlite
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
            os.environ["LOCAL_COMBINED_SNAPSHOTS_DB"] = str(Path(tmpdir) / "combined_logs_snapshots.db")
            os.environ["LOCAL_SITE_A_SNAPSHOTS_DB"] = str(Path(tmpdir) / "user0_snapshots.db")
            os.environ["LOCAL_SITE_B_SNAPSHOTS_DB"] = str(Path(tmpdir) / "user1_snapshots.db")
            self.assertTrue(str(snapshot_db_for_site("all")).endswith("combined_logs_snapshots.db"))
            self.assertTrue(str(snapshot_db_for_site("site-a")).endswith("user0_snapshots.db"))
            self.assertTrue(str(snapshot_db_for_site("site-b")).endswith("user1_snapshots.db"))


class LocalSnapshotSQLiteTests(unittest.TestCase):
    def test_fetch_latest_snapshot_from_sqlite(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "user0_snapshots.db"
            conn = sqlite3.connect(str(db_path))
            conn.execute("CREATE TABLE snapshots (ts TEXT NOT NULL, payload TEXT NOT NULL)")
            conn.execute(
                "INSERT INTO snapshots (ts, payload) VALUES (?, ?)",
                (
                    "2026-04-14 00:00:00 UTC",
                    json.dumps([[1] * 96, [2] * 96, [3] * 96, [4] * 96, [5] * 96, [10, 20, 70], [0, 35]]),
                ),
            )
            conn.execute(
                "INSERT INTO snapshots (ts, payload) VALUES (?, ?)",
                (
                    "2026-04-14 00:01:00 UTC",
                    json.dumps([[9] * 96, [8] * 96, [7] * 96, [6] * 96, [5] * 96, [33, 33, 34], [25, 40]]),
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


class LocalLogsSQLiteTests(unittest.TestCase):
    def test_search_events_from_sqlite_demo_combined(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "combined_logs.db"
            conn = sqlite3.connect(str(db_path))
            conn.execute(
                """
                CREATE TABLE logs (
                    site_id INTEGER NOT NULL,
                    cam_id INTEGER NOT NULL,
                    track_id TEXT NOT NULL,
                    event INTEGER NOT NULL,
                    timestamp TEXT NOT NULL,
                    sex INTEGER NOT NULL,
                    age_bucket INTEGER NOT NULL,
                    race INTEGER NOT NULL
                )
                """
            )
            rows = [
                (0, 0, "t-01", 1, "2026-04-14 00:00:00 UTC", 0, 2, 1),
                (1, 2, "t-02", 0, "2026-04-14 00:05:00 UTC", 1, 3, 2),
                (0, 1, "xyz", 1, "2026-04-14 00:10:00 UTC", 1, 4, 0),
            ]
            conn.executemany(
                "INSERT INTO logs (site_id, cam_id, track_id, event, timestamp, sex, age_bucket, race) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                rows,
            )
            conn.commit()
            conn.close()

            result = search_events_from_sqlite(
                db_path,
                start=datetime(2026, 4, 14, 0, 0, tzinfo=timezone.utc),
                end=datetime(2026, 4, 14, 1, 0, tzinfo=timezone.utc),
                event="entry",
                sex="female",
                age=None,
                race=None,
                site_id=None,
                camera_id=None,
                track_id=None,
                page=1,
                per_page=20,
            )
            self.assertEqual(result["total"], 1)
            self.assertEqual(result["events"][0]["event"], "entry")
            self.assertEqual(result["events"][0]["track_id"], "xyz")


if __name__ == "__main__":
    unittest.main()
