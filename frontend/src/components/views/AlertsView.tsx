import { useState, useEffect, useCallback, useMemo } from 'react'
import type {
  AlertResponse,
  AlertDetailResponse,
  AlertStatus,
  EvaluateSummary,
} from '../../types/alert'
import type { EventResponse } from '../../types/event'
import {
  listAlerts,
  getAlert,
  patchAlertStatus,
  evaluateAlerts,
} from '../../api/client'
import { SeverityBadge, StatusBadge, ProvenanceBadge } from '../common/Badge'
import { Pagination } from '../common/Pagination'
import { EmptyState } from '../common/EmptyState'
import { Modal } from '../common/Modal'
import {
  ShieldAlertIcon,
  FilterIcon,
  PlayIcon,
  RefreshCwIcon,
  CheckCircleIcon,
  XIcon,
  FileTextIcon,
  ClockIcon,
  AlertTriangleIcon,
  XCircleIcon,
} from '../common/Icons'

interface AlertsViewProps {
  initialSelectedAlertId?: number | null
  onAlertUpdated?: () => void
  onNavigateToEvent?: (eventId: number) => void
}

const ALLOWED_STATUSES: AlertStatus[] = [
  'open',
  'investigating',
  'acknowledged',
  'resolved',
  'false_positive',
  'closed',
]

export function AlertsView({
  initialSelectedAlertId,
  onAlertUpdated,
  onNavigateToEvent,
}: AlertsViewProps) {
  // Alert list state
  const [alerts, setAlerts] = useState<AlertResponse[]>([])
  const [total, setTotal] = useState<number>(0)
  const [limit, setLimit] = useState<number>(20)
  const [offset, setOffset] = useState<number>(0)
  const [severityFilter, setSeverityFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [ruleFilter, setRuleFilter] = useState<string>('')

  // Loading & error state
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Selected alert & evidence detail
  const [selectedAlertId, setSelectedAlertId] = useState<number | null>(
    initialSelectedAlertId || null
  )
  const [alertDetail, setAlertDetail] = useState<AlertDetailResponse | null>(null)
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  // Selected evidence event for deep inspect
  const [inspectEvent, setInspectEvent] = useState<EventResponse | null>(null)

  // Status updating state
  const [updatingStatus, setUpdatingStatus] = useState<boolean>(false)
  const [statusUpdateSuccess, setStatusUpdateSuccess] = useState<string | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)

  // Run Correlation state
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false)
  const [evaluationModalOpen, setEvaluationModalOpen] = useState<boolean>(false)
  const [evalResult, setEvalResult] = useState<EvaluateSummary | null>(null)
  const [evalError, setEvalError] = useState<string | null>(null)

  // Fetch alerts list
  const fetchAlerts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listAlerts({
        limit,
        offset,
        severity: severityFilter || undefined,
        status: statusFilter || undefined,
        rule_id: ruleFilter || undefined,
      })
      setAlerts(data.items)
      setTotal(data.total)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [limit, offset, severityFilter, statusFilter, ruleFilter])

  useEffect(() => {
    fetchAlerts()
  }, [fetchAlerts])

  // Load alert detail with evidence
  const loadAlertDetail = useCallback(async (alertId: number) => {
    setLoadingDetail(true)
    setDetailError(null)
    try {
      const detail = await getAlert(alertId)
      setAlertDetail(detail)
    } catch (err: unknown) {
      setDetailError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  useEffect(() => {
    if (selectedAlertId !== null) {
      loadAlertDetail(selectedAlertId)
    } else {
      setAlertDetail(null)
    }
  }, [selectedAlertId, loadAlertDetail])

  // Update Alert status. The displayed status comes from the backend response
  // (not optimistic): on failure the status is left unchanged and an inline
  // error is shown.
  async function handleStatusChange(newStatus: AlertStatus) {
    if (!alertDetail || updatingStatus) return
    setUpdatingStatus(true)
    setStatusUpdateSuccess(null)
    setStatusError(null)
    try {
      const updated = await patchAlertStatus(alertDetail.id, newStatus)
      setAlertDetail((prev) => (prev ? { ...prev, status: updated.status } : null))
      // Reflect the backend-confirmed status in the table list.
      setAlerts((prev) =>
        prev.map((a) => (a.id === updated.id ? { ...a, status: updated.status } : a))
      )
      setStatusUpdateSuccess(`Investigation status updated to ${updated.status.toUpperCase()}`)
      if (onAlertUpdated) onAlertUpdated()
      setTimeout(() => setStatusUpdateSuccess(null), 4000)
    } catch (err: unknown) {
      setStatusError(
        `Failed to update status: ${err instanceof Error ? err.message : String(err)}`
      )
    } finally {
      setUpdatingStatus(false)
    }
  }

  // Chronological evidence timeline, sorted by actual event occurrence time
  // (id as a stable tiebreaker). Represents only this alert's evidence.
  const timeline = useMemo(
    () =>
      [...(alertDetail?.evidence ?? [])].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime() || a.id - b.id
      ),
    [alertDetail]
  )

  // Export the inspected alert and its resolved evidence to a JSON file.
  function handleExportJson() {
    if (!alertDetail) return
    const { evidence, ...alert } = alertDetail
    const payload = {
      exported_at: new Date().toISOString(),
      generator: 'SentinelX SIEM — Phase 7 alert investigation export',
      alert,
      evidence,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `sentinelx-alert-${alertDetail.id}-${alertDetail.fingerprint.slice(0, 8)}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  // Trigger Run Correlation
  async function handleRunCorrelation() {
    setIsEvaluating(true)
    setEvalError(null)
    setEvalResult(null)
    try {
      const summary = await evaluateAlerts()
      setEvalResult(summary)
      // Refresh alert lists and stats
      fetchAlerts()
      if (onAlertUpdated) onAlertUpdated()
    } catch (err: unknown) {
      setEvalError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsEvaluating(false)
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Top Action Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-panel-primary border border-border-subtle p-3.5 rounded-lg">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
            <FilterIcon className="w-3.5 h-3.5 text-cyan-400" />
            <span>Filters:</span>
          </div>

          {/* Severity */}
          <select
            value={severityFilter}
            onChange={(e) => {
              setSeverityFilter(e.target.value)
              setOffset(0)
            }}
            className="bg-panel-secondary border border-border-subtle text-slate-200 text-xs font-mono rounded px-2.5 py-1 focus:border-cyan-500 focus:outline-none"
          >
            <option value="">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {/* Status */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setOffset(0)
            }}
            className="bg-panel-secondary border border-border-subtle text-slate-200 text-xs font-mono rounded px-2.5 py-1 focus:border-cyan-500 focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="open">Open</option>
            <option value="investigating">Investigating</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
            <option value="false_positive">False Positive</option>
            <option value="closed">Closed</option>
          </select>

          {/* Rule */}
          <select
            value={ruleFilter}
            onChange={(e) => {
              setRuleFilter(e.target.value)
              setOffset(0)
            }}
            className="bg-panel-secondary border border-border-subtle text-slate-200 text-xs font-mono rounded px-2.5 py-1 focus:border-cyan-500 focus:outline-none"
          >
            <option value="">All Rules</option>
            <option value="AUTH-001">AUTH-001 (Brute Force)</option>
            <option value="AUTH-002">AUTH-002 (Password Spray)</option>
            <option value="AUTH-003">AUTH-003 (Fail followed by Success)</option>
            <option value="NET-001">NET-001 (Port Scan)</option>
            <option value="PRIV-001">PRIV-001 (Privilege Escalation)</option>
          </select>

          {(severityFilter || statusFilter || ruleFilter) && (
            <button
              onClick={() => {
                setSeverityFilter('')
                setStatusFilter('')
                setRuleFilter('')
                setOffset(0)
              }}
              className="text-xs font-mono text-slate-400 hover:text-slate-200 underline ml-1"
            >
              Reset
            </button>
          )}
        </div>

        {/* Action: Run Correlation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEvaluationModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-md bg-cyan-950/70 border border-cyan-500/50 text-cyan-300 hover:bg-cyan-900/60 hover:text-white transition-all text-xs font-mono font-semibold tracking-wide"
          >
            <PlayIcon className="w-3.5 h-3.5 text-cyan-400" />
            RUN CORRELATION
          </button>
        </div>
      </div>

      {/* Main Content Layout (full-width table + slide-over drawer) */}
      <div className="w-full">
        {/* Alerts Table */}
        <div className="w-full rounded-lg bg-panel-primary border border-border-subtle overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-panel-secondary border-b border-border-subtle text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                  <th className="py-2.5 px-3">ID</th>
                  <th className="py-2.5 px-3">Severity</th>
                  <th className="py-2.5 px-3">Rule</th>
                  <th className="py-2.5 px-3">Entities</th>
                  <th className="py-2.5 px-3">Events</th>
                  <th className="py-2.5 px-3">Detected At</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Provenance</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400 font-mono">
                      <div className="inline-flex items-center gap-2">
                        <RefreshCwIcon className="w-4 h-4 animate-spin text-cyan-400" />
                        Querying alerts repository...
                      </div>
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={9} className="py-8">
                      <EmptyState
                        title="Alert Query Error"
                        message={error}
                        isError
                        actionLabel="Retry"
                        onAction={fetchAlerts}
                      />
                    </td>
                  </tr>
                ) : alerts.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12">
                      <EmptyState
                        title="No Incidents Found"
                        message="No alerts match the active filter criteria or no correlation detections have triggered yet."
                        icon="search"
                        actionLabel="Clear Filters"
                        onAction={() => {
                          setSeverityFilter('')
                          setStatusFilter('')
                          setRuleFilter('')
                        }}
                      />
                    </td>
                  </tr>
                ) : (
                  alerts.map((alert) => {
                    const isSelected = selectedAlertId === alert.id
                    return (
                      <tr
                        key={alert.id}
                        onClick={() => setSelectedAlertId(alert.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-cyan-950/30 border-l-2 border-l-cyan-400'
                            : 'hover:bg-panel-secondary'
                        }`}
                      >
                        <td className="py-2.5 px-3 font-mono font-bold text-cyan-400">
                          #{alert.id}
                        </td>
                        <td className="py-2.5 px-3">
                          <SeverityBadge severity={alert.severity} />
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-slate-200 truncate max-w-45">
                            {alert.rule_name}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400">
                            {alert.rule_id}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-300">
                          {alert.source_ip && <div>IP: {alert.source_ip}</div>}
                          {alert.username && <div>User: {alert.username}</div>}
                          {!alert.source_ip && !alert.username && (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono tabular-nums text-slate-200">
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">
                            {alert.matched_count} evts
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-400 whitespace-nowrap">
                          {new Date(alert.detected_at).toUTCString().slice(5, 22)}
                        </td>
                        <td className="py-2.5 px-3">
                          <StatusBadge status={alert.status} />
                        </td>
                        <td className="py-2.5 px-3">
                          <ProvenanceBadge isSynthetic={alert.is_synthetic} />
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedAlertId(alert.id)
                            }}
                            className="px-2 py-1 rounded bg-panel-secondary border border-border-subtle text-cyan-400 hover:text-white hover:bg-cyan-950 text-xs font-mono font-medium"
                          >
                            Details →
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            total={total}
            limit={limit}
            offset={offset}
            onPageChange={setOffset}
            onLimitChange={setLimit}
            disabled={loading}
          />
        </div>

        {/* Alert Detail Slide-over Drawer (When Alert Selected) */}
        {selectedAlertId !== null && (
          <>
            {/* Dimmed backdrop — click to dismiss */}
            <div
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              onClick={() => setSelectedAlertId(null)}
              aria-hidden="true"
            />
            {/* Right-anchored slide-over drawer */}
            <div className="fixed right-0 top-0 z-50 h-screen w-full max-w-md overflow-y-auto bg-panel-primary border-l border-cyan-500/40 p-4 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <ShieldAlertIcon className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold font-mono text-slate-100">
                  Incident #{selectedAlertId}
                </h3>
              </div>
              <button
                onClick={() => setSelectedAlertId(null)}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
                aria-label="Close detail panel"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            {loadingDetail ? (
              <div className="py-12 text-center text-xs font-mono text-slate-400">
                <RefreshCwIcon className="w-4 h-4 animate-spin text-cyan-400 mx-auto mb-2" />
                Resolving incident evidence...
              </div>
            ) : detailError ? (
              <div className="p-3 rounded bg-rose-950/30 border border-rose-600/40 text-xs text-rose-300 font-mono">
                {detailError}
              </div>
            ) : alertDetail ? (
              <div className="space-y-4 text-xs font-mono">
                {/* Status Update Banner */}
                {statusUpdateSuccess && (
                  <div className="p-2 rounded bg-emerald-950/40 border border-emerald-600/40 text-emerald-300 flex items-center gap-1.5 text-[11px]">
                    <CheckCircleIcon className="w-3.5 h-3.5 shrink-0" />
                    <span>{statusUpdateSuccess}</span>
                  </div>
                )}

                {/* Status Switcher */}
                <div className="p-3 rounded bg-panel-secondary border border-border-subtle space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-[11px] uppercase">Investigation Status:</span>
                    <StatusBadge status={alertDetail.status} />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <select
                      value={alertDetail.status}
                      disabled={updatingStatus}
                      onChange={(e) => handleStatusChange(e.target.value as AlertStatus)}
                      className="w-full bg-panel-primary border border-slate-700 text-slate-200 rounded px-2.5 py-1 text-xs focus:border-cyan-500 focus:outline-none"
                    >
                      {ALLOWED_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          Set status: {st.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                  {updatingStatus && (
                    <div className="text-[11px] text-cyan-300 flex items-center gap-1.5">
                      <RefreshCwIcon className="w-3 h-3 animate-spin" /> Updating status…
                    </div>
                  )}
                  {statusError && (
                    <div className="text-[11px] text-rose-300 flex items-start gap-1.5">
                      <XCircleIcon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{statusError}</span>
                    </div>
                  )}
                </div>

                {/* Header Info */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <SeverityBadge severity={alertDetail.severity} />
                    <ProvenanceBadge isSynthetic={alertDetail.is_synthetic} />
                  </div>
                  <div className="font-bold text-slate-100 text-sm">
                    {alertDetail.rule_name}
                  </div>
                  <div className="text-[11px] text-cyan-400">
                    Rule ID: {alertDetail.rule_id}
                  </div>
                  <p className="text-slate-400 font-sans text-xs pt-1 leading-relaxed">
                    {alertDetail.description}
                  </p>
                </div>

                {/* Correlation Explanation */}
                <div className="p-3 rounded bg-panel-secondary border border-border-subtle space-y-2">
                  <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                    Detection Explanation:
                  </span>
                  {alertDetail.explanation && Object.keys(alertDetail.explanation).length > 0 ? (
                    <div className="space-y-1 text-[11px] text-slate-300">
                      {Boolean(alertDetail.explanation.reason) && (
                        <div className="text-cyan-300 font-sans font-medium">
                          {String(alertDetail.explanation.reason)}
                        </div>
                      )}
                      {alertDetail.explanation.window_seconds !== undefined && (
                        <div>Window: {String(alertDetail.explanation.window_seconds)}s</div>
                      )}
                      {alertDetail.explanation.threshold !== undefined && (
                        <div>Threshold: {String(alertDetail.explanation.threshold)}</div>
                      )}
                      {alertDetail.explanation.distinct_accounts !== undefined && (
                        <div>Distinct Accounts: {String(alertDetail.explanation.distinct_accounts)}</div>
                      )}
                      {alertDetail.explanation.distinct_ports !== undefined && (
                        <div>Distinct Ports: {String(alertDetail.explanation.distinct_ports)}</div>
                      )}
                    </div>
                  ) : (
                    <div className="text-slate-400">No explanation metadata attached</div>
                  )}
                </div>

                {/* Entities */}
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 rounded bg-panel-secondary border border-border-subtle">
                    <div className="text-slate-400 text-[10px] uppercase">Source IP</div>
                    <div className="text-slate-200 mt-0.5 truncate">
                      {alertDetail.source_ip || 'None'}
                    </div>
                  </div>
                  <div className="p-2 rounded bg-panel-secondary border border-border-subtle">
                    <div className="text-slate-400 text-[10px] uppercase">Account</div>
                    <div className="text-slate-200 mt-0.5 truncate">
                      {alertDetail.username || 'None'}
                    </div>
                  </div>
                  <div className="p-2 rounded bg-panel-secondary border border-border-subtle">
                    <div className="text-slate-400 text-[10px] uppercase">First Seen</div>
                    <div className="text-slate-300 mt-0.5">
                      {new Date(alertDetail.first_observed).toUTCString().slice(17, 25)}
                    </div>
                  </div>
                  <div className="p-2 rounded bg-panel-secondary border border-border-subtle">
                    <div className="text-slate-400 text-[10px] uppercase">Last Seen</div>
                    <div className="text-slate-300 mt-0.5">
                      {new Date(alertDetail.last_observed).toUTCString().slice(17, 25)}
                    </div>
                  </div>
                </div>

                {/* Investigation Export */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                    Investigation Export
                  </span>
                  <button
                    onClick={handleExportJson}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-panel-secondary border border-border-subtle text-cyan-400 hover:text-white hover:border-cyan-500/40 text-[11px] font-mono"
                  >
                    <FileTextIcon className="w-3.5 h-3.5" /> Export Alert + Evidence (JSON)
                  </button>
                </div>

                {/* Evidence Timeline (chronological by actual event time) */}
                <div className="space-y-2 pt-2 border-t border-border-subtle">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <ClockIcon className="w-3.5 h-3.5 text-cyan-400" />
                      Evidence Timeline ({timeline.length})
                    </span>
                    <span className="text-[10px] text-slate-400">Chronological · event time (UTC)</span>
                  </div>

                  {timeline.length > 0 ? (
                    <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                      {timeline.map((evt, idx) => (
                        <div
                          key={evt.id}
                          className="p-2 rounded bg-panel-secondary border border-border-subtle hover:border-cyan-500/30 transition-colors space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-[10px] font-mono text-slate-500 shrink-0">
                                {String(idx + 1).padStart(2, '0')}
                              </span>
                              <span className="font-semibold text-cyan-400 shrink-0">#{evt.id}</span>
                              <SeverityBadge severity={evt.severity} />
                            </div>
                            <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">
                              {new Date(evt.timestamp).toISOString().replace('T', ' ').slice(0, 19)}Z
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-200 font-medium">{evt.event_type}</div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-400">
                            {evt.source_ip && <span>src {evt.source_ip}</span>}
                            {(evt.destination_ip || evt.destination_port) && (
                              <span>
                                dst {evt.destination_ip || ''}
                                {evt.destination_port ? `:${evt.destination_port}` : ''}
                              </span>
                            )}
                            {evt.username && <span>user {evt.username}</span>}
                            {evt.host && <span>host {evt.host}</span>}
                            <span>feed {evt.source}</span>
                          </div>
                          <div className="flex items-center justify-between pt-1">
                            <ProvenanceBadge isSynthetic={evt.is_synthetic} />
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setInspectEvent(evt)}
                                className="text-[10px] font-mono text-cyan-400 hover:text-cyan-300 underline"
                              >
                                Raw JSON
                              </button>
                              {onNavigateToEvent && (
                                <button
                                  onClick={() => onNavigateToEvent(evt.id)}
                                  className="text-[10px] font-mono text-cyan-400 hover:text-cyan-300 underline"
                                >
                                  Open in Events →
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-xs text-slate-400 bg-panel-secondary border border-border-subtle rounded flex flex-col items-center gap-1.5">
                      <AlertTriangleIcon className="w-4 h-4 text-amber-400" />
                      No evidence events are associated with this alert.
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
          </>
        )}
      </div>

      {/* Modal: Run Correlation Confirmation & Execution */}
      <Modal
        isOpen={evaluationModalOpen}
        onClose={() => setEvaluationModalOpen(false)}
        title="Execute Deterministic Correlation Engine"
        subtitle="Evaluates stored events against enabled rules (AUTH-001 through PRIV-001)"
      >
        <div className="space-y-4 text-xs font-mono">
          {!evalResult && !evalError && (
            <div className="space-y-3">
              <p className="text-slate-300 font-sans leading-relaxed">
                Triggering the correlation engine scans all persisted security events against
                the 5 deterministic detection rules. Detections generate new alerts or update
                existing ones via deterministic fingerprinting.
              </p>
              <div className="p-3 rounded bg-panel-secondary border border-border-subtle space-y-1.5">
                <div className="text-cyan-400 font-semibold uppercase text-[11px]">
                  Active Detection Rules Evaluated:
                </div>
                <div className="text-slate-300 space-y-0.5">
                  <div>• AUTH-001: Brute Force Authentication (10 failures / 60s)</div>
                  <div>• AUTH-002: Password Spraying (5 distinct accounts / 300s)</div>
                  <div>• AUTH-003: Failed Logins Followed by Success (5 failures / 300s)</div>
                  <div>• NET-001: Potential Port Scan (15 distinct ports / 60s)</div>
                  <div>• PRIV-001: Suspicious Privilege Escalation (sensitive action / 300s)</div>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  onClick={() => setEvaluationModalOpen(false)}
                  className="px-3 py-1.5 rounded bg-panel-secondary border border-border-subtle text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRunCorrelation}
                  disabled={isEvaluating}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded bg-cyan-500 text-slate-950 font-semibold hover:bg-cyan-400 transition-colors"
                >
                  {isEvaluating ? (
                    <>
                      <RefreshCwIcon className="w-3.5 h-3.5 animate-spin" />
                      Evaluating Telemetry...
                    </>
                  ) : (
                    <>
                      <PlayIcon className="w-3.5 h-3.5" />
                      Run Evaluation Now
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {isEvaluating && (
            <div className="py-8 text-center space-y-2">
              <RefreshCwIcon className="w-6 h-6 animate-spin text-cyan-400 mx-auto" />
              <div className="text-slate-200">Evaluating telemetry across active rules...</div>
            </div>
          )}

          {evalError && (
            <div className="space-y-3">
              <div className="p-3 rounded bg-rose-950/40 border border-rose-600/40 text-rose-300">
                Evaluation Failed: {evalError}
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => setEvaluationModalOpen(false)}
                  className="px-3 py-1 rounded bg-panel-secondary text-slate-200"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {evalResult && (
            <div className="space-y-4">
              <div className="p-3 rounded bg-emerald-950/40 border border-emerald-600/40 text-emerald-300 flex items-center gap-2">
                <CheckCircleIcon className="w-4 h-4 shrink-0" />
                <span>Correlation engine evaluation completed successfully.</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-2.5 rounded bg-panel-secondary border border-border-subtle">
                  <div className="text-slate-400 text-[10px] uppercase">Events Evaluated</div>
                  <div className="text-lg font-bold text-slate-100">{evalResult.events_evaluated}</div>
                </div>
                <div className="p-2.5 rounded bg-panel-secondary border border-border-subtle">
                  <div className="text-slate-400 text-[10px] uppercase">Detections Found</div>
                  <div className="text-lg font-bold text-cyan-400">{evalResult.detections}</div>
                </div>
                <div className="p-2.5 rounded bg-panel-secondary border border-border-subtle">
                  <div className="text-slate-400 text-[10px] uppercase">Alerts Created</div>
                  <div className="text-lg font-bold text-emerald-400">{evalResult.alerts_created}</div>
                </div>
                <div className="p-2.5 rounded bg-panel-secondary border border-border-subtle">
                  <div className="text-slate-400 text-[10px] uppercase">Alerts Unchanged</div>
                  <div className="text-lg font-bold text-slate-300">{evalResult.alerts_unchanged}</div>
                </div>
              </div>

              {evalResult.alerts && evalResult.alerts.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-slate-300 font-semibold text-xs">Evaluated Incident References:</div>
                  <div className="max-h-40 overflow-y-auto divide-y divide-border-subtle border border-border-subtle rounded bg-panel-secondary">
                    {evalResult.alerts.map((ref) => (
                      <div key={ref.id} className="p-2 flex items-center justify-between text-[11px]">
                        <span className="text-cyan-400 font-semibold">#{ref.id} ({ref.rule_id})</span>
                        <span className="text-slate-400">State: {ref.state}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setEvaluationModalOpen(false)}
                  className="px-4 py-1.5 rounded bg-cyan-500 text-slate-950 font-semibold hover:bg-cyan-400"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Modal: Deep Inspect Event Evidence */}
      <Modal
        isOpen={inspectEvent !== null}
        onClose={() => setInspectEvent(null)}
        title={inspectEvent ? `Evidence Event #${inspectEvent.id} (${inspectEvent.event_uid})` : 'Event'}
        subtitle={inspectEvent?.event_type}
        maxWidth="max-w-3xl"
      >
        {inspectEvent && (
          <div className="space-y-4 text-xs font-mono">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={inspectEvent.severity} />
              <ProvenanceBadge isSynthetic={inspectEvent.is_synthetic} />
              <span className="text-[11px] text-slate-400">feed: {inspectEvent.source}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-2 rounded bg-panel-secondary border border-border-subtle">
                <div className="text-slate-400 text-[10px] uppercase">Timestamp (UTC)</div>
                <div className="text-slate-200 mt-0.5">{new Date(inspectEvent.timestamp).toUTCString()}</div>
              </div>
              <div className="p-2 rounded bg-panel-secondary border border-border-subtle">
                <div className="text-slate-400 text-[10px] uppercase">Source IP</div>
                <div className="text-slate-200 mt-0.5">{inspectEvent.source_ip || 'None'}</div>
              </div>
              <div className="p-2 rounded bg-panel-secondary border border-border-subtle">
                <div className="text-slate-400 text-[10px] uppercase">Destination</div>
                <div className="text-slate-200 mt-0.5">
                  {inspectEvent.destination_ip || 'None'}
                  {inspectEvent.destination_port ? `:${inspectEvent.destination_port}` : ''}
                </div>
              </div>
              <div className="p-2 rounded bg-panel-secondary border border-border-subtle">
                <div className="text-slate-400 text-[10px] uppercase">Account</div>
                <div className="text-slate-200 mt-0.5">{inspectEvent.username || 'None'}</div>
              </div>
              <div className="p-2 rounded bg-panel-secondary border border-border-subtle">
                <div className="text-slate-400 text-[10px] uppercase">Host</div>
                <div className="text-slate-200 mt-0.5">{inspectEvent.host || 'None'}</div>
              </div>
            </div>

            <div>
              <div className="text-slate-300 font-semibold mb-1">Raw Stored Payload (JSON):</div>
              <pre className="p-3 rounded bg-black border border-border-subtle text-cyan-300 text-[11px] overflow-x-auto leading-relaxed max-h-60">
                {JSON.stringify(inspectEvent.raw_event, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
