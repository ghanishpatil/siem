import type { AlertSeverity, AlertStatus } from '../../types/alert'
import type { EventSeverity } from '../../types/event'

export function SeverityBadge({
  severity,
  className = '',
}: {
  severity: AlertSeverity | EventSeverity | string
  className?: string
}) {
  const sev = (severity || 'info').toLowerCase()
  
  let styles = 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
  let label = 'LOW'

  if (sev === 'critical') {
    styles = 'bg-rose-500/15 text-rose-400 border-rose-500/40 ring-1 ring-rose-500/20'
    label = 'CRITICAL'
  } else if (sev === 'high') {
    styles = 'bg-orange-500/15 text-orange-400 border-orange-500/40'
    label = 'HIGH'
  } else if (sev === 'medium') {
    styles = 'bg-amber-500/15 text-amber-400 border-amber-500/40'
    label = 'MEDIUM'
  } else if (sev === 'low') {
    styles = 'bg-sky-500/15 text-sky-400 border-sky-500/30'
    label = 'LOW'
  } else if (sev === 'info') {
    styles = 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
    label = 'INFO'
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-semibold uppercase tracking-wider border ${styles} ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  )
}

export function StatusBadge({
  status,
  className = '',
}: {
  status: AlertStatus | string
  className?: string
}) {
  const s = (status || 'open').toLowerCase()

  let styles = 'bg-slate-800 text-slate-300 border-slate-700'
  let label = s.toUpperCase()

  switch (s) {
    case 'open':
      styles = 'bg-rose-500/10 text-rose-400 border-rose-500/30'
      label = 'OPEN'
      break
    case 'investigating':
      styles = 'bg-orange-500/10 text-orange-400 border-orange-500/30'
      label = 'INVESTIGATING'
      break
    case 'acknowledged':
      styles = 'bg-amber-500/10 text-amber-400 border-amber-500/30'
      label = 'ACKNOWLEDGED'
      break
    case 'resolved':
      styles = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
      label = 'RESOLVED'
      break
    case 'false_positive':
      styles = 'bg-slate-700/30 text-slate-400 border-slate-600/40'
      label = 'FALSE POSITIVE'
      break
    case 'closed':
      styles = 'bg-slate-800/60 text-slate-500 border-slate-700/30'
      label = 'CLOSED'
      break
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-medium tracking-wider border ${styles} ${className}`}
    >
      {label}
    </span>
  )
}

export function ProvenanceBadge({
  isSynthetic,
  className = '',
}: {
  isSynthetic: boolean
  className?: string
}) {
  if (isSynthetic) {
    return (
      <span
        title="Demonstration record seeded from synthetic fixture"
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium tracking-wider border bg-purple-950/40 text-purple-300 border-purple-700/40 ${className}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
        SYNTHETIC
      </span>
    )
  }

  return (
    <span
      title="Live telemetry collected and ingested through event pipeline"
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium tracking-wider border bg-emerald-950/40 text-emerald-300 border-emerald-600/40 ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
      REAL TELEMETRY
    </span>
  )
}
