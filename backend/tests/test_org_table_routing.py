import importlib


def test_default_org_table_mapping_is_per_client(monkeypatch):
    monkeypatch.setenv("BQ_PROJECT", "example")
    monkeypatch.setenv("BQ_DATASET", "demo_data")
    org_config = importlib.import_module("backend.app.analytics.org_config")
    importlib.reload(org_config)

    original = dict(org_config.ORG_TABLE_MAP)

    mapping = org_config.build_org_table_map()
    assert mapping["clientA"] != mapping["client1"]

    try:
        org_config.override_org_table_map(mapping)
        assert (
            org_config.resolve_table_for_org("clientA")
            == "example.demo_data.clientA"
        )
        assert (
            org_config.resolve_table_for_org("client1")
            == "example.demo_data.client1"
        )
    finally:
        org_config.override_org_table_map(original)


def test_compat_table_names_are_sanitised(monkeypatch):
    monkeypatch.setenv("BQ_PROJECT", "example")
    monkeypatch.setenv("BQ_DATASET", "demo_data")
    org_config = importlib.import_module("backend.app.analytics.org_config")
    importlib.reload(org_config)

    original = dict(org_config.ORG_TABLE_MAP)
    try:
        org_config.override_org_table_map({"clientA": "clientA_compat"})
        resolved = org_config.resolve_table_for_org("clientA")
        assert resolved.endswith(".clientA")
    finally:
        org_config.override_org_table_map(original)
