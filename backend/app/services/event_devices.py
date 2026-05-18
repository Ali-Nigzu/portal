"""Event-log device filter mapping and normalization."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List, Optional, Sequence, Set, Tuple


@dataclass(frozen=True)
class EventDevice:
    token: str
    site_id: int
    cam_id: Optional[int] = None

    @property
    def is_gateway(self) -> bool:
        return self.cam_id is None


EVENT_DEVICES = {
    "site-a:gateway": EventDevice("site-a:gateway", site_id=0),
    "site-a:cam-0": EventDevice("site-a:cam-0", site_id=0, cam_id=0),
    "site-a:cam-1": EventDevice("site-a:cam-1", site_id=0, cam_id=1),
    "site-b:gateway": EventDevice("site-b:gateway", site_id=1),
    "site-b:cam-0": EventDevice("site-b:cam-0", site_id=1, cam_id=0),
    "site-b:cam-1": EventDevice("site-b:cam-1", site_id=1, cam_id=1),
    "site-b:cam-2": EventDevice("site-b:cam-2", site_id=1, cam_id=2),
}


def normalize_device_tokens(
    tokens: Optional[Iterable[str]],
) -> Tuple[List[int], List[Tuple[int, int]]]:
    """Normalize selected device tokens into gateway sites and camera pairs.

    Gateway selections are site-level supersets. Any explicit camera pair for a
    gateway-selected site is removed so callers can build a single deduped SQL
    predicate.
    """

    if not tokens:
        return [], []

    gateway_site_ids: Set[int] = set()
    camera_pairs: Set[Tuple[int, int]] = set()

    for raw_token in tokens:
        token = str(raw_token).strip().lower()
        if not token:
            continue
        device = EVENT_DEVICES.get(token)
        if device is None:
            continue
        if device.is_gateway:
            gateway_site_ids.add(device.site_id)
        elif device.cam_id is not None:
            camera_pairs.add((device.site_id, device.cam_id))

    normalized_pairs = {
        pair for pair in camera_pairs if pair[0] not in gateway_site_ids
    }

    return sorted(gateway_site_ids), sorted(normalized_pairs)


def has_device_filters(tokens: Optional[Sequence[str]]) -> bool:
    if not tokens:
        return False
    gateway_site_ids, camera_pairs = normalize_device_tokens(tokens)
    return bool(gateway_site_ids or camera_pairs)
