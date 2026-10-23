"""Detection rule registry.

Holds the ordered list of rules and builds their default runtime configuration.
Rule order is fixed so evaluation is deterministic.
"""

from __future__ import annotations

from app.detection.base import Rule, RuleRuntimeConfig
from app.detection.rules.auth_brute_force import BruteForceRule
from app.detection.rules.auth_failure_success import FailureThenSuccessRule
from app.detection.rules.auth_password_spray import PasswordSprayRule
from app.detection.rules.net_port_scan import PortScanRule
from app.detection.rules.priv_escalation import PrivilegeEscalationRule

RULES: list[Rule] = [
    BruteForceRule(),
    PasswordSprayRule(),
    FailureThenSuccessRule(),
    PortScanRule(),
    PrivilegeEscalationRule(),
]

RULES_BY_ID: dict[str, Rule] = {rule.id: rule for rule in RULES}


def default_configs() -> dict[str, RuleRuntimeConfig]:
    """Return the default enabled/threshold configuration for every rule."""
    return {
        rule.id: RuleRuntimeConfig(enabled=rule.default_enabled, params=dict(rule.default_params))
        for rule in RULES
    }
