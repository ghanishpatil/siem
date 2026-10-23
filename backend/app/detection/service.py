"""Correlation service: orchestrates loading events, running the engine, and
persisting alerts. This is the only detection component that touches the
database; rules and the engine remain pure.
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.detection import engine
from app.detection.base import EventView, RuleRuntimeConfig
from app.detection.rules import RULES, default_configs
from app.models.event import Event
from app.repositories import alert_repository, event_repository


class UnknownRuleError(ValueError):
    """Raised when an override references a rule id that does not exist."""


def _to_view(event: Event) -> EventView:
    return EventView(
        id=event.id,
        event_uid=event.event_uid,
        timestamp=event.timestamp,
        event_type=event.event_type,
        severity=event.severity,
        is_synthetic=event.is_synthetic,
        source_ip=event.source_ip,
        destination_ip=event.destination_ip,
        destination_port=event.destination_port,
        username=event.username,
        host=event.host,
    )


def build_configs(
    overrides: Optional[dict[str, dict[str, Any]]] = None,
) -> dict[str, RuleRuntimeConfig]:
    """Merge validated per-call overrides onto the default rule configuration."""
    configs = default_configs()
    if not overrides:
        return configs
    for rule_id, override in overrides.items():
        if rule_id not in configs:
            raise UnknownRuleError(f"unknown rule id: {rule_id}")
        base = configs[rule_id]
        enabled = base.enabled if override.get("enabled") is None else bool(override["enabled"])
        params = dict(base.params)
        if override.get("params"):
            params.update(override["params"])
        configs[rule_id] = RuleRuntimeConfig(enabled=enabled, params=params)
    return configs


def active_rules(
    overrides: Optional[dict[str, dict[str, Any]]] = None,
) -> list[dict[str, Any]]:
    """Return rule metadata with effective enabled status and thresholds."""
    configs = build_configs(overrides)
    result: list[dict[str, Any]] = []
    for rule in RULES:
        config = configs[rule.id]
        result.append(
            {
                "id": rule.id,
                "name": rule.name,
                "description": rule.description,
                "severity": rule.severity,
                "enabled": config.enabled,
                "params": {**rule.default_params, **config.params},
            }
        )
    return result


def _build_correlation_map(
    detections: list[Any],
    alert_refs: list[dict[str, Any]],
    configs: dict[str, Any],
) -> dict[str, Any]:
    """Build a correlation graph structure from detections and alert refs.

    Returns source nodes, rule nodes, edges, and alert nodes for the
    frontend flow-graph visualisation.
    """
    from collections import defaultdict

    # Gather per-rule detection details
    rule_detections: dict[str, list[Any]] = defaultdict(list)
    for det in detections:
        rule_detections[det.rule_id].append(det)

    # Build source nodes (unique entity → event counts)
    source_map: dict[str, dict[str, Any]] = {}  # "ip:10.0.0.5" → info
    for det in detections:
        entities: list[tuple[str, str]] = []
        if det.source_ip:
            entities.append(("source_ip", det.source_ip))
        if det.username:
            entities.append(("username", det.username))
        if not entities and det.host:
            entities.append(("host", det.host))
        for etype, evalue in entities:
            key = f"{etype}:{evalue}"
            if key not in source_map:
                source_map[key] = {
                    "entity_type": etype,
                    "entity_value": evalue,
                    "event_count": 0,
                    "event_types": set(),
                }
            source_map[key]["event_count"] += det.matched_count
            if det.description:
                # Extract event types from explanation if available
                for evt_type in det.explanation.get("event_types", []):
                    source_map[key]["event_types"].add(evt_type)

    source_nodes = [
        {
            "entity_type": v["entity_type"],
            "entity_value": v["entity_value"],
            "event_count": v["event_count"],
            "event_types": sorted(v["event_types"]) if v["event_types"] else [],
        }
        for v in source_map.values()
    ]

    # Build rule nodes
    rule_id_to_alert_ids: dict[str, list[int]] = defaultdict(list)
    for ref in alert_refs:
        rule_id_to_alert_ids[ref["rule_id"]].append(ref["id"])

    rule_nodes = []
    for rule in RULES:
        config = configs.get(rule.id)
        if config is None or not config.enabled:
            continue
        dets = rule_detections.get(rule.id, [])
        if not dets:
            rule_nodes.append({
                "rule_id": rule.id,
                "rule_name": rule.name,
                "severity": rule.severity,
                "matched_event_count": 0,
                "source_entities": [],
                "alert_ids": [],
            })
            continue

        src_entities = set()
        total_events = 0
        for det in dets:
            total_events += det.matched_count
            if det.source_ip:
                src_entities.add(f"source_ip:{det.source_ip}")
            if det.username:
                src_entities.add(f"username:{det.username}")

        rule_nodes.append({
            "rule_id": rule.id,
            "rule_name": rule.name,
            "severity": rule.severity,
            "matched_event_count": total_events,
            "source_entities": sorted(src_entities),
            "alert_ids": rule_id_to_alert_ids.get(rule.id, []),
        })

    # Build edges: source → rule and rule → alert
    edges = []
    for det in detections:
        entity_keys = []
        if det.source_ip:
            entity_keys.append(f"source_ip:{det.source_ip}")
        if det.username:
            entity_keys.append(f"username:{det.username}")
        for ek in entity_keys:
            edges.append({
                "source": ek,
                "target": det.rule_id,
                "weight": det.matched_count,
                "edge_type": "event_to_rule",
            })

    for ref in alert_refs:
        edges.append({
            "source": ref["rule_id"],
            "target": f"alert:{ref['id']}",
            "weight": 1,
            "edge_type": "rule_to_alert",
        })

    # Deduplicate edges (same source+target → sum weights)
    edge_key_map: dict[str, dict[str, Any]] = {}
    for edge in edges:
        key = f"{edge['source']}→{edge['target']}"
        if key in edge_key_map:
            edge_key_map[key]["weight"] += edge["weight"]
        else:
            edge_key_map[key] = dict(edge)

    return {
        "source_nodes": source_nodes,
        "rule_nodes": rule_nodes,
        "alert_nodes": alert_refs,
        "edges": list(edge_key_map.values()),
    }


def evaluate_and_persist(
    db: Session, overrides: Optional[dict[str, dict[str, Any]]] = None
) -> dict[str, Any]:
    """Evaluate persisted events against enabled rules and upsert alerts.

    Safe to call repeatedly: unchanged detections leave existing alerts
    untouched. All alert writes happen in a single transaction.
    """
    configs = build_configs(overrides)

    orm_events = event_repository.fetch_for_detection(db, settings.max_events_scan)
    views = [_to_view(event) for event in orm_events]

    detections = engine.evaluate(views, configs)

    created = updated = unchanged = 0
    alert_refs: list[dict[str, Any]] = []
    try:
        for detection in detections:
            alert, state = alert_repository.upsert_alert(db, detection)
            if state == "created":
                created += 1
            elif state == "updated":
                updated += 1
            else:
                unchanged += 1
            alert_refs.append(
                {
                    "id": alert.id,
                    "fingerprint": alert.fingerprint,
                    "rule_id": alert.rule_id,
                    "state": state,
                }
            )
        db.commit()
    except Exception:
        db.rollback()
        raise

    enabled_rules = sorted(rule_id for rule_id, cfg in configs.items() if cfg.enabled)
    correlation_map = _build_correlation_map(detections, alert_refs, configs)

    return {
        "events_evaluated": len(views),
        "rules_enabled": enabled_rules,
        "detections": len(detections),
        "alerts_created": created,
        "alerts_updated": updated,
        "alerts_unchanged": unchanged,
        "alerts": alert_refs,
        "correlation_map": correlation_map,
    }
