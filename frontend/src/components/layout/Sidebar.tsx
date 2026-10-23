import React from 'react'
import {
  ShieldAlertIcon,
  ActivityIcon,
  TerminalIcon,
  LayersIcon,
  UploadCloudIcon,
  CrosshairIcon,
  XIcon,
  ChevronLeftIcon,
  FlaskIcon,
  NetworkIcon,
} from '../common/Icons'

export type NavSection = 'overview' | 'alerts' | 'events' | 'rules' | 'correlation' | 'ingestion' | 'simulation'

interface SidebarProps {
  currentSection: NavSection
  onSelectSection: (section: NavSection) => void
  alertCount?: number
  eventCount?: number
  mobileOpen: boolean
  onCloseMobile: () => void
  version?: string
  onNavigateToLanding?: () => void
}

export function Sidebar({
  currentSection,
  onSelectSection,
  alertCount,
  eventCount,
  mobileOpen,
  onCloseMobile,
  version = '0.1.0',
  onNavigateToLanding,
}: SidebarProps) {
  const navItems: { id: NavSection; label: string; icon: React.ReactNode; badge?: number }[] = [
    {
      id: 'overview',
      label: 'SIEM Dashboard',
      icon: <ActivityIcon className="w-4 h-4" />,
    },
    {
      id: 'alerts',
      label: 'Alerts & Incidents',
      icon: <ShieldAlertIcon className="w-4 h-4" />,
      badge: alertCount,
    },
    {
      id: 'events',
      label: 'Event Explorer',
      icon: <TerminalIcon className="w-4 h-4" />,
      badge: eventCount,
    },
    {
      id: 'rules',
      label: 'Detection Rules',
      icon: <LayersIcon className="w-4 h-4" />,
    },
    {
      id: 'correlation',
      label: 'Correlation Engine',
      icon: <NetworkIcon className="w-4 h-4" />,
    },
    {
      id: 'ingestion',
      label: 'Log Ingestion',
      icon: <UploadCloudIcon className="w-4 h-4" />,
    },
    {
      id: 'simulation',
      label: 'Simulation Lab',
      icon: <FlaskIcon className="w-4 h-4" />,
      badge: 5,
    },
  ]

  const sidebarContent = (
    <div className="h-full flex flex-col justify-between bg-canvas border-r border-border-subtle">
      {/* Brand Header */}
      <div>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded bg-cyan-950/60 border border-cyan-500/40 text-cyan-400">
              <CrosshairIcon className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-wider text-slate-100 flex items-center gap-1.5">
                SENTINEL<span className="text-cyan-400">X</span>
                <span className="text-[10px] px-1 py-0.2 rounded font-mono font-medium bg-cyan-950/80 text-cyan-400 border border-cyan-500/30">
                  SIEM
                </span>
              </div>
              <div className="text-[10px] font-mono tracking-widest text-slate-500 uppercase">
                SIEM Platform
              </div>
            </div>
          </div>

          {/* Mobile close button */}
          <button
            onClick={onCloseMobile}
            className="md:hidden p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
            aria-label="Close navigation"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation list */}
        <nav className="p-3 space-y-1">
          {onNavigateToLanding && (
            <button
              onClick={onNavigateToLanding}
              className="w-full flex items-center gap-2 px-3 py-1.5 mb-2 rounded text-[11px] font-mono text-slate-400 hover:text-cyan-300 hover:bg-panel-secondary border border-border-subtle transition-colors"
            >
              <ChevronLeftIcon className="w-3.5 h-3.5 text-cyan-400" />
              <span>← Public Landing Page</span>
            </button>
          )}
          <div className="px-3 py-1.5 text-[10px] font-mono tracking-wider text-slate-500 uppercase font-semibold">
            Telemetry & Correlation
          </div>
          {navItems.map((item) => {
            const active = currentSection === item.id
            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectSection(item.id)
                  onCloseMobile()
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all ${
                  active
                    ? 'bg-panel-secondary text-cyan-400 border-l-2 border-cyan-400 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-panel-primary'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className={active ? 'text-cyan-400' : 'text-slate-400'}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                      active
                        ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/30'
                        : 'bg-slate-900 text-slate-400 border border-slate-800'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t border-border-subtle bg-panel-primary/50">
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
          <span>Engine v{version}</span>
          <span className="inline-flex items-center gap-1 text-[10px] text-cyan-400">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            CIS-117
          </span>
        </div>
        <div className="mt-1 text-[10px] text-slate-400 truncate">
          Deterministic Correlation
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop static sidebar */}
      <aside className="hidden md:block w-64 shrink-0 h-screen sticky top-0 z-20">
        {sidebarContent}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-xs"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 left-0 w-64 shadow-2xl z-10">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  )
}
