import { useState, useEffect } from 'react'
import { RefreshCwIcon, MenuIcon } from '../common/Icons'
import type { NavSection } from './Sidebar'

interface TopBarProps {
  currentSection: NavSection
  isOnline: boolean
  isCheckingHealth: boolean
  onRefresh: () => void
  isRefreshing: boolean
  onOpenMobileNav: () => void
}

export function TopBar({
  currentSection,
  isOnline,
  isCheckingHealth,
  onRefresh,
  isRefreshing,
  onOpenMobileNav,
}: TopBarProps) {
  const [timeStr, setTimeStr] = useState<string>('')

  useEffect(() => {
    function update() {
      const now = new Date()
      setTimeStr(now.toUTCString().slice(17, 25) + ' UTC')
    }
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [])

  const sectionTitles: Record<NavSection, { title: string; subtitle: string }> = {
    overview: {
      title: 'SIEM Dashboard',
      subtitle: 'Real-time telemetry aggregation and alert metric breakdown',
    },
    alerts: {
      title: 'Alerts & Incidents',
      subtitle: 'Deterministic detections with resolved event evidence and lifecycle states',
    },
    events: {
      title: 'Event Explorer',
      subtitle: 'Normalized security log stream with forensic payload inspection',
    },
    rules: {
      title: 'Detection Rules Catalog',
      subtitle: 'Deterministic correlation specifications with active parameter thresholds',
    },
    correlation: {
      title: 'Correlation Engine',
      subtitle: 'Live event correlation with real-time flow graph visualization',
    },
    ingestion: {
      title: 'Log Ingestion Pipeline',
      subtitle: 'Direct event ingestion supporting JSON objects, arrays, and JSONL streams',
    },
    simulation: {
      title: 'Attack Simulation Lab',
      subtitle: 'Deterministic threat generation and detection verification',
    },
  }

  const { title, subtitle } = sectionTitles[currentSection]

  return (
    <header className="sticky top-0 z-10 bg-canvas/95 backdrop-blur-md border-b border-border-subtle px-4 md:px-6 py-3.5">
      <div className="flex items-center justify-between gap-4">
        {/* Left: Mobile Toggle + Section Heading */}
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenMobileNav}
            className="md:hidden p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 focus:outline-none"
            aria-label="Open navigation menu"
          >
            <MenuIcon className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base md:text-lg font-bold text-slate-100 tracking-tight flex items-center gap-2">
              {title}
            </h1>
            <p className="hidden sm:block text-xs text-slate-400">
              {subtitle}
            </p>
          </div>
        </div>

        {/* Right: Status Indicators & Actions */}
        <div className="flex items-center gap-3">
          {/* Live UTC Clock */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded bg-panel-primary border border-border-subtle text-xs font-mono text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            <span className="tabular-nums text-slate-300">{timeStr}</span>
          </div>

          {/* Health Status Indicator */}
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono border ${
              isCheckingHealth
                ? 'bg-amber-950/30 text-amber-400 border-amber-600/30'
                : isOnline
                ? 'bg-emerald-950/30 text-emerald-400 border-emerald-600/30'
                : 'bg-rose-950/30 text-rose-400 border-rose-600/30'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isCheckingHealth
                  ? 'bg-amber-400 animate-pulse'
                  : isOnline
                  ? 'bg-emerald-400'
                  : 'bg-rose-400'
              }`}
            />
            <span className="text-[11px] font-medium">
              {isCheckingHealth ? 'SYNCING' : isOnline ? 'API ONLINE' : 'API OFFLINE'}
            </span>
          </div>

          {/* Manual Refresh Button */}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Refresh current data"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-panel-primary border border-border-subtle text-slate-200 hover:text-cyan-400 hover:border-cyan-500/40 disabled:opacity-50 transition-colors text-xs font-medium"
          >
            <RefreshCwIcon className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>
    </header>
  )
}
