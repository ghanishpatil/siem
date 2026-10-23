import { useMemo } from 'react'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { AlertStatsResponse, AlertResponse } from '../../types/alert'
import type { StatsResponse, EventResponse } from '../../types/event'
import { StatCard } from '../common/StatCard'
import { SeverityBadge, StatusBadge, ProvenanceBadge } from '../common/Badge'
import {
  ShieldAlertIcon,
  ActivityIcon,
  TerminalIcon,
  CrosshairIcon,
  ClockIcon,
  ChevronRightIcon,
} from '../common/Icons'
import { EmptyState } from '../common/EmptyState'

interface OverviewViewProps {
  alertStats: AlertStatsResponse | null
  eventStats: StatsResponse | null
  recentEvents: EventResponse[]
  recentAlerts: AlertResponse[]
  loading: boolean
  error: string | null
  onRetry: () => void
  onSelectAlert: (alertId: number) => void
  onSelectEvent: (eventId: number) => void
  onNavigateSection: (section: 'alerts' | 'events' | 'rules' | 'ingestion') => void
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#FF4757',
  high: '#FF8A3D',
  medium: '#F5C451',
  low: '#4DA3FF',
  info: '#00E5FF',
}

export function OverviewView({
  alertStats,
  eventStats,
  recentEvents,
  recentAlerts,
  loading,
  error,
  onRetry,
  onSelectAlert,
  onSelectEvent,
  onNavigateSection,
}: OverviewViewProps) {
  // Aggregate real event timestamps into chronological time buckets for time-series chart
  const timelineData = useMemo(() => {
    if (!recentEvents || recentEvents.length === 0) return []
    // Group events by time bucket (HH:MM or YYYY-MM-DD HH:00)
    const buckets: Record<string, number> = {}
    
    // Sort chronological ascending
    const sorted = [...recentEvents].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )

    sorted.forEach((e) => {
      const d = new Date(e.timestamp)
      // Format as HH:00
      const hourStr = `${String(d.getUTCHours()).padStart(2, '0')}:00`
      buckets[hourStr] = (buckets[hourStr] || 0) + 1
    })

    return Object.entries(buckets).map(([time, count]) => ({
      time,
      events: count,
    }))
  }, [recentEvents])

  // Severity chart data from actual alertStats
  const severityData = useMemo(() => {
    if (!alertStats || !alertStats.by_severity) return []
    return Object.entries(alertStats.by_severity).map(([sev, count]) => ({
      name: sev.toUpperCase(),
      severityKey: sev.toLowerCase(),
      value: count,
      color: SEVERITY_COLORS[sev.toLowerCase()] || '#94A3B8',
    }))
  }, [alertStats])

  // Rule distribution data from actual alertStats
  const ruleData = useMemo(() => {
    if (!alertStats || !alertStats.by_rule) return []
    return Object.entries(alertStats.by_rule).map(([rule, count]) => ({
      rule,
      alerts: count,
    }))
  }, [alertStats])

  if (error && !alertStats && !eventStats) {
    return (
      <div className="p-6">
        <EmptyState
          title="Telemetry Feed Error"
          message={`Failed to query security metrics: ${error}`}
          isError
          actionLabel="Retry Connection"
          onAction={onRetry}
        />
      </div>
    )
  }

  const criticalCount = alertStats?.by_severity?.['critical'] || 0
  const highCount = alertStats?.by_severity?.['high'] || 0
  const openCount = alertStats?.by_status?.['open'] || 0
  const totalEvents = eventStats?.total_events || 0
  const totalAlerts = alertStats?.total_alerts || 0
  const recentEventCount = eventStats?.recent_event_count || 0

  // Phase 7 analytics derivations (from live API stats only).
  const statusEntries = Object.entries(alertStats?.by_status ?? {}).sort(
    (a, b) => b[1] - a[1]
  )
  const syntheticCount = eventStats?.synthetic_count ?? 0
  const realCount = eventStats?.real_count ?? 0
  const provenanceTotal = syntheticCount + realCount
  const provenanceAvailable =
    eventStats != null && eventStats.synthetic_count !== undefined

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3.5">
        <StatCard
          label="Total Telemetry"
          value={totalEvents}
          sublabel="Normalized events stored"
          icon={<TerminalIcon className="w-4 h-4" />}
          accentColor="slate"
          loading={loading && !eventStats}
        />
        <StatCard
          label="Recent Activity"
          value={recentEventCount}
          sublabel="Events in last 24h"
          icon={<ActivityIcon className="w-4 h-4" />}
          accentColor="cyan"
          loading={loading && !eventStats}
        />
        <StatCard
          label="Total Alerts"
          value={totalAlerts}
          sublabel="Correlated incidents"
          icon={<ShieldAlertIcon className="w-4 h-4" />}
          accentColor="slate"
          loading={loading && !alertStats}
        />
        <StatCard
          label="Critical Severity"
          value={criticalCount}
          sublabel="High priority triage"
          icon={<ShieldAlertIcon className="w-4 h-4 text-rose-400" />}
          accentColor="rose"
          loading={loading && !alertStats}
        />
        <StatCard
          label="High Severity"
          value={highCount}
          sublabel="Substantial threat signal"
          icon={<CrosshairIcon className="w-4 h-4 text-orange-400" />}
          accentColor="orange"
          loading={loading && !alertStats}
        />
        <StatCard
          label="Open Lifecycle"
          value={openCount}
          sublabel="Pending investigation"
          icon={<ClockIcon className="w-4 h-4 text-amber-400" />}
          accentColor="amber"
          loading={loading && !alertStats}
        />
      </div>

      {/* Investigation Analytics (Phase 7) — derived from live API stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Alerts by Status */}
        <div className="rounded-lg bg-panel-primary border border-border-subtle p-4">
          <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
            <h3 className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase flex items-center gap-2">
              <ShieldAlertIcon className="w-3.5 h-3.5 text-cyan-400" />
              Alerts by Investigation Status
            </h3>
            <button
              onClick={() => onNavigateSection('alerts')}
              className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
            >
              View Alerts <ChevronRightIcon className="w-3 h-3" />
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {statusEntries.length > 0 ? (
              statusEntries.map(([status, count]) => (
                <div key={status} className="flex items-center gap-3">
                  <div className="w-28 shrink-0">
                    <StatusBadge status={status} />
                  </div>
                  <div className="flex-1 h-2 rounded bg-panel-secondary overflow-hidden">
                    <div
                      className="h-full bg-cyan-500/60"
                      style={{ width: `${totalAlerts > 0 ? (count / totalAlerts) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="w-8 text-right tabular-nums text-slate-200 font-mono text-xs">
                    {count}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-[11px] font-mono text-slate-500 py-4 text-center">
                No alerts recorded yet.
              </div>
            )}
          </div>
        </div>

        {/* Events by Provenance (synthetic vs real) */}
        <div className="rounded-lg bg-panel-primary border border-border-subtle p-4">
          <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
            <h3 className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase flex items-center gap-2">
              <TerminalIcon className="w-3.5 h-3.5 text-cyan-400" />
              Events by Provenance
            </h3>
            <span className="text-[10px] font-mono text-slate-500">synthetic vs real</span>
          </div>
          {provenanceAvailable ? (
            provenanceTotal > 0 ? (
              <div className="mt-3 space-y-3">
                <div className="flex h-3 rounded overflow-hidden border border-border-subtle">
                  <div
                    className="bg-purple-500/60"
                    style={{ width: `${(syntheticCount / provenanceTotal) * 100}%` }}
                    title={`Synthetic: ${syntheticCount}`}
                  />
                  <div
                    className="bg-emerald-500/60"
                    style={{ width: `${(realCount / provenanceTotal) * 100}%` }}
                    title={`Real: ${realCount}`}
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <ProvenanceBadge isSynthetic={true} />
                    <span className="text-slate-200 font-mono tabular-nums">{syntheticCount}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-200 font-mono tabular-nums">{realCount}</span>
                    <ProvenanceBadge isSynthetic={false} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-[11px] font-mono text-slate-500 py-4 text-center mt-3">
                No events ingested yet.
              </div>
            )
          ) : (
            <div className="text-[11px] font-mono text-slate-500 py-4 text-center mt-3">
              Provenance breakdown unavailable from API.
            </div>
          )}
        </div>
      </div>

      {/* Visual Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Event Activity Over Time */}
        <div className="lg:col-span-2 rounded-lg bg-panel-primary border border-border-subtle p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
            <div>
              <h3 className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase flex items-center gap-2">
                <ActivityIcon className="w-3.5 h-3.5 text-cyan-400" />
                Event Volume Over Time (UTC)
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Aggregated hourly event distribution from retrieved event streams
              </p>
            </div>
            <button
              onClick={() => onNavigateSection('events')}
              className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
            >
              Explore Stream <ChevronRightIcon className="w-3 h-3" />
            </button>
          </div>

          <div className="h-56 mt-4 w-full">
            {timelineData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timelineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="eventGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00E5FF" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#00E5FF" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="time"
                    stroke="#475569"
                    fontSize={11}
                    tickLine={false}
                    fontFamily="monospace"
                  />
                  <YAxis
                    stroke="#475569"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    fontFamily="monospace"
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#121923',
                      borderColor: '#334155',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                    }}
                    labelStyle={{ color: '#00E5FF', fontWeight: 'bold' }}
                    itemStyle={{ color: '#F1F5F9' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="events"
                    stroke="#00E5FF"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#eventGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs font-mono text-slate-400">
                No chronological event records available for timeline
              </div>
            )}
          </div>
        </div>

        {/* Alert Severity & Rule Breakdown */}
        <div className="space-y-4">
          {/* Severity Breakdown */}
          <div className="rounded-lg bg-panel-primary border border-border-subtle p-4">
            <h3 className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase flex items-center gap-2 pb-2 border-b border-border-subtle">
              <ShieldAlertIcon className="w-3.5 h-3.5 text-rose-400" />
              Alerts by Severity
            </h3>

            {severityData.length > 0 ? (
              <div className="flex items-center gap-4 mt-3">
                <div className="w-28 h-28 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={severityData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={28}
                        outerRadius={45}
                        stroke="#0E131B"
                        strokeWidth={2}
                      >
                        {severityData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-1.5 text-xs font-mono">
                  {severityData.map((d) => (
                    <div key={d.name} className="flex items-center justify-between text-slate-300">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                        <span className="text-slate-400">{d.name}</span>
                      </div>
                      <span className="font-bold tabular-nums">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-xs font-mono text-slate-400">
                No active alerts in current database
              </div>
            )}
          </div>

          {/* Detections by Rule */}
          <div className="rounded-lg bg-panel-primary border border-border-subtle p-4">
            <h3 className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase flex items-center gap-2 pb-2 border-b border-border-subtle">
              <CrosshairIcon className="w-3.5 h-3.5 text-orange-400" />
              Incidents by Detection Rule
            </h3>

            <div className="h-32 mt-2 w-full">
              {ruleData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ruleData} layout="vertical" margin={{ top: 5, right: 20, left: 25, bottom: 5 }}>
                    <XAxis type="number" stroke="#475569" fontSize={10} fontFamily="monospace" allowDecimals={false} />
                    <YAxis dataKey="rule" type="category" stroke="#94A3B8" fontSize={10} fontFamily="monospace" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#121923',
                        borderColor: '#334155',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                      }}
                    />
                    <Bar dataKey="alerts" fill="#FF8A3D" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs font-mono text-slate-400">
                  No rule detections recorded
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity Feeds */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Alerts Feed */}
        <div className="rounded-lg bg-panel-primary border border-border-subtle overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle bg-panel-primary">
            <div className="flex items-center gap-2">
              <ShieldAlertIcon className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase">
                Recent Correlated Alerts
              </h3>
            </div>
            <button
              onClick={() => onNavigateSection('alerts')}
              className="text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
            >
              All Alerts <ChevronRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-border-subtle flex-1">
            {recentAlerts && recentAlerts.length > 0 ? (
              recentAlerts.slice(0, 5).map((alert) => (
                <div
                  key={alert.id}
                  onClick={() => onSelectAlert(alert.id)}
                  className="px-4 py-2.5 hover:bg-panel-secondary cursor-pointer transition-colors flex items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-cyan-400 font-semibold">
                        #{alert.id}
                      </span>
                      <span className="font-mono text-slate-300 font-medium truncate">
                        {alert.rule_name}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        ({alert.rule_id})
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
                      <span>{new Date(alert.detected_at).toUTCString().slice(5, 22)}</span>
                      {alert.source_ip && <span>Src: {alert.source_ip}</span>}
                      {alert.username && <span>User: {alert.username}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <SeverityBadge severity={alert.severity} />
                    <StatusBadge status={alert.status} />
                    <ProvenanceBadge isSynthetic={alert.is_synthetic} />
                  </div>
                </div>
              ))
            ) : (
              <div className="p-6 text-center text-xs font-mono text-slate-400">
                No alerts detected
              </div>
            )}
          </div>
        </div>

        {/* Recent Events Feed */}
        <div className="rounded-lg bg-panel-primary border border-border-subtle overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle bg-panel-primary">
            <div className="flex items-center gap-2">
              <TerminalIcon className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-mono font-bold tracking-wider text-slate-200 uppercase">
                Recent Security Telemetry
              </h3>
            </div>
            <button
              onClick={() => onNavigateSection('events')}
              className="text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
            >
              All Events <ChevronRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-border-subtle flex-1">
            {recentEvents && recentEvents.length > 0 ? (
              recentEvents.slice(0, 5).map((event) => (
                <div
                  key={event.id}
                  onClick={() => onSelectEvent(event.id)}
                  className="px-4 py-2.5 hover:bg-panel-secondary cursor-pointer transition-colors flex items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-slate-400">
                        #{event.id}
                      </span>
                      <span className="font-mono font-medium text-slate-200">
                        {event.event_type}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {event.source}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
                      <span>{new Date(event.timestamp).toUTCString().slice(5, 22)}</span>
                      {event.source_ip && <span>Src: {event.source_ip}</span>}
                      {event.destination_port && <span>Port: {event.destination_port}</span>}
                      {event.username && <span>User: {event.username}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <SeverityBadge severity={event.severity} />
                    <ProvenanceBadge isSynthetic={event.is_synthetic} />
                  </div>
                </div>
              ))
            ) : (
              <div className="p-6 text-center text-xs font-mono text-slate-400">
                No security events recorded
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
