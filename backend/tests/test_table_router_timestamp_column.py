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
