import pytest

from backend.app.analytics.router import TableRouter


def test_table_router_prefers_override_over_env(monkeypatch):
    monkeypatch.setenv("EVENT_TIMESTAMP_COLUMN", "env_ts")
    router = TableRouter(
        {"org": "project.dataset.table"}, timestamp_columns={"org": "override_ts"}
    )

    assert router.resolve_event_timestamp_column("org") == "override_ts"


def test_table_router_uses_env_when_no_override(monkeypatch):
    monkeypatch.setenv("EVENT_TIMESTAMP_COLUMN", "env_ts")
    router = TableRouter({"org": "project.dataset.table"})

    assert router.resolve_event_timestamp_column("org") == "env_ts"


def test_table_router_falls_back_to_default(monkeypatch):
    monkeypatch.delenv("EVENT_TIMESTAMP_COLUMN", raising=False)
    router = TableRouter({"org": "project.dataset.table"})

    assert router.resolve_event_timestamp_column("org") == "timestamp"


def test_table_router_auto_detects_from_schema(monkeypatch):
    monkeypatch.delenv("EVENT_TIMESTAMP_COLUMN", raising=False)
    router = TableRouter({"org": "project.dataset.table"})

    def _schema(table_name: str):
        assert table_name == "project.dataset.table"
        return ["site_id", "timestamp", "bucket_start"]

    assert (
        router.resolve_event_timestamp_column(
            "org", table_name="project.dataset.table", schema_loader=_schema
        )
        == "timestamp"
    )


def test_table_router_errors_when_override_missing_in_schema(monkeypatch):
    monkeypatch.delenv("EVENT_TIMESTAMP_COLUMN", raising=False)
    router = TableRouter({"org": "project.dataset.table"}, timestamp_columns={"org": "event_ts"})

    def _schema(table_name: str):
        assert table_name == "project.dataset.table"
        return ["timestamp", "bucket_start"]

    with pytest.raises(ValueError):
        router.resolve_event_timestamp_column(
            "org", table_name="project.dataset.table", schema_loader=_schema
        )


def test_table_router_rejects_disallowed_override(monkeypatch):
    monkeypatch.delenv("EVENT_TIMESTAMP_COLUMN", raising=False)
    router = TableRouter(
        {"org": "project.dataset.table"}, timestamp_columns={"org": "bucket_start"}
    )

    def _schema(table_name: str):
        assert table_name == "project.dataset.table"
        return ["bucket_start", "timestamp"]

    with pytest.raises(ValueError):
        router.resolve_event_timestamp_column(
            "org", table_name="project.dataset.table", schema_loader=_schema
        )


def test_table_router_errors_when_only_disallowed_columns(monkeypatch):
    monkeypatch.delenv("EVENT_TIMESTAMP_COLUMN", raising=False)
    router = TableRouter({"org": "project.dataset.table"})

    def _schema(table_name: str):
        assert table_name == "project.dataset.table"
        return ["bucket_start", "site_id"]

    with pytest.raises(ValueError):
        router.resolve_event_timestamp_column(
            "org", table_name="project.dataset.table", schema_loader=_schema
        )


def test_table_router_respects_demodata_timestamp_override(monkeypatch):
    monkeypatch.delenv("EVENT_TIMESTAMP_COLUMN", raising=False)
    org_id = "demodata0.client0"
    router = TableRouter(
        {org_id: "project.dataset.table"}, timestamp_columns={org_id: "timestamp"}
    )

    def _schema(table_name: str):
        assert table_name == "project.dataset.table"
        return ["site_id", "timestamp", "event", "Race"]

    assert (
        router.resolve_event_timestamp_column(
            org_id, table_name="project.dataset.table", schema_loader=_schema
        )
        == "timestamp"
    )
