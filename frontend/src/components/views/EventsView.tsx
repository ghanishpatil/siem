import React, { useState, useEffect, useCallback } from 'react'
import type { EventResponse } from '../../types/event'
import type { AlertResponse } from '../../types/alert'
import { listEvents, getEvent, listAlerts } from '../../api/client'
import { SeverityBadge, StatusBadge, ProvenanceBadge } from '../common/Badge'
import { Pagination } from '../common/Pagination'
import { EmptyState } from '../common/EmptyState'
import { Modal } from '../common/Modal'
import {
  FilterIcon,
  SearchIcon,
  RefreshCwIcon,
  FileTextIcon,
  ShieldAlertIcon,
} from '../common/Icons'

interface EventsViewProps {
  initialSelectedEventId?: number | null
  onNavigateToAlert?: (alertId: number) => void
}

const COMMON_EVENT_TYPES = [
  'authentication_failure',
  'authentication_success',
  'network_connection',
  'privilege_escalation',
  'file_access',
  'process_creation',
]

export function EventsView({ initialSelectedEventId, onNavigateToAlert }: EventsViewProps) {
  const [events, setEvents] = useState<EventResponse[]>([])
  const [total, setTotal] = useState<number>(0)
  const [limit, setLimit] = useState<number>(20)
  const [offset, setOffset] = useState<number>(0)

  // Filters
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('')
  const [severityFilter, setSeverityFilter] = useState<string>('')
  const [sourceIpFilter, setSourceIpFilter] = useState<string>('')
  const [tempSourceIp, setTempSourceIp] = useState<string>('')

  // Loading & error
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Inspection modal
  const [selectedEventId, setSelectedEventId] = useState<number | null>(
    initialSelectedEventId || null
  )
  const [eventDetail, setEventDetail] = useState<EventResponse | null>(null)
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false)
  const [copiedJson, setCopiedJson] = useState<boolean>(false)

  // Reverse lookup: which alerts reference this event (bounded scan over the
  // existing alerts API — no new backend endpoint).
  const [refAlerts, setRefAlerts] = useState<AlertResponse[]>([])
  const [refScanned, setRefScanned] = useState<number>(0)
  const [refTotal, setRefTotal] = useState<number>(0)
  const [loadingRefs, setLoadingRefs] = useState<boolean>(false)

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listEvents({
        limit,
        offset,
        event_type: eventTypeFilter || undefined,
        severity: severityFilter || undefined,
        source_ip: sourceIpFilter || undefined,
      })
      setEvents(data.items)
      setTotal(data.total)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [limit, offset, eventTypeFilter, severityFilter, sourceIpFilter])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  // Load single event for modal inspection
  useEffect(() => {
    if (!selectedEventId) {
      setEventDetail(null)
      return
    }

    let active = true
    setLoadingDetail(true)
    getEvent(selectedEventId)
      .then((evt) => {
        if (!active) return
        setEventDetail(evt)
      })
      .catch((err) => {
        if (!active) return
        console.error('Failed to get event detail:', err)
      })
      .finally(() => {
        if (active) setLoadingDetail(false)
      })

    return () => {
      active = false
    }
  }, [selectedEventId])

  // Find alerts referencing the inspected event via evidence_event_ids.
  useEffect(() => {
    if (!eventDetail) {
      setRefAlerts([])
      setRefScanned(0)
      setRefTotal(0)
      return
    }
    let active = true
    setLoadingRefs(true)
    listAlerts({ limit: 500 })
      .then((data) => {
        if (!active) return
        setRefTotal(data.total)
        setRefScanned(data.items.length)
        setRefAlerts(
          data.items.filter((a) => (a.evidence_event_ids || []).includes(eventDetail.id))
        )
      })
      .catch(() => {
        if (active) setRefAlerts([])
      })
      .finally(() => {
        if (active) setLoadingRefs(false)
      })
    return () => {
      active = false
    }
  }, [eventDetail])

  function handleSearchIpSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSourceIpFilter(tempSourceIp.trim())
    setOffset(0)
  }

  function handleCopyJson() {
    if (!eventDetail?.raw_event) return
    navigator.clipboard.writeText(JSON.stringify(eventDetail.raw_event, null, 2))
    setCopiedJson(true)
    setTimeout(() => setCopiedJson(false), 2000)
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Search & Filter Toolbar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-panel-primary border border-border-subtle p-3.5 rounded-lg">
        {/* Filter controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
            <FilterIcon className="w-3.5 h-3.5 text-cyan-400" />
            <span>Filters:</span>
          </div>

          {/* Event Type Filter */}
          <select
            value={eventTypeFilter}
            onChange={(e) => {
              setEventTypeFilter(e.target.value)
              setOffset(0)
            }}
            className="bg-panel-secondary border border-border-subtle text-slate-200 text-xs font-mono rounded px-2.5 py-1 focus:border-cyan-500 focus:outline-none"
          >
            <option value="">All Event Types</option>
            {COMMON_EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          {/* Severity Filter */}
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
            <option value="info">Info</option>
          </select>

          {/* Reset button */}
          {(eventTypeFilter || severityFilter || sourceIpFilter) && (
            <button
              onClick={() => {
                setEventTypeFilter('')
                setSeverityFilter('')
                setSourceIpFilter('')
                setTempSourceIp('')
                setOffset(0)
              }}
              className="text-xs font-mono text-slate-400 hover:text-slate-200 underline ml-1"
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Source IP Search */}
        <form onSubmit={handleSearchIpSubmit} className="flex items-center gap-2">
          <div className="relative">
            <input
              type="text"
              placeholder="Filter by Source IP..."
              value={tempSourceIp}
              onChange={(e) => setTempSourceIp(e.target.value)}
              className="bg-panel-secondary border border-border-subtle text-slate-200 text-xs font-mono rounded pl-8 pr-3 py-1 w-48 sm:w-56 focus:border-cyan-500 focus:outline-none placeholder:text-slate-500"
            />
            <SearchIcon className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
          </div>
          <button
            type="submit"
            className="px-2.5 py-1 rounded bg-panel-secondary border border-border-subtle text-slate-300 hover:text-white hover:bg-panel-elevated text-xs font-mono"
          >
            Search
          </button>
        </form>
      </div>

      {/* Events Table Container */}
      <div className="rounded-lg bg-panel-primary border border-border-subtle overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-panel-secondary border-b border-border-subtle text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                <th className="py-2.5 px-3">Event ID</th>
                <th className="py-2.5 px-3">Timestamp (UTC)</th>
                <th className="py-2.5 px-3">Event Type</th>
                <th className="py-2.5 px-3">Severity</th>
                <th className="py-2.5 px-3">Source IP</th>
                <th className="py-2.5 px-3">Destination</th>
                <th className="py-2.5 px-3">Account / Host</th>
                <th className="py-2.5 px-3">Source Feed</th>
                <th className="py-2.5 px-3">Provenance</th>
                <th className="py-2.5 px-3 text-right">Payload</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400 font-mono">
                    <div className="inline-flex items-center gap-2">
                      <RefreshCwIcon className="w-4 h-4 animate-spin text-cyan-400" />
                      Loading telemetry log stream...
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={10} className="py-8">
                    <EmptyState
                      title="Event Stream Error"
                      message={error}
                      isError
                      actionLabel="Retry"
                      onAction={fetchEvents}
                    />
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12">
                    <EmptyState
                      title="No Telemetry Events"
                      message="No events match the specified filter parameters or the ingestion database is empty."
                      icon="search"
                      actionLabel="Clear Filters"
                      onAction={() => {
                        setEventTypeFilter('')
                        setSeverityFilter('')
                        setSourceIpFilter('')
                        setTempSourceIp('')
                      }}
                    />
                  </td>
                </tr>
              ) : (
                events.map((evt) => (
                  <tr
                    key={evt.id}
                    onClick={() => setSelectedEventId(evt.id)}
                    className="hover:bg-panel-secondary cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-200">
                      #{evt.id}
                      <span className="text-[10px] text-slate-500 block">
                        {evt.event_uid}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-300 whitespace-nowrap">
                      {new Date(evt.timestamp).toUTCString().slice(5, 22)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-cyan-300 font-medium">
                      {evt.event_type}
                    </td>
                    <td className="py-2.5 px-3">
                      <SeverityBadge severity={evt.severity} />
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-300">
                      {evt.source_ip || <span className="text-slate-600">—</span>}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-400">
                      {evt.destination_ip || evt.destination_port ? (
                        <span>
                          {evt.destination_ip || ''}
                          {evt.destination_port ? `:${evt.destination_port}` : ''}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-300">
                      {evt.username && <div className="text-slate-200">{evt.username}</div>}
                      {evt.host && <div className="text-[10px] text-slate-400">{evt.host}</div>}
                      {!evt.username && !evt.host && <span className="text-slate-600">—</span>}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-400 text-[11px]">
                      {evt.source}
                    </td>
                    <td className="py-2.5 px-3">
                      <ProvenanceBadge isSynthetic={evt.is_synthetic} />
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedEventId(evt.id)
                        }}
                        className="px-2 py-1 rounded bg-panel-secondary border border-border-subtle text-slate-300 hover:text-cyan-400 hover:border-cyan-500/40 font-mono text-[11px]"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))
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

      {/* Event Details Modal */}
      <Modal
        isOpen={selectedEventId !== null}
        onClose={() => setSelectedEventId(null)}
        title={eventDetail ? `Telemetry Event #${eventDetail.id}` : 'Event Inspection'}
        subtitle={eventDetail ? `${eventDetail.event_type} (${eventDetail.event_uid})` : undefined}
        maxWidth="max-w-3xl"
      >
        {loadingDetail ? (
          <div className="py-12 text-center font-mono text-xs text-slate-400">
            <RefreshCwIcon className="w-4 h-4 animate-spin text-cyan-400 mx-auto mb-2" />
            Loading event details from database...
          </div>
        ) : eventDetail ? (
          <div className="space-y-4 text-xs font-mono">
            {/* Top Info Banner */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded bg-panel-secondary border border-border-subtle">
              <div className="flex items-center gap-2">
                <SeverityBadge severity={eventDetail.severity} />
                <ProvenanceBadge isSynthetic={eventDetail.is_synthetic} />
              </div>
              <div className="text-[11px] text-slate-400">
                Source System: <span className="text-slate-200">{eventDetail.source}</span>
              </div>
            </div>

            {/* Normalized Attributes Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-2.5 rounded bg-panel-secondary border border-border-subtle">
                <div className="text-slate-500 text-[10px] uppercase">Event Timestamp</div>
                <div className="text-slate-200 mt-1 font-semibold">
                  {new Date(eventDetail.timestamp).toUTCString()}
                </div>
              </div>
              <div className="p-2.5 rounded bg-panel-secondary border border-border-subtle">
                <div className="text-slate-500 text-[10px] uppercase">Ingested At</div>
                <div className="text-slate-200 mt-1 font-semibold">
                  {new Date(eventDetail.created_at).toUTCString()}
                </div>
              </div>
              <div className="p-2.5 rounded bg-panel-secondary border border-border-subtle">
                <div className="text-slate-500 text-[10px] uppercase">Source IP</div>
                <div className="text-slate-200 mt-1 font-semibold">
                  {eventDetail.source_ip || 'None'}
                </div>
              </div>
              <div className="p-2.5 rounded bg-panel-secondary border border-border-subtle">
                <div className="text-slate-500 text-[10px] uppercase">Destination</div>
                <div className="text-slate-200 mt-1 font-semibold">
                  {eventDetail.destination_ip || 'None'}
                  {eventDetail.destination_port ? `:${eventDetail.destination_port}` : ''}
                </div>
              </div>
              <div className="p-2.5 rounded bg-panel-secondary border border-border-subtle">
                <div className="text-slate-500 text-[10px] uppercase">User Account</div>
                <div className="text-slate-200 mt-1 font-semibold">
                  {eventDetail.username || 'None'}
                </div>
              </div>
              <div className="p-2.5 rounded bg-panel-secondary border border-border-subtle">
                <div className="text-slate-500 text-[10px] uppercase">Host Node</div>
                <div className="text-slate-200 mt-1 font-semibold">
                  {eventDetail.host || 'None'}
                </div>
              </div>
              <div className="p-2.5 rounded bg-panel-secondary border border-border-subtle">
                <div className="text-slate-500 text-[10px] uppercase">Event UID</div>
                <div className="text-slate-200 mt-1 font-semibold">
                  {eventDetail.event_uid}
                </div>
              </div>
              <div className="p-2.5 rounded bg-panel-secondary border border-border-subtle">
                <div className="text-slate-500 text-[10px] uppercase">Primary Key ID</div>
                <div className="text-slate-200 mt-1 font-semibold">
                  #{eventDetail.id}
                </div>
              </div>
            </div>

            {/* Alerts referencing this event (reverse lookup) */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-semibold text-xs flex items-center gap-1.5">
                  <ShieldAlertIcon className="w-3.5 h-3.5 text-cyan-400" />
                  Referenced by Alerts
                </span>
                {refTotal > refScanned && (
                  <span className="text-[10px] text-slate-500">
                    scanned {refScanned} of {refTotal} most recent
                  </span>
                )}
              </div>
              {loadingRefs ? (
                <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  <RefreshCwIcon className="w-3 h-3 animate-spin" /> Searching alerts…
                </div>
              ) : refAlerts.length > 0 ? (
                <div className="space-y-1">
                  {refAlerts.map((a) => (
                    <div
                      key={a.id}
                      className="p-2 rounded bg-panel-secondary border border-border-subtle flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-cyan-400 shrink-0">#{a.id}</span>
                        <SeverityBadge severity={a.severity} />
                        <span className="text-[11px] text-slate-300 truncate">{a.rule_id}</span>
                        <StatusBadge status={a.status} />
                      </div>
                      {onNavigateToAlert && (
                        <button
                          onClick={() => onNavigateToAlert(a.id)}
                          className="text-[10px] font-mono text-cyan-400 hover:text-cyan-300 underline shrink-0"
                        >
                          Open alert →
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-slate-500">
                  No alerts reference this event{refTotal > refScanned ? ' among the scanned set' : ''}.
                </div>
              )}
            </div>

            {/* Original Raw Event JSON */}
            <div className="space-y-1.5 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-semibold text-xs flex items-center gap-1.5">
                  <FileTextIcon className="w-3.5 h-3.5 text-cyan-400" />
                  Original Raw Event Payload (JSON)
                </span>
                <button
                  onClick={handleCopyJson}
                  className="px-2 py-0.5 rounded bg-panel-secondary border border-border-subtle text-[11px] text-cyan-400 hover:text-white"
                >
                  {copiedJson ? 'Copied ✓' : 'Copy JSON'}
                </button>
              </div>
              <pre className="p-3.5 rounded bg-black/90 border border-border-subtle text-cyan-300 text-[11px] overflow-x-auto leading-relaxed max-h-72">
                {JSON.stringify(eventDetail.raw_event, null, 2)}
              </pre>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
