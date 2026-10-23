import React from 'react'

interface StatCardProps {
  label: string
  value: number | string
  sublabel?: string
  icon?: React.ReactNode
  accentColor?: 'cyan' | 'rose' | 'orange' | 'amber' | 'emerald' | 'slate'
  loading?: boolean
}

export function StatCard({
  label,
  value,
  sublabel,
  icon,
  accentColor = 'cyan',
  loading = false,
}: StatCardProps) {
  const accentBorder = {
    cyan: 'border-cyan-500/30 hover:border-cyan-500/60',
    rose: 'border-rose-500/30 hover:border-rose-500/60',
    orange: 'border-orange-500/30 hover:border-orange-500/60',
    amber: 'border-amber-500/30 hover:border-amber-500/60',
    emerald: 'border-emerald-500/30 hover:border-emerald-500/60',
    slate: 'border-slate-800 hover:border-slate-700',
  }[accentColor]

  const accentBadge = {
    cyan: 'text-cyan-400 bg-cyan-950/30',
    rose: 'text-rose-400 bg-rose-950/30',
    orange: 'text-orange-400 bg-orange-950/30',
    amber: 'text-amber-400 bg-amber-950/30',
    emerald: 'text-emerald-400 bg-emerald-950/30',
    slate: 'text-slate-400 bg-slate-900',
  }[accentColor]

  return (
    <div
      className={`relative overflow-hidden rounded-lg bg-panel-primary border ${accentBorder} p-4 transition-all duration-150 flex flex-col justify-between`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-mono font-medium tracking-wider text-slate-400 uppercase">
          {label}
        </span>
        {icon && (
          <div className={`p-1.5 rounded ${accentBadge}`}>
            {icon}
          </div>
        )}
      </div>

      <div className="mt-3">
        {loading ? (
          <div className="h-8 w-20 bg-slate-800/60 rounded animate-pulse" />
        ) : (
          <div className="text-2xl font-mono font-bold text-slate-100 tabular-nums">
            {value}
          </div>
        )}
        {sublabel && (
          <div className="mt-1 text-xs text-slate-400">
            {sublabel}
          </div>
        )}
      </div>
    </div>
  )
}
