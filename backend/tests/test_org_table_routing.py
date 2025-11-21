import importlib


def test_default_org_table_mapping_is_per_client(monkeypatch):
    monkeypatch.setenv("BQ_PROJECT", "nigzsu")
    monkeypatch.setenv("BQ_DATASET", "demodata0")
    org_config = importlib.import_module("backend.app.analytics.org_config")
    importlib.reload(org_config)

    original = dict(org_config.ORG_TABLE_MAP)

    mapping = org_config.build_org_table_map()
    assert mapping["client0"] != mapping["client1"]

    try:
        org_config.override_org_table_map(mapping)
        assert (
            org_config.resolve_table_for_org("client0")
            == "nigzsu.demodata0.client0_compat"
        )
        assert (
            org_config.resolve_table_for_org("client1")
            == "nigzsu.demodata0.client1_compat"
        )
    finally:
        org_config.override_org_table_map(original)
