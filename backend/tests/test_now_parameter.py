from datetime import datetime
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[2]))

import backend.app.analytics.compiler as compiler
from backend.app.analytics.compiler import CompilerContext, SpecCompiler


class FixedDatetime(datetime):
    @classmethod
    def now(cls, tz=None):
        return cls(2024, 1, 3, 12, 0, tzinfo=tz)


class FutureDatetime(datetime):
    @classmethod
    def now(cls, tz=None):
        return cls(2024, 1, 10, 0, 0, tzinfo=tz)


def _spec_with_window(end: str) -> dict:
    return {
        "id": "time-test",
        "dataset": "events",
        "chartType": "composed_time",
        "measures": [{"id": "activity", "aggregation": "count"}],
        "dimensions": [{"id": "time", "column": "timestamp", "bucket": "HOUR"}],
        "timeWindow": {"from": "2024-01-01T00:00:00Z", "to": end, "bucket": "HOUR", "timezone": "UTC"},
        "filters": [],
    }


def test_now_param_clamps_to_current_time(monkeypatch):
    monkeypatch.setattr(compiler, "datetime", FixedDatetime)
    spec = _spec_with_window("2024-01-05T00:00:00Z")
    compiled = SpecCompiler().compile(spec, CompilerContext(table_name="project.dataset.clientA"))

    assert compiled.params["now"].startswith("2024-01-03T12:00:00+")


def test_now_param_uses_end_when_before_now(monkeypatch):
    monkeypatch.setattr(compiler, "datetime", FutureDatetime)
    spec = _spec_with_window("2024-01-02T00:00:00Z")
    compiled = SpecCompiler().compile(spec, CompilerContext(table_name="project.dataset.clientA"))

    assert compiled.params["now"].startswith("2024-01-02T00:00:00+")
