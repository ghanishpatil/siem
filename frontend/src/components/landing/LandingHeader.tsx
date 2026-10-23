import { useState } from 'react'
import { CrosshairIcon, ShieldAlertIcon, MenuIcon, XIcon } from '../common/Icons'

interface LandingHeaderProps {
  onNavigateToDashboard: () => void
  isOnline: boolean
}

export function LandingHeader({
  onNavigateToDashboard,
  isOnline,
}: LandingHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false)

  const navLinks = [
    { label: 'Overview', href: '#overview' },
    { label: 'Capabilities', href: '#capabilities' },
    { label: 'Scenarios', href: '#scenarios' },
    { label: 'How Correlation Works', href: '#how-it-works' },
    { label: 'Evidence Model', href: '#evidence' },
    { label: 'Architecture', href: '#architecture' },
  ]

  function handleScroll(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
    e.preventDefault()
    setMobileMenuOpen(false)
    const target = document.querySelector(href)
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <header className="sticky top-0 z-40 bg-canvas/90 backdrop-blur-md border-b border-border-subtle">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded bg-cyan-950/70 border border-cyan-500/50 text-cyan-400 shadow-[0_0_15px_rgba(0,229,255,0.2)]">
            <CrosshairIcon className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base font-bold tracking-wider text-slate-100">
              SENTINEL<span className="text-cyan-400">X</span>
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-medium bg-cyan-950 text-cyan-400 border border-cyan-500/30">
              SIEM
            </span>
          </div>
        </div>

        {/* Desktop Nav Links */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-mono text-slate-400">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={(e) => handleScroll(e, link.href)}
              className="hover:text-cyan-400 transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Right Action & API Status */}
        <div className="hidden sm:flex items-center gap-4">
          <div
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono border ${
              isOnline
                ? 'bg-emerald-950/40 text-emerald-300 border-emerald-600/40'
                : 'bg-rose-950/40 text-rose-300 border-rose-600/40'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isOnline ? 'bg-emerald-400' : 'bg-rose-400'
              }`}
            />
            {isOnline ? 'ENGINE READY' : 'OFFLINE'}
          </div>

          <button
            onClick={onNavigateToDashboard}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-cyan-500 text-slate-950 font-mono font-bold text-xs hover:bg-cyan-400 shadow-[0_0_20px_rgba(0,229,255,0.25)] transition-all"
          >
            <ShieldAlertIcon className="w-4 h-4" />
            Open Security Console
          </button>
        </div>

        {/* Mobile Hamburger */}
        <div className="md:hidden flex items-center gap-2">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800"
            aria-label="Toggle Navigation"
          >
            {mobileMenuOpen ? <XIcon className="w-5 h-5" /> : <MenuIcon className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-border-subtle bg-panel-primary px-4 py-4 space-y-3">
          <nav className="flex flex-col space-y-2 text-xs font-mono text-slate-300">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => handleScroll(e, link.href)}
                className="py-1.5 px-2 rounded hover:bg-panel-secondary hover:text-cyan-400"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="pt-2 border-t border-border-subtle">
            <button
              onClick={() => {
                setMobileMenuOpen(false)
                onNavigateToDashboard()
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-cyan-500 text-slate-950 font-mono font-bold text-xs hover:bg-cyan-400"
            >
              <ShieldAlertIcon className="w-4 h-4" />
              Open Security Console
            </button>
          </div>
        </div>
      )}
    </header>
  )
}
