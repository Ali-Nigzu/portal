import json

from backend.app.analytics import org_config


def test_parse_event_timestamp_columns_json(monkeypatch):
    monkeypatch.setenv("EVENT_TIMESTAMP_COLUMNS", json.dumps({"org": "event_ts"}))

    mapping = org_config.build_org_event_timestamp_columns()

    assert mapping["org"] == "event_ts"


def test_parse_event_timestamp_columns_csv(monkeypatch):
    monkeypatch.setenv("EVENT_TIMESTAMP_COLUMNS", "org1=event_ts,org2=event_timestamp")

    mapping = org_config.build_org_event_timestamp_columns()

    assert mapping["org1"] == "event_ts"
    assert mapping["org2"] == "event_timestamp"


def test_override_org_event_timestamp_columns(monkeypatch):
    monkeypatch.delenv("EVENT_TIMESTAMP_COLUMNS", raising=False)
    monkeypatch.setattr(org_config, "ORG_EVENT_TIMESTAMP_COLUMNS", {})

    org_config.override_org_event_timestamp_columns({"org": "ts_override"})

    assert org_config.ORG_EVENT_TIMESTAMP_COLUMNS == {"org": "ts_override"}


def test_default_mapping_includes_demodata(monkeypatch):
    monkeypatch.delenv("EVENT_TIMESTAMP_COLUMNS", raising=False)
    monkeypatch.setattr(org_config, "ORG_EVENT_TIMESTAMP_COLUMNS", {})

    mapping = org_config.build_org_event_timestamp_columns()

    assert mapping["demodata0.client0"] == "timestamp"
    assert mapping["demodata0.client1"] == "timestamp"
    assert mapping["client0"] == "timestamp"
    assert mapping["client1"] == "timestamp"


def test_env_override_ignored_for_locked_orgs(monkeypatch, caplog):
    monkeypatch.setenv(
        "EVENT_TIMESTAMP_COLUMNS",
        json.dumps({"demodata0.client0": "event_ts", "other": "custom_ts"}),
    )
    monkeypatch.setattr(org_config, "ORG_EVENT_TIMESTAMP_COLUMNS", {})

    with caplog.at_level("WARNING"):
        mapping = org_config.build_org_event_timestamp_columns()

    assert mapping["demodata0.client0"] == "timestamp"
    assert mapping["other"] == "custom_ts"
    assert any("timestamp_column.env_ignored" in record.message for record in caplog.records)
