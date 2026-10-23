"""Correlation / detection engine.

Houses the deterministic correlation engine and its configurable rules. Each
rule consumes canonical events and produces evidence-linked, explainable
alerts. No detection logic lives anywhere else (and never in the frontend).
Populated from Phase 3 onward.
"""
