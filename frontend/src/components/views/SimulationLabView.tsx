import { useState } from 'react'
import {
  SCENARIO_DEFINITIONS,
  generateScenarioEvents,
  type ScenarioId,
  type SyntheticEvent,
} from '../../utils/scenarioGenerator'
import {
  ingestJsonEvents,
  evaluateAlerts,
  listAlerts,
} from '../../api/client'
import type { IngestSummary } from '../../types/event'
import type { EvaluateSummary, AlertResponse } from '../../types/alert'
import {
  ShieldAlertIcon,
  CrosshairIcon,
  PlayIcon,
  RefreshCwIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  XCircleIcon,
  TerminalIcon,
  LayersIcon,
  FlaskIcon,
  FileTextIcon,
} from '../common/Icons'
import { SeverityBadge } from '../common/Badge'
import { Modal } from '../common/Modal'

export type SimulationState =
  | 'idle'
  | 'generating'
  | 'generated'
  | 'ingesting'
  | 'ingestion_completed'
  | 'ingestion_partial'
  | 'ingestion_failed'
  | 'awaiting_correlation'
  | 'evaluating'
  | 'correlation_completed'
  | 'detected'
  | 'not_detected'
  | 'evaluation_failed'

interface SimulationRun {
  runId: string
  scenarioId: ScenarioId
  state: SimulationState
  events: SyntheticEvent[]
  ingestSummary: IngestSummary | null
  ingestStatus: number | null
  ingestError: string | null
  evalSummary: EvaluateSummary | null
  evalError: string | null
  matchedAlert: AlertResponse | null
  timestamp: Date
}

interface SimulationLabViewProps {
  onNavigateToAlert?: (alertId: number) => void
  onNavigateToEvents?: () => void
  onRefreshGlobal?: () => void
}

export function SimulationLabView({
  onNavigateToAlert,
  onNavigateToEvents,
  onRefreshGlobal,
}: SimulationLabViewProps) {
  const [selectedScenarioId, setSelectedScenarioId] = useState<ScenarioId>('AUTH-001')
  const [activeRun, setActiveRun] = useState<SimulationRun | null>(null)
  const [inspectEvent, setInspectEvent] = useState<SyntheticEvent | null>(null)
  const [history, setHistory] = useState<SimulationRun[]>([])

  const currentDef = SCENARIO_DEFINITIONS[selectedScenarioId]

  // Step 1: Generate Events
  function handleGenerateScenario(scenarioId: ScenarioId) {
    setSelectedScenarioId(scenarioId)
    const runId = Math.random().toString(36).substring(2, 8).toUpperCase()
    const events = generateScenarioEvents(scenarioId, runId)

    const newRun: SimulationRun = {
      runId,
      scenarioId,
      state: 'generated',
      events,
      ingestSummary: null,
      ingestStatus: null,
      ingestError: null,
      evalSummary: null,
      evalError: null,
      matchedAlert: null,
      timestamp: new Date(),
    }

    setActiveRun(newRun)
  }

  // Step 2: Ingest synthetic events to POST /api/events/ingest
  async function handleIngestEvents() {
    if (!activeRun || activeRun.events.length === 0) return

    setActiveRun((prev) => (prev ? { ...prev, state: 'ingesting', ingestError: null } : null))

    try {
      const { status, summary } = await ingestJsonEvents(activeRun.events)

      const isPartial = summary.rejected_count > 0 && summary.accepted_count > 0
      const isFailed = summary.accepted_count === 0 && summary.rejected_count > 0
      const nextState: SimulationState = isFailed
        ? 'ingestion_failed'
        : isPartial
        ? 'ingestion_partial'
        : 'ingestion_completed'

      setActiveRun((prev) => {
        if (!prev) return null
        return {
          ...prev,
          state: nextState,
          ingestSummary: summary,
          ingestStatus: status,
        }
      })

      // Notify global telemetry listener that new events were persisted
      if (onRefreshGlobal) {
        onRefreshGlobal()
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setActiveRun((prev) =>
        prev
          ? {
              ...prev,
              state: 'ingestion_failed',
              ingestError: msg,
            }
          : null
      )
    }
  }

  // Step 3: Explicit Correlation Click calling POST /api/alerts/evaluate
  async function handleRunCorrelation() {
    if (!activeRun) return

    setActiveRun((prev) => (prev ? { ...prev, state: 'evaluating', evalError: null } : null))

    try {
      // POST /api/alerts/evaluate (pure correlation, no overrides)
      const evalSummary = await evaluateAlerts()

      // Fetch latest alerts from GET /api/alerts to identify matching detection
      const alertsList = await listAlerts({ limit: 50 })

      // Match logic:
      // The alert must match the scenario's rule_id AND at least one evidence event ID
      // from the current run's accepted records
      const acceptedEventIds = new Set(
        (activeRun.ingestSummary?.accepted || []).map((acc) => acc.id)
      )

      const matchingAlert = alertsList.items.find((alert) => {
        if (alert.rule_id !== activeRun.scenarioId) return false
        // Check if any evidence event ID belongs to the current run
        const hasEvidenceMatch = alert.evidence_event_ids.some((id) =>
          acceptedEventIds.has(id)
        )
        // Or if correlation entity (source IP or username) matches our run's first event
        const sampleEvent = activeRun.events[0]
        const entityMatch =
          (alert.source_ip && alert.source_ip === sampleEvent.source_ip) ||
          (alert.username && alert.username === sampleEvent.username)

        return hasEvidenceMatch || entityMatch
      })

      const finalState: SimulationState = matchingAlert ? 'detected' : 'not_detected'

      setActiveRun((prev) => {
        if (!prev) return null
        const completedRun: SimulationRun = {
          ...prev,
          state: finalState,
          evalSummary,
          matchedAlert: matchingAlert || null,
        }
        // Save to history
        setHistory((h) => [completedRun, ...h.slice(0, 9)])
        return completedRun
      })

      // Refresh global telemetry badge counters
      if (onRefreshGlobal) {
        onRefreshGlobal()
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setActiveRun((prev) =>
        prev
          ? {
              ...prev,
              state: 'evaluation_failed',
              evalError: msg,
            }
          : null
      )
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-cyan-950/60 border border-cyan-500/40 text-cyan-400">
              <FlaskIcon className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold font-mono tracking-tight text-slate-100 flex items-center gap-2">
                Attack Simulation Lab
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-500/30">
                  PHASE 6
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5 max-w-2xl">
                Generate controlled synthetic security events and validate SentinelX detection rules in an isolated demonstration environment.
              </p>
            </div>
          </div>
        </div>

        {/* Global Pipeline Indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-panel-secondary border border-border-subtle text-xs font-mono text-slate-300">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span>Pipeline: Ingest → Correlate → Verify</span>
        </div>
      </div>

      {/* 5 Scenario Cards Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <CrosshairIcon className="w-3.5 h-3.5 text-cyan-400" />
            Detection Scenarios Catalog (5 Rules)
          </h2>
          <span className="text-[11px] font-mono text-slate-500">
            Click "Generate Scenario" to load synthetic events
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {(Object.keys(SCENARIO_DEFINITIONS) as ScenarioId[]).map((id) => {
            const def = SCENARIO_DEFINITIONS[id]
            const isSelected = selectedScenarioId === id
            const isCurrentActive = activeRun?.scenarioId === id

            return (
              <div
                key={id}
                onClick={() => setSelectedScenarioId(id)}
                className={`p-4 rounded-lg border flex flex-col justify-between transition-all cursor-pointer relative ${
                  isSelected
                    ? 'bg-panel-primary border-cyan-500/60 shadow-[0_0_15px_rgba(0,229,255,0.08)]'
                    : 'bg-panel-primary border-border-subtle hover:border-slate-700'
                }`}
              >
                <div>
                  {/* Top Bar: Rule ID & Severity */}
                  <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
                    <span className="font-mono font-bold text-xs text-cyan-400">
                      {def.ruleId}
                    </span>
                    <SeverityBadge severity={def.severity} />
                  </div>

                  {/* Title & Description */}
                  <div className="mt-2.5">
                    <h3 className="text-xs font-semibold text-slate-100 leading-snug">
                      {def.name}
                    </h3>
                    <p className="mt-1 text-[11px] text-slate-400 leading-relaxed line-clamp-3">
                      {def.shortDescription}
                    </p>
                  </div>

                  {/* Pattern Requirement */}
                  <div className="mt-3 p-2 rounded bg-panel-secondary border border-border-subtle text-[10px] font-mono text-slate-300 space-y-1">
                    <div className="text-slate-500 uppercase tracking-wider font-semibold">Pattern:</div>
                    <div className="text-cyan-300 leading-tight">
                      {def.expectedPattern}
                    </div>
                  </div>
                </div>

                {/* Card Action */}
                <div className="mt-4 pt-2 border-t border-border-subtle flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-500">
                    {def.eventCount} Events
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleGenerateScenario(id)
                    }}
                    className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-all ${
                      isCurrentActive && activeRun?.state !== 'idle'
                        ? 'bg-cyan-500 text-slate-950 font-bold'
                        : 'bg-panel-secondary border border-border-subtle text-slate-200 hover:text-white hover:bg-panel-elevated hover:border-cyan-500/40'
                    }`}
                  >
                    Generate Scenario
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Simulation Execution & Results Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Interactive Execution Console (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-lg bg-panel-primary border border-border-subtle p-5 space-y-5">
            {/* Console Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-border-subtle">
              <div>
                <div className="flex items-center gap-2">
                  <TerminalIcon className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
                    Active Scenario: {currentDef.name} ({currentDef.ruleId})
                  </h3>
                </div>
                <div className="text-[11px] font-mono text-slate-400 mt-1">
                  Threshold Constraint: <span className="text-cyan-300">{currentDef.thresholdRequirement}</span>
                </div>
              </div>

              {activeRun && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-500">RUN ID:</span>
                  <span className="px-2 py-0.5 rounded bg-black/60 border border-border-subtle text-[11px] font-mono text-cyan-400 font-bold">
                    #{activeRun.runId}
                  </span>
                </div>
              )}
            </div>

            {/* Lifecycle State Banner */}
            {!activeRun ? (
              <div className="py-12 text-center space-y-3 font-mono">
                <div className="w-10 h-10 rounded-full bg-panel-secondary border border-border-subtle flex items-center justify-center mx-auto text-slate-400">
                  <PlayIcon className="w-4 h-4" />
                </div>
                <div className="text-sm font-semibold text-slate-300">
                  Simulation Console Idle
                </div>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Select any scenario from the catalog above and click <strong>Generate Scenario</strong> to prepare deterministic synthetic events.
                </p>
                <button
                  onClick={() => handleGenerateScenario(selectedScenarioId)}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-cyan-500 text-slate-950 font-mono font-bold text-xs hover:bg-cyan-400 transition-colors"
                >
                  <PlayIcon className="w-3.5 h-3.5" />
                  Generate {currentDef.ruleId} Scenario
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Visual Pipeline Stepper */}
                <div className="grid grid-cols-4 gap-2 text-center text-xs font-mono">
                  {/* Step 1: Generated */}
                  <div
                    className={`p-2.5 rounded border transition-colors ${
                      ['generated', 'ingesting', 'ingestion_completed', 'ingestion_partial', 'evaluating', 'detected', 'not_detected'].includes(
                        activeRun.state
                      )
                        ? 'bg-cyan-950/40 border-cyan-500/50 text-cyan-300'
                        : 'bg-panel-secondary border-border-subtle text-slate-500'
                    }`}
                  >
                    <div className="text-[10px] uppercase font-bold">1. Generated</div>
                    <div className="text-xs mt-0.5">{activeRun.events.length} Events</div>
                  </div>

                  {/* Step 2: Ingested */}
                  <div
                    className={`p-2.5 rounded border transition-colors ${
                      ['ingestion_completed', 'ingestion_partial', 'evaluating', 'detected', 'not_detected'].includes(
                        activeRun.state
                      )
                        ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                        : activeRun.state === 'ingesting'
                        ? 'bg-amber-950/40 border-amber-500/50 text-amber-300 animate-pulse'
                        : activeRun.state === 'ingestion_failed'
                        ? 'bg-rose-950/40 border-rose-500/50 text-rose-300'
                        : 'bg-panel-secondary border-border-subtle text-slate-500'
                    }`}
                  >
                    <div className="text-[10px] uppercase font-bold">2. Ingested</div>
                    <div className="text-xs mt-0.5">
                      {activeRun.ingestSummary
                        ? `${activeRun.ingestSummary.accepted_count} Accepted`
                        : activeRun.state === 'ingesting'
                        ? 'Submitting...'
                        : 'Pending Ingest'}
                    </div>
                  </div>

                  {/* Step 3: Evaluated */}
                  <div
                    className={`p-2.5 rounded border transition-colors ${
                      ['detected', 'not_detected'].includes(activeRun.state)
                        ? 'bg-purple-950/40 border-purple-500/50 text-purple-300'
                        : activeRun.state === 'evaluating'
                        ? 'bg-cyan-950/40 border-cyan-500/50 text-cyan-300 animate-pulse'
                        : 'bg-panel-secondary border-border-subtle text-slate-500'
                    }`}
                  >
                    <div className="text-[10px] uppercase font-bold">3. Evaluated</div>
                    <div className="text-xs mt-0.5">
                      {activeRun.evalSummary
                        ? `${activeRun.evalSummary.events_evaluated} Evts`
                        : activeRun.state === 'evaluating'
                        ? 'Running...'
                        : 'Explicit Click'}
                    </div>
                  </div>

                  {/* Step 4: Detected */}
                  <div
                    className={`p-2.5 rounded border transition-colors ${
                      activeRun.state === 'detected'
                        ? 'bg-rose-950/40 border-rose-500/60 text-rose-300'
                        : activeRun.state === 'not_detected'
                        ? 'bg-slate-900 border-slate-700 text-slate-400'
                        : activeRun.state === 'evaluation_failed'
                        ? 'bg-rose-950/40 border-rose-500/60 text-rose-300'
                        : 'bg-panel-secondary border-border-subtle text-slate-500'
                    }`}
                  >
                    <div className="text-[10px] uppercase font-bold">4. Verdict</div>
                    <div className="text-xs mt-0.5 font-bold">
                      {activeRun.state === 'detected'
                        ? 'DETECTED'
                        : activeRun.state === 'not_detected'
                        ? 'NOT DETECTED'
                        : activeRun.state === 'evaluation_failed'
                        ? 'FAILED'
                        : 'Awaiting'}
                    </div>
                  </div>
                </div>

                {/* State-Driven Action Controls */}
                <div className="p-4 rounded-lg bg-panel-secondary border border-border-subtle space-y-3 font-mono text-xs">
                  {/* GENERATED state -> Action: Ingest to Public API */}
                  {activeRun.state === 'generated' && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-200">
                          {activeRun.events.length} Synthetic Events Ready for Ingestion
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Payload conforms with <code className="text-cyan-300">POST /api/events/ingest</code> schema.
                        </div>
                      </div>
                      <button
                        onClick={handleIngestEvents}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-md bg-cyan-500 text-slate-950 font-bold text-xs hover:bg-cyan-400 transition-colors shrink-0"
                      >
                        <PlayIcon className="w-3.5 h-3.5" />
                        Ingest Events to API
                      </button>
                    </div>
                  )}

                  {/* INGESTING state */}
                  {activeRun.state === 'ingesting' && (
                    <div className="flex items-center gap-3 text-cyan-400 py-1">
                      <RefreshCwIcon className="w-4 h-4 animate-spin shrink-0" />
                      <span>Submitting events to POST /api/events/ingest through public API proxy...</span>
                    </div>
                  )}

                  {/* INGESTION FAILED state */}
                  {activeRun.state === 'ingestion_failed' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-rose-400 font-semibold">
                        <XCircleIcon className="w-4 h-4 shrink-0" />
                        <span>Ingestion Failed</span>
                      </div>
                      <div className="text-slate-300 text-[11px]">
                        {activeRun.ingestError || 'Unknown validation or network error.'}
                      </div>
                      <button
                        onClick={handleIngestEvents}
                        className="mt-2 px-3 py-1 rounded bg-panel-primary border border-border-subtle text-slate-200 hover:text-white"
                      >
                        Retry Ingestion
                      </button>
                    </div>
                  )}

                  {/* INGESTION COMPLETED / PARTIAL -> Action: Explicit RUN CORRELATION */}
                  {['ingestion_completed', 'ingestion_partial'].includes(activeRun.state) && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-emerald-400">
                          <CheckCircleIcon className="w-4 h-4" />
                          <span className="font-semibold">
                            {activeRun.ingestSummary?.accepted_count} Events Successfully Ingested & Persisted in DB
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500">
                          HTTP {activeRun.ingestStatus}
                        </span>
                      </div>

                      <div className="p-3 rounded bg-panel-primary border border-cyan-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="font-bold text-slate-100 flex items-center gap-1.5">
                            <LayersIcon className="w-3.5 h-3.5 text-cyan-400" />
                            Next Step: Explicit Correlation Evaluation
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Run SentinelX detection engine to evaluate stored events against active rules.
                          </div>
                        </div>

                        <button
                          onClick={handleRunCorrelation}
                          className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-md bg-cyan-400 text-slate-950 font-bold text-xs hover:bg-cyan-300 transition-all shadow-[0_0_15px_rgba(0,229,255,0.25)] shrink-0"
                        >
                          <PlayIcon className="w-3.5 h-3.5" />
                          RUN CORRELATION
                        </button>
                      </div>
                    </div>
                  )}

                  {/* EVALUATING state */}
                  {activeRun.state === 'evaluating' && (
                    <div className="flex items-center gap-3 text-cyan-400 py-1">
                      <RefreshCwIcon className="w-4 h-4 animate-spin shrink-0" />
                      <span>Correlation Engine executing: evaluating persisted telemetry against rules...</span>
                    </div>
                  )}

                  {/* DETECTED state -> Confirmed Alert */}
                  {activeRun.state === 'detected' && activeRun.matchedAlert && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-rose-400 font-bold">
                          <ShieldAlertIcon className="w-4 h-4" />
                          <span>INCIDENT DETECTED & VERIFIED BY BACKEND</span>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-rose-950/80 border border-rose-500/40 text-rose-300 text-[10px] font-bold">
                          ALERT #{activeRun.matchedAlert.id}
                        </span>
                      </div>

                      <div className="p-3.5 rounded-lg bg-panel-primary border border-rose-500/40 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-100 text-xs">
                            {activeRun.matchedAlert.rule_name}
                          </span>
                          <SeverityBadge severity={activeRun.matchedAlert.severity} />
                        </div>
                        <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                          {activeRun.matchedAlert.description}
                        </p>
                        <div className="pt-2 border-t border-border-subtle flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400">
                          <div>
                            Matched: <span className="text-cyan-400 font-semibold">{activeRun.matchedAlert.matched_count} events</span> | Status: <span className="text-slate-200 uppercase">{activeRun.matchedAlert.status}</span>
                          </div>
                          {onNavigateToAlert && (
                            <button
                              onClick={() => onNavigateToAlert(activeRun.matchedAlert!.id)}
                              className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold underline"
                            >
                              Open Incident Details →
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* NOT DETECTED state */}
                  {activeRun.state === 'not_detected' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-amber-400 font-bold">
                        <AlertTriangleIcon className="w-4 h-4 shrink-0" />
                        <span>Correlation Completed — No Detection Alert Found</span>
                      </div>
                      <p className="text-slate-400 text-[11px] font-sans">
                        The correlation engine evaluated the database, but no alert matching this scenario's rule or evidence entity was generated. This may happen if thresholds were not satisfied or parameters differed.
                      </p>
                    </div>
                  )}

                  {/* EVALUATION FAILED state (API/network error — not a verdict) */}
                  {activeRun.state === 'evaluation_failed' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-rose-400 font-bold">
                        <XCircleIcon className="w-4 h-4 shrink-0" />
                        <span>Correlation Failed</span>
                      </div>
                      <p className="text-slate-300 text-[11px] font-sans">
                        {activeRun.evalError ||
                          'The evaluation request to the backend failed. No detection verdict is available.'}
                      </p>
                      <button
                        onClick={handleRunCorrelation}
                        className="mt-1 px-3 py-1 rounded bg-panel-primary border border-border-subtle text-slate-200 hover:text-white"
                      >
                        Retry Correlation
                      </button>
                    </div>
                  )}
                </div>

                {/* Generated Event Sequence Table */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-slate-300 flex items-center gap-1.5">
                      <TerminalIcon className="w-3.5 h-3.5 text-cyan-400" />
                      Generated Event Telemetry Sequence ({activeRun.events.length})
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      Click any row to inspect JSON payload
                    </span>
                  </div>

                  <div className="rounded-lg bg-panel-primary border border-border-subtle overflow-hidden">
                    <div className="overflow-x-auto max-h-64">
                      <table className="w-full text-left text-xs font-mono">
                        <thead>
                          <tr className="bg-panel-secondary border-b border-border-subtle text-[10px] text-slate-400 uppercase tracking-wider sticky top-0">
                            <th className="py-2 px-3">UID</th>
                            <th className="py-2 px-3">Timestamp (UTC)</th>
                            <th className="py-2 px-3">Event Type</th>
                            <th className="py-2 px-3">Entity (IP / User)</th>
                            <th className="py-2 px-3">Port</th>
                            <th className="py-2 px-3 text-right">Inspect</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                          {activeRun.events.map((evt) => (
                            <tr
                              key={evt.event_uid}
                              onClick={() => setInspectEvent(evt)}
                              className="hover:bg-panel-secondary cursor-pointer transition-colors text-[11px]"
                            >
                              <td className="py-2 px-3 text-cyan-400 font-semibold truncate max-w-32">
                                {evt.event_uid}
                              </td>
                              <td className="py-2 px-3 text-slate-400 whitespace-nowrap">
                                {new Date(evt.timestamp).toUTCString().slice(17, 25)}
                              </td>
                              <td className="py-2 px-3 text-slate-200">
                                {evt.event_type}
                              </td>
                              <td className="py-2 px-3 text-slate-300 truncate max-w-40">
                                {evt.source_ip || evt.username || '—'}
                              </td>
                              <td className="py-2 px-3 text-slate-400">
                                {evt.destination_port ?? '—'}
                              </td>
                              <td className="py-2 px-3 text-right">
                                <span className="text-[10px] text-cyan-400 hover:underline">
                                  Payload
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Telemetry & Ingestion Evidence HUD (5 cols) */}
        <div className="lg:col-span-5 space-y-4 font-mono text-xs">
          {/* Detailed Ingestion Response Breakdown */}
          <div className="rounded-lg bg-panel-primary border border-border-subtle p-5 space-y-4">
            <div className="pb-3 border-b border-border-subtle flex items-center justify-between">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
                Backend Ingestion Status
              </h3>
              {activeRun?.ingestStatus && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-panel-secondary border border-border-subtle text-cyan-300 font-semibold">
                  HTTP {activeRun.ingestStatus}
                </span>
              )}
            </div>

            {activeRun?.ingestSummary ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-2.5 rounded bg-panel-secondary border border-border-subtle">
                    <div className="text-[10px] uppercase text-slate-400">Submitted</div>
                    <div className="text-lg font-bold text-slate-100">{activeRun.ingestSummary.received_count}</div>
                  </div>
                  <div className="p-2.5 rounded bg-emerald-950/20 border border-emerald-800/30">
                    <div className="text-[10px] uppercase text-emerald-400">Accepted</div>
                    <div className="text-lg font-bold text-emerald-300">{activeRun.ingestSummary.accepted_count}</div>
                  </div>
                  <div className="p-2.5 rounded bg-amber-950/20 border border-amber-800/30">
                    <div className="text-[10px] uppercase text-amber-400">Duplicates</div>
                    <div className="text-lg font-bold text-amber-300">{activeRun.ingestSummary.duplicate_count}</div>
                  </div>
                  <div className="p-2.5 rounded bg-rose-950/20 border border-rose-800/30">
                    <div className="text-[10px] uppercase text-rose-400">Rejected</div>
                    <div className="text-lg font-bold text-rose-300">{activeRun.ingestSummary.rejected_count}</div>
                  </div>
                </div>

                {/* Accepted IDs List */}
                {activeRun.ingestSummary.accepted.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-400">
                      <div className="flex items-center gap-1.5">
                        <CheckCircleIcon className="w-3.5 h-3.5" />
                        Persisted Event IDs ({activeRun.ingestSummary.accepted.length}):
                      </div>
                      {onNavigateToEvents && (
                        <button
                          onClick={onNavigateToEvents}
                          className="text-[10px] text-cyan-400 hover:text-cyan-300 underline font-mono"
                        >
                          View in Event Explorer →
                        </button>
                      )}
                    </div>
                    <div className="max-h-28 overflow-y-auto divide-y divide-border-subtle border border-border-subtle rounded bg-panel-secondary">
                      {activeRun.ingestSummary.accepted.map((acc) => (
                        <div key={acc.id} className="p-1.5 flex items-center justify-between text-[11px]">
                          <span className="text-slate-200">ID #{acc.id}</span>
                          <span className="text-cyan-400">{acc.event_uid}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 text-center text-slate-500 text-xs">
                {activeRun
                  ? 'Click "Ingest Events to API" to submit the batch to the database.'
                  : 'Awaiting scenario generation to display ingestion metrics.'}
              </div>
            )}
          </div>

          {/* Correlation Engine Evaluation Telemetry */}
          <div className="rounded-lg bg-panel-primary border border-border-subtle p-5 space-y-4">
            <div className="pb-3 border-b border-border-subtle flex items-center justify-between">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
                Correlation Evaluation Output
              </h3>
              {activeRun?.evalSummary && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/50 border border-emerald-500/30 text-emerald-300 font-semibold">
                  EVALUATED
                </span>
              )}
            </div>

            {activeRun?.evalSummary ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-2 rounded bg-panel-secondary border border-border-subtle">
                    <div className="text-[10px] uppercase text-slate-400">Events Evaluated</div>
                    <div className="text-base font-bold text-slate-100">{activeRun.evalSummary.events_evaluated}</div>
                  </div>
                  <div className="p-2 rounded bg-panel-secondary border border-border-subtle">
                    <div className="text-[10px] uppercase text-cyan-400">Detections</div>
                    <div className="text-base font-bold text-cyan-300">{activeRun.evalSummary.detections}</div>
                  </div>
                  <div className="p-2 rounded bg-panel-secondary border border-border-subtle">
                    <div className="text-[10px] uppercase text-emerald-400">Alerts Created</div>
                    <div className="text-base font-bold text-emerald-300">{activeRun.evalSummary.alerts_created}</div>
                  </div>
                  <div className="p-2 rounded bg-panel-secondary border border-border-subtle">
                    <div className="text-[10px] uppercase text-slate-400">Unchanged</div>
                    <div className="text-base font-bold text-slate-300">{activeRun.evalSummary.alerts_unchanged}</div>
                  </div>
                </div>

                {activeRun.evalSummary.alerts && activeRun.evalSummary.alerts.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold text-slate-300">
                      Evaluated Alert Fingerprints:
                    </div>
                    <div className="max-h-24 overflow-y-auto divide-y divide-border-subtle border border-border-subtle rounded bg-panel-secondary">
                      {activeRun.evalSummary.alerts.map((alr) => (
                        <div key={alr.id} className="p-1.5 flex items-center justify-between text-[11px]">
                          <span className="text-cyan-400">#{alr.id} ({alr.rule_id})</span>
                          <span className="text-slate-400 uppercase text-[10px]">{alr.state}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-6 text-center text-slate-500 text-xs">
                No correlation evaluation executed for the current run yet.
              </div>
            )}
          </div>

          {/* Recent Simulation Runs History */}
          {history.length > 0 && (
            <div className="rounded-lg bg-panel-primary border border-border-subtle p-4 space-y-2">
              <div className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider">
                Recent Simulation Runs
              </div>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {history.map((run, idx) => (
                  <div
                    key={idx}
                    onClick={() => setActiveRun(run)}
                    className="p-2 rounded bg-panel-secondary hover:bg-panel-elevated border border-border-subtle flex items-center justify-between cursor-pointer transition-colors text-[11px]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-cyan-400 font-bold">#{run.runId}</span>
                      <span className="text-slate-300">{run.scenarioId}</span>
                    </div>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        run.state === 'detected'
                          ? 'bg-rose-950/60 text-rose-300 border border-rose-600/40'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {run.state.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Inspect Synthetic Event Payload Modal */}
      <Modal
        isOpen={inspectEvent !== null}
        onClose={() => setInspectEvent(null)}
        title={inspectEvent ? `Synthetic Event: ${inspectEvent.event_uid}` : 'Event Details'}
        subtitle={inspectEvent?.event_type}
        maxWidth="max-w-3xl"
      >
        {inspectEvent && (
          <div className="space-y-4 text-xs font-mono">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-2.5 rounded bg-panel-secondary border border-border-subtle">
                <div className="text-slate-500 text-[10px] uppercase">Timestamp (UTC)</div>
                <div className="text-slate-200 mt-0.5 font-semibold">
                  {new Date(inspectEvent.timestamp).toUTCString()}
                </div>
              </div>
              <div className="p-2.5 rounded bg-panel-secondary border border-border-subtle">
                <div className="text-slate-500 text-[10px] uppercase">Severity</div>
                <div className="mt-0.5">
                  <SeverityBadge severity={inspectEvent.severity} />
                </div>
              </div>
              <div className="p-2.5 rounded bg-panel-secondary border border-border-subtle">
                <div className="text-slate-500 text-[10px] uppercase">Source IP</div>
                <div className="text-slate-200 mt-0.5 font-semibold">
                  {inspectEvent.source_ip || 'None'}
                </div>
              </div>
              <div className="p-2.5 rounded bg-panel-secondary border border-border-subtle">
                <div className="text-slate-500 text-[10px] uppercase">Username</div>
                <div className="text-slate-200 mt-0.5 font-semibold">
                  {inspectEvent.username || 'None'}
                </div>
              </div>
            </div>

            <div className="space-y-1.5 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <FileTextIcon className="w-3.5 h-3.5 text-cyan-400" />
                  Full Synthetic Ingest Payload (JSON)
                </span>
                <span className="text-[10px] text-cyan-400 bg-cyan-950/60 border border-cyan-500/30 px-2 py-0.5 rounded">
                  is_synthetic: true
                </span>
              </div>
              <pre className="p-3.5 rounded bg-black/90 border border-border-subtle text-cyan-300 text-[11px] overflow-x-auto leading-relaxed max-h-72">
                {JSON.stringify(inspectEvent.raw_event, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
