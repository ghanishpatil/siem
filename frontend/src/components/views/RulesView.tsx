import { useState, useEffect } from 'react'
import type { RuleInfo } from '../../types/alert'
import { listRules } from '../../api/client'
import { SeverityBadge } from '../common/Badge'
import { EmptyState } from '../common/EmptyState'
import {
  LayersIcon,
  RefreshCwIcon,
} from '../common/Icons'

const RULE_EXPLANATIONS: Record<
  string,
  { purpose: string; mechanics: string; category: string }
> = {
  'AUTH-001': {
    category: 'Credential Access',
    purpose:
      'Detects automated dictionary or credential guessing attacks where an adversary attempts numerous invalid passwords against an authentication endpoint from a single source address.',
    mechanics:
      'Aggregates authentication_failure events strictly grouped by source_ip within a sliding time window. Triggers when failure count reaches or exceeds the threshold.',
  },
  'AUTH-002': {
    category: 'Credential Access',
    purpose:
      'Detects horizontal password spraying where an attacker tests a small set of common passwords across many distinct user accounts to avoid account lockout policies.',
    mechanics:
      'Tracks authentication failures from a single source_ip and counts distinct targeted usernames within a 300s window. Triggers when distinct usernames meet or exceed threshold.',
  },
  'AUTH-003': {
    category: 'Initial Access & Compromise',
    purpose:
      'Detects targeted brute force compromise where multiple authentication failures are followed by an immediate successful login for the same account and source address.',
    mechanics:
      'Correlates repeated authentication_failure events followed strictly by an authentication_success event for matching (source_ip, username) within the window. Rated Critical.',
  },
  'NET-001': {
    category: 'Discovery / Reconnaissance',
    purpose:
      'Detects adversarial reconnaissance or automated port scanners (e.g., Nmap, Masscan) probing host surface area for exposed network services.',
    mechanics:
      'Monitors network_connection telemetry from a source_ip and tallies unique destination ports probed within the window. Triggers when distinct port count meets threshold.',
  },
  'PRIV-001': {
    category: 'Privilege Escalation',
    purpose:
      'Detects local privilege escalation followed immediately by sensitive post-exploitation actions, such as unauthorized file access or privileged process execution.',
    mechanics:
      'Correlates a genuine privilege_escalation event with a subsequent sensitive action (file_access or process_creation) performed by the same username within 300 seconds.',
  },
}

export function RulesView() {
  const [rules, setRules] = useState<RuleInfo[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    listRules()
      .then((data) => {
        if (!active) return
        setRules(data)
      })
      .catch((err) => {
        if (!active) return
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Overview Banner */}
      <div className="rounded-lg bg-panel-primary border border-border-subtle p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <LayersIcon className="w-5 h-5 text-cyan-400" />
            <h2 className="text-sm font-mono font-bold text-slate-100 uppercase tracking-wider">
              Deterministic Detection Engine Catalog
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            SentinelX employs five deterministic, stateful correlation rules built on CIS-117
            standards. Each rule operates over normalized telemetry streams with exact entity
            correlation and window constraints. Rules are read-only and governed by the backend.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="px-3 py-1 rounded bg-panel-secondary border border-border-subtle text-xs font-mono text-cyan-300">
            5 Active Rules Loaded
          </div>
        </div>
      </div>

      {/* Rules Grid */}
      {loading ? (
        <div className="py-16 text-center text-xs font-mono text-slate-400">
          <RefreshCwIcon className="w-5 h-5 animate-spin text-cyan-400 mx-auto mb-2" />
          Loading active detection rules from engine...
        </div>
      ) : error ? (
        <EmptyState
          title="Rule Catalog Error"
          message={error}
          isError
          actionLabel="Retry"
          onAction={() => window.location.reload()}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rules.map((rule) => {
            const meta = RULE_EXPLANATIONS[rule.id] || {
              category: 'Detection',
              purpose: rule.description,
              mechanics: 'Evaluated against stored telemetry.',
            }

            return (
              <div
                key={rule.id}
                className="rounded-lg bg-panel-primary border border-border-subtle hover:border-slate-700 transition-all p-5 flex flex-col justify-between space-y-4"
              >
                <div>
                  {/* Top Bar: Rule ID, Severity, Status */}
                  <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-cyan-400">
                        {rule.id}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                        {meta.category}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={rule.severity} />
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded border ${
                          rule.enabled
                            ? 'bg-emerald-950/40 text-emerald-300 border-emerald-600/40'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            rule.enabled ? 'bg-emerald-400' : 'bg-slate-500'
                          }`}
                        />
                        {rule.enabled ? 'ENABLED' : 'DISABLED'}
                      </span>
                    </div>
                  </div>

                  {/* Title & Description */}
                  <div className="mt-3">
                    <h3 className="text-sm font-semibold text-slate-100">
                      {rule.name}
                    </h3>
                    <p className="mt-1 text-xs text-slate-300 leading-relaxed font-sans">
                      {rule.description}
                    </p>
                  </div>

                  {/* Purpose & Operational Mechanics */}
                  <div className="mt-3.5 space-y-2 text-xs">
                    <div className="p-2.5 rounded bg-panel-secondary border border-border-subtle space-y-1">
                      <div className="text-[10px] font-mono font-bold uppercase text-slate-400">
                        Detection Objective:
                      </div>
                      <div className="text-[11px] text-slate-300 font-sans leading-relaxed">
                        {meta.purpose}
                      </div>
                    </div>

                    <div className="p-2.5 rounded bg-panel-secondary border border-border-subtle space-y-1">
                      <div className="text-[10px] font-mono font-bold uppercase text-slate-400">
                        Correlation Logic:
                      </div>
                      <div className="text-[11px] text-slate-300 font-sans leading-relaxed">
                        {meta.mechanics}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Parameters & Thresholds Footer */}
                <div className="pt-3 border-t border-border-subtle">
                  <div className="text-[10px] font-mono font-semibold uppercase text-slate-400 mb-1.5">
                    Active Parameters & Window:
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs font-mono">
                    {Object.entries(rule.params).map(([key, val]) => (
                      <span
                        key={key}
                        className="px-2 py-0.5 rounded bg-panel-secondary border border-border-subtle text-slate-300"
                      >
                        <span className="text-cyan-400 font-medium">{key}:</span> {val}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
