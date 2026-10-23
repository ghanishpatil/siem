import { useState, useEffect, useCallback, useMemo } from 'react'
import type {
  EvaluateSummary,
  RuleInfo,
  CorrelationMap,
  CorrelationSourceNode,
  CorrelationRuleNode,
  CorrelationEdge,
  EvaluatedAlertRef,
} from '../../types/alert'
import { evaluateAlerts, listRules } from '../../api/client'
import { CorrelationGraph } from '../common/CorrelationGraph'
import { SeverityBadge } from '../common/Badge'
import {
  NetworkIcon,
  PlayIcon,
  RefreshCwIcon,
  CheckCircleIcon,
  ShieldAlertIcon,
  LayersIcon,
  ActivityIcon,
  ClockIcon,
} from '../common/Icons'

type EngineState = 'idle' | 'loading_rules' | 'ready' | 'running' | 'completed' | 'error'

interface CorrelationEngineViewProps {
  onNavigateToAlert?: (alertId: number) => void
  onRefreshGlobal?: () => void
}

/**
 * Build a CorrelationMap from alert refs and rules when the backend
 * correlation_map is unavailable. This guarantees a graph whenever
 * there are detections.
 */
function buildGraphFromAlerts(
  alerts: EvaluatedAlertRef[],
  rules: RuleInfo[],
): CorrelationMap {
  // Group alerts by rule_id
  const byRule = new Map<string, EvaluatedAlertRef[]>()
  for (const a of alerts) {
    const arr = byRule.get(a.rule_id) ?? []
    arr.push(a)
    byRule.set(a.rule_id, arr)
  }

  const sourceNodes: CorrelationSourceNode[] = []
  const ruleNodes: CorrelationRuleNode[] = []
  const edges: CorrelationEdge[] = []

  for (const rule of rules) {
    if (!rule.enabled) continue
    const ruleAlerts = byRule.get(rule.id) ?? []

    ruleNodes.push({
      rule_id: rule.id,
      rule_name: rule.name,
      severity: rule.severity,
      matched_event_count: ruleAlerts.length,
      source_entities: [],
      alert_ids: ruleAlerts.map(a => a.id),
    })

    if (ruleAlerts.length > 0) {
      // Create a synthetic source node for this rule's matched events
      const srcLabel = `${rule.id} matches`
      sourceNodes.push({
        entity_type: 'detection',
        entity_value: srcLabel,
        event_count: ruleAlerts.length,
        event_types: [],
      })

      edges.push({
        source: `detection:${srcLabel}`,
        target: rule.id,
        weight: ruleAlerts.length,
        edge_type: 'event_to_rule',
      })

      for (const alert of ruleAlerts) {
        edges.push({
          source: rule.id,
          target: `alert:${alert.id}`,
          weight: 1,
          edge_type: 'rule_to_alert',
        })
      }
    }
  }

  return {
    source_nodes: sourceNodes,
    rule_nodes: ruleNodes,
    alert_nodes: alerts,
    edges,
  }
}

/**
 * Check whether a CorrelationMap from the backend has meaningful data.
 */
function isRichCorrelationMap(cm: unknown): cm is CorrelationMap {
  if (!cm || typeof cm !== 'object') return false
  const map = cm as Record<string, unknown>
  const srcs = Array.isArray(map.source_nodes) ? map.source_nodes : []
  const rules = Array.isArray(map.rule_nodes) ? map.rule_nodes : []
  return srcs.length > 0 || rules.length > 0
}

export function CorrelationEngineView({
  onNavigateToAlert,
  onRefreshGlobal,
}: CorrelationEngineViewProps) {
  const [engineState, setEngineState] = useState<EngineState>('idle')
  const [rules, setRules] = useState<RuleInfo[]>([])
  const [evalResult, setEvalResult] = useState<EvaluateSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [runTimestamp, setRunTimestamp] = useState<Date | null>(null)
  const [runDuration, setRunDuration] = useState<number | null>(null)
  const [autoAnimate, setAutoAnimate] = useState(true)
  const [history, setHistory] = useState<Array<{ timestamp: Date; summary: EvaluateSummary }>>([])

  // Load rules on mount
  useEffect(() => {
    let active = true
    setEngineState('loading_rules')
    listRules()
      .then((data) => {
        if (!active) return
        setRules(data)
        setEngineState('ready')
      })
      .catch(() => {
        if (!active) return
        setEngineState('ready')
      })
    return () => { active = false }
  }, [])

  const handleRunCorrelation = useCallback(async () => {
    setEngineState('running')
    setError(null)
    const startTime = Date.now()

    try {
      const result = await evaluateAlerts()
      const duration = Date.now() - startTime
      setEvalResult(result)
      setRunTimestamp(new Date())
      setRunDuration(duration)
      setEngineState('completed')
      setHistory(prev => [{ timestamp: new Date(), summary: result }, ...prev.slice(0, 9)])
      if (onRefreshGlobal) onRefreshGlobal()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
      setEngineState('error')
    }
  }, [onRefreshGlobal])

  const enabledRules = rules.filter(r => r.enabled)

  // Resolve graph data: prefer backend correlation_map, fall back to client-built graph
  const graphData: CorrelationMap | null = useMemo(() => {
    if (!evalResult) return null
    if (evalResult.detections === 0 && evalResult.alerts.length === 0) return null

    // Try the backend-provided map first
    if (isRichCorrelationMap(evalResult.correlation_map)) {
      return evalResult.correlation_map as CorrelationMap
    }

    // Fallback: build from alert refs + loaded rules
    if (evalResult.alerts.length > 0 && rules.length > 0) {
      return buildGraphFromAlerts(evalResult.alerts, rules)
    }

    return null
  }, [evalResult, rules])

  // Determine which rule nodes have hits for the sidebar badge
  const ruleHitCounts = useMemo(() => {
    const counts = new Map<string, number>()
    if (graphData?.rule_nodes) {
      for (const rn of graphData.rule_nodes) {
        if (rn.matched_event_count > 0) counts.set(rn.rule_id, rn.matched_event_count)
      }
    }
    return counts
  }, [graphData])

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-purple-950/60 border border-purple-500/40 text-purple-400">
            <NetworkIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-bold font-mono tracking-tight text-slate-100 flex items-center gap-2">
              Correlation Engine
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-500/30">
                LIVE
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5 max-w-2xl">
              Deterministic event correlation with real-time flow visualization. Evaluates all stored
              telemetry against {enabledRules.length} active detection rules.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setAutoAnimate(!autoAnimate)}
            className={`px-3 py-1.5 rounded text-[11px] font-mono border transition-colors ${
              autoAnimate
                ? 'bg-purple-950/40 border-purple-500/40 text-purple-300'
                : 'bg-panel-secondary border-border-subtle text-slate-400'
            }`}
          >
            {autoAnimate ? '● Live Flow' : '○ Static'}
          </button>

          <button
            onClick={handleRunCorrelation}
            disabled={engineState === 'running'}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-purple-500 text-white font-mono font-bold text-xs hover:bg-purple-400 transition-all shadow-[0_0_20px_rgba(139,92,246,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {engineState === 'running' ? (
              <>
                <RefreshCwIcon className="w-3.5 h-3.5 animate-spin" />
                Evaluating...
              </>
            ) : (
              <>
                <PlayIcon className="w-3.5 h-3.5" />
                Run Correlation Engine
              </>
            )}
          </button>
        </div>
      </div>

      {/* Stats Banner */}
      {evalResult && engineState === 'completed' && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <StatBlock label="Events Scanned" value={evalResult.events_evaluated} color="text-cyan-400" />
          <StatBlock label="Rules Active" value={evalResult.rules_enabled.length} color="text-purple-400" />
          <StatBlock label="Detections" value={evalResult.detections} color="text-amber-400" />
          <StatBlock label="Alerts Created" value={evalResult.alerts_created} color="text-rose-400" />
          <StatBlock label="Alerts Updated" value={evalResult.alerts_updated} color="text-emerald-400" />
          <StatBlock label="Engine Time" value={`${runDuration}ms`} color="text-slate-200" />
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Correlation Flow Graph (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="rounded-lg bg-panel-primary border border-border-subtle overflow-hidden">
            <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between bg-[#0c1120]">
              <div className="flex items-center gap-2">
                <ActivityIcon className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider">
                  Correlation Flow Graph
                </span>
              </div>
              {runTimestamp && (
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500">
                  <ClockIcon className="w-3 h-3" />
                  Last run: {runTimestamp.toLocaleTimeString()}
                </div>
              )}
            </div>

            <div className="p-4 min-h-[340px]">
              {engineState === 'idle' || engineState === 'loading_rules' || engineState === 'ready' ? (
                /* ── Idle state ── */
                <div className="flex flex-col items-center justify-center py-20 space-y-4">
                  <div className="w-16 h-16 rounded-full bg-purple-950/40 border border-purple-500/30 flex items-center justify-center">
                    <NetworkIcon className="w-7 h-7 text-purple-400" />
                  </div>
                  <div className="text-center space-y-1">
                    <div className="text-sm font-mono font-semibold text-slate-300">
                      Correlation Engine Ready
                    </div>
                    <p className="text-xs text-slate-500 max-w-md">
                      Click <strong className="text-purple-300">Run Correlation Engine</strong> to evaluate
                      all stored events against active detection rules and visualize the correlation flow.
                    </p>
                  </div>
                  <button
                    onClick={handleRunCorrelation}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-purple-500 text-white font-mono font-bold text-xs hover:bg-purple-400 transition-all shadow-[0_0_15px_rgba(139,92,246,0.25)]"
                  >
                    <PlayIcon className="w-3.5 h-3.5" />
                    Execute Engine
                  </button>
                </div>
              ) : engineState === 'running' ? (
                /* ── Running animation ── */
                <div className="flex flex-col items-center justify-center py-20 space-y-4">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full bg-purple-950/40 border-2 border-purple-500/50 flex items-center justify-center">
                      <RefreshCwIcon className="w-7 h-7 text-purple-400 animate-spin" />
                    </div>
                    <div className="absolute -inset-2 rounded-full border border-purple-500/20 animate-ping" />
                  </div>
                  <div className="text-sm font-mono font-semibold text-purple-300 animate-pulse">
                    Correlating events against rules...
                  </div>
                  <div className="flex items-center gap-4 text-[10px] font-mono text-slate-500">
                    <span>Loading events</span>
                    <span className="text-purple-400">→</span>
                    <span>Sliding windows</span>
                    <span className="text-purple-400">→</span>
                    <span>Generating detections</span>
                  </div>
                </div>
              ) : engineState === 'error' ? (
                /* ── Error state ── */
                <div className="flex flex-col items-center justify-center py-20 space-y-3">
                  <div className="text-rose-400 font-mono font-bold text-sm">Correlation Engine Error</div>
                  <p className="text-xs text-slate-400 max-w-md text-center">{error}</p>
                  <button
                    onClick={handleRunCorrelation}
                    className="px-3 py-1.5 rounded bg-panel-secondary border border-border-subtle text-slate-200 text-xs font-mono hover:text-white"
                  >
                    Retry
                  </button>
                </div>
              ) : graphData ? (
                /* ── Graph with data ── */
                <CorrelationGraph
                  data={graphData}
                  animated={autoAnimate}
                  onSelectAlert={onNavigateToAlert}
                />
              ) : (
                /* ── Completed but no detections ── */
                <div className="flex flex-col items-center justify-center py-16 space-y-3">
                  <CheckCircleIcon className="w-8 h-8 text-emerald-400" />
                  <div className="text-sm font-mono font-semibold text-emerald-300">
                    Engine completed — no active detections
                  </div>
                  <p className="text-xs text-slate-500 max-w-md text-center">
                    {evalResult?.events_evaluated ?? 0} events evaluated against {evalResult?.rules_enabled.length ?? 0} rules.
                    No patterns matched. Ingest more events or adjust rule thresholds.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Evaluated Incidents Table */}
          {evalResult && evalResult.alerts.length > 0 && (
            <div className="rounded-lg bg-panel-primary border border-border-subtle overflow-hidden">
              <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlertIcon className="w-3.5 h-3.5 text-rose-400" />
                  <span className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider">
                    Evaluated Incidents ({evalResult.alerts.length})
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="bg-panel-secondary border-b border-border-subtle text-[10px] text-slate-400 uppercase tracking-wider sticky top-0">
                      <th className="py-2 px-4">Alert ID</th>
                      <th className="py-2 px-4">Rule</th>
                      <th className="py-2 px-4">Fingerprint</th>
                      <th className="py-2 px-4 text-right">State</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {evalResult.alerts.map((ref) => (
                      <tr
                        key={ref.id}
                        onClick={() => onNavigateToAlert?.(ref.id)}
                        className="hover:bg-panel-secondary cursor-pointer transition-colors"
                      >
                        <td className="py-2 px-4 text-cyan-400 font-semibold">#{ref.id}</td>
                        <td className="py-2 px-4 text-slate-200">{ref.rule_id}</td>
                        <td className="py-2 px-4 text-slate-500 truncate max-w-48">{ref.fingerprint.slice(0, 16)}…</td>
                        <td className="py-2 px-4 text-right">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            ref.state === 'created'
                              ? 'bg-rose-950/80 text-rose-300 border border-rose-500/40'
                              : ref.state === 'updated'
                              ? 'bg-amber-950/80 text-amber-300 border border-amber-500/40'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}>
                            {ref.state.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Active Rules */}
          <div className="rounded-lg bg-panel-primary border border-border-subtle p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <LayersIcon className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider">
                  Active Rules ({enabledRules.length})
                </span>
              </div>
            </div>

            {rules.length > 0 ? (
              <div className="space-y-2">
                {rules.map((rule) => {
                  const hits = ruleHitCounts.get(rule.id) ?? 0
                  return (
                    <div
                      key={rule.id}
                      className={`p-3 rounded border transition-all ${
                        hits > 0
                          ? 'bg-panel-secondary border-purple-500/30'
                          : 'bg-panel-secondary border-border-subtle'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${rule.enabled ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                          <span className="font-mono font-bold text-xs text-cyan-400">{rule.id}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {hits > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-purple-950/80 text-purple-300 text-[10px] font-mono font-bold border border-purple-500/30">
                              {hits} hits
                            </span>
                          )}
                          <SeverityBadge severity={rule.severity} />
                        </div>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-400 truncate">{rule.name}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {Object.entries(rule.params).map(([k, v]) => (
                          <span key={k} className="px-1.5 py-0.5 rounded bg-black/30 text-[9px] font-mono text-slate-500">
                            {k}={v}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-[11px] font-mono text-slate-500 py-4 text-center">Loading rules...</div>
            )}
          </div>

          {/* Run History */}
          <div className="rounded-lg bg-panel-primary border border-border-subtle p-4 space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-border-subtle">
              <ClockIcon className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider">
                Run History
              </span>
            </div>
            {history.length === 0 ? (
              <div className="text-[11px] font-mono text-slate-500 py-4 text-center">
                No runs yet this session.
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {history.map((run, i) => (
                  <button
                    key={i}
                    onClick={() => { setEvalResult(run.summary); setRunTimestamp(run.timestamp); setEngineState('completed') }}
                    className="w-full p-2.5 rounded border border-border-subtle bg-panel-secondary hover:bg-panel-elevated transition-colors text-left"
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className="text-slate-400">{run.timestamp.toLocaleTimeString()}</span>
                      <span className="text-purple-300 font-bold">{run.summary.detections} det.</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[10px] font-mono text-slate-500">
                      <span>{run.summary.events_evaluated} evts</span>
                      <span>{run.summary.alerts_created} new</span>
                      <span>{run.summary.alerts_unchanged} unch.</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Engine Architecture */}
          <div className="rounded-lg bg-panel-primary border border-border-subtle p-4 space-y-2">
            <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
              Engine Architecture
            </div>
            <div className="space-y-1.5 text-[11px] font-mono text-slate-500">
              <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />Deterministic sliding-window correlation</div>
              <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-purple-400" />SHA-256 fingerprint deduplication</div>
              <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Entity-correlated grouping (IP, user)</div>
              <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Idempotent upsert (safe to re-run)</div>
              <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-rose-400" />Pure-function rules (no side effects)</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatBlock({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-lg bg-panel-primary border border-border-subtle p-3 text-center">
      <div className="text-[10px] font-mono text-slate-500 uppercase">{label}</div>
      <div className={`text-xl font-mono font-bold mt-1 ${color}`}>{value}</div>
    </div>
  )
}
