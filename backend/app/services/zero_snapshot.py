"""Pure, transient canonical projections for valid scopes without a snapshot."""

from datetime import datetime, timezone


def build_zero_snapshot(scope, selected_id, name, timestamp, traffic_entities=()):
    # Keep the existing lossless identity validator as the authority. Import here
    # because the Dashboard reader also delegates its zero projection to us.
    from .organisation_dashboard import entity_id

    if scope not in {"organisation", "site"}:
        raise ValueError("Invalid zero snapshot scope")
    if not isinstance(name, str) or not name.strip():
        raise ValueError("Invalid zero snapshot name")
    if not isinstance(timestamp, datetime) or timestamp.tzinfo is None:
        raise ValueError("Zero snapshot timestamp must be timezone aware")
    key = "site_id" if scope == "organisation" else "device_id"
    entities = [dict(**{key: entity_id(entity[key])}, name=entity["name"])
                for entity in traffic_entities]

    def rollup(length):
        return dict(
            entrances=[0] * length,
            occupancy=[[0, 0, 0] for _ in range(length)],
            exits=[0] * length,
            age_pct=[0] * 6,
            sex_pct=[0] * 2,
        )

    payload = dict(
        entrances_96=[0] * 96,
        occupancy_96=[[0, 0, 0] for _ in range(96)],
        exits_96=[0] * 96,
        footfall_96=[0] * 96,
        dwell_time_96=[0] * 96,
        traffic_devices=entities,
        traffic_split_96=[[0] * len(entities) for _ in range(96)],
        capacity=[[0, 0] for _ in range(96)],
    )
    payload.update({
        period: rollup(length) for period, length in (
            ("today", 24), ("yesterday", 24), ("week", 7),
            ("month", 4), ("quarter", 12), ("year", 12), ("all_time", 1),
        )
    })
    return dict(scope=scope, entity_id=entity_id(selected_id), entity_name=name,
                ts=timestamp.astimezone(timezone.utc).isoformat(), payload=payload)


def build_zero_scope_snapshot(scope):
    """Use already authorised metadata, never invent an entity or query history."""
    from .organisation_dashboard import EntityNotFound, entity_id

    organisation = scope.context["organisation"]
    if organisation["id"] != entity_id(scope.identity.organisation_id):
        raise EntityNotFound()
    if scope.site_id is None:
        selected_scope, selected = "organisation", organisation
        traffic = [dict(site_id=site["id"], name=site["name"])
                   for site in scope.context["sites"]]
    else:
        selected_scope = "site"
        selected = next((site for site in scope.context["sites"]
                         if site["id"] == scope.site_id
                         and site["organisation_id"] == organisation["id"]), None)
        if selected is None:
            raise EntityNotFound()
        traffic = [dict(device_id=source["ref"].split(":", 1)[1], name=source["label"])
                   for source in scope.context["sources"]
                   if source["kind"] == "device" and source["site_id"] == scope.site_id]
    timestamp = datetime.fromisoformat(scope.context["clock"]["effective_now"].replace("Z", "+00:00"))
    return build_zero_snapshot(selected_scope, selected["id"], selected["name"], timestamp, traffic)
