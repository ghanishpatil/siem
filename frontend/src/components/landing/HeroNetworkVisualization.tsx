import { useState, useEffect } from 'react'

export function HeroNetworkVisualization() {
  const [pulseIndex, setPulseIndex] = useState<number>(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setPulseIndex((prev) => (prev + 1) % 4)
    }, 2800)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="relative w-full max-w-2xl mx-auto aspect-16/10 bg-[#0A0E17]/90 rounded-xl border border-cyan-500/30 overflow-hidden shadow-[0_0_50px_rgba(0,229,255,0.08)]">
      {/* Background Radar Grid */}
      <div className="absolute inset-0 bg-radar-grid opacity-30 pointer-events-none" />

      {/* Radial Ambient Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* SVG Canvas for Network Connections and Signal Packets */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 640 400"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Cyan Glow Filter */}
          <filter id="glow-cyan" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          {/* Rose Glow Filter */}
          <filter id="glow-rose" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          {/* Ingress Gradients */}
          <linearGradient id="streamGrad1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#334155" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#00E5FF" stopOpacity="0.8" />
          </linearGradient>
          <linearGradient id="alertGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#FF4757" stopOpacity="0.9" />
          </linearGradient>
        </defs>

        {/* --- INGRESS TO ENGINE CONNECTIONS --- */}
        {/* Source 1 (Auth Stream) -> Center */}
        <path
          d="M 90 90 C 180 90, 220 180, 320 190"
          stroke="#1E293B"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
        <path
          d="M 90 90 C 180 90, 220 180, 320 190"
          stroke="#00E5FF"
          strokeWidth="1.5"
          strokeDasharray="8 12"
          className="animate-flow-dash"
          opacity={pulseIndex === 0 ? 0.9 : 0.3}
        />

        {/* Source 2 (Firewall Netflow) -> Center */}
        <path
          d="M 70 200 C 160 200, 220 200, 320 200"
          stroke="#1E293B"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
        <path
          d="M 70 200 C 160 200, 220 200, 320 200"
          stroke="#00E5FF"
          strokeWidth="1.5"
          strokeDasharray="8 12"
          className="animate-flow-dash"
          opacity={pulseIndex === 1 ? 0.9 : 0.3}
        />

        {/* Source 3 (Bastion Syslog) -> Center */}
        <path
          d="M 90 310 C 180 310, 220 220, 320 210"
          stroke="#1E293B"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
        <path
          d="M 90 310 C 180 310, 220 220, 320 210"
          stroke="#00E5FF"
          strokeWidth="1.5"
          strokeDasharray="8 12"
          className="animate-flow-dash"
          opacity={pulseIndex === 2 ? 0.9 : 0.3}
        />

        {/* --- CENTER ENGINE TO DETECTIONS & EVIDENCE --- */}
        {/* Center -> Rule AUTH-003 */}
        <path
          d="M 320 200 C 400 190, 430 110, 520 110"
          stroke="url(#alertGrad)"
          strokeWidth="2"
          strokeDasharray="6 6"
          className="animate-flow-dash-fast"
        />

        {/* Center -> Rule NET-001 */}
        <path
          d="M 320 200 C 400 200, 440 200, 520 200"
          stroke="#334155"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />

        {/* Center -> Rule PRIV-001 */}
        <path
          d="M 320 200 C 400 210, 430 290, 520 290"
          stroke="#FF8A3D"
          strokeWidth="1.5"
          strokeDasharray="6 8"
          className="animate-flow-dash"
          opacity="0.7"
        />

        {/* Evidence Link Arch between Ingress Auth & High Alert */}
        <path
          d="M 90 90 C 260 20, 420 30, 520 110"
          stroke="#FF4757"
          strokeWidth="1"
          strokeDasharray="2 4"
          opacity="0.4"
        />

        {/* --- INGRESS NODES --- */}
        {/* Node 1: Linux Auth */}
        <circle cx="90" cy="90" r="16" fill="#0E131B" stroke="#00E5FF" strokeWidth="1.5" />
        <circle cx="90" cy="90" r="5" fill="#00E5FF" />

        {/* Node 2: Network Netflow */}
        <circle cx="70" cy="200" r="16" fill="#0E131B" stroke="#00E5FF" strokeWidth="1.5" />
        <circle cx="70" cy="200" r="5" fill="#00E5FF" />

        {/* Node 3: Bastion Syslog */}
        <circle cx="90" cy="310" r="16" fill="#0E131B" stroke="#00E5FF" strokeWidth="1.5" />
        <circle cx="90" cy="310" r="5" fill="#00E5FF" />

        {/* --- CENTRAL CORRELATION ENGINE CORE --- */}
        <circle
          cx="320"
          cy="200"
          r="48"
          fill="#080B10"
          stroke="#00E5FF"
          strokeWidth="1"
          strokeDasharray="4 4"
          className="animate-spin-very-slow"
        />
        <circle
          cx="320"
          cy="200"
          r="38"
          fill="#0E131B"
          stroke="#00E5FF"
          strokeWidth="1.5"
          filter="url(#glow-cyan)"
        />
        <circle
          cx="320"
          cy="200"
          r="26"
          fill="#121923"
          stroke="#334155"
          strokeWidth="1"
        />
        <circle cx="320" cy="200" r="8" fill="#00E5FF" className="animate-pulse" />

        {/* Crosshair lines inside engine */}
        <line x1="320" y1="165" x2="320" y2="185" stroke="#00E5FF" strokeWidth="1.5" />
        <line x1="320" y1="215" x2="320" y2="235" stroke="#00E5FF" strokeWidth="1.5" />
        <line x1="285" y1="200" x2="305" y2="200" stroke="#00E5FF" strokeWidth="1.5" />
        <line x1="335" y1="200" x2="355" y2="200" stroke="#00E5FF" strokeWidth="1.5" />

        {/* --- ALERT / DETECTION NODES --- */}
        {/* Alert 1: AUTH-003 Critical Alert */}
        <circle
          cx="520"
          cy="110"
          r="20"
          fill="#0E131B"
          stroke="#FF4757"
          strokeWidth="2"
          filter="url(#glow-rose)"
        />
        <circle cx="520" cy="110" r="7" fill="#FF4757" className="animate-ping-slow" />
        <circle cx="520" cy="110" r="7" fill="#FF4757" />

        {/* Alert 2: NET-001 Medium Alert */}
        <circle cx="520" cy="200" r="16" fill="#0E131B" stroke="#F5C451" strokeWidth="1.5" />
        <circle cx="520" cy="200" r="5" fill="#F5C451" />

        {/* Alert 3: PRIV-001 High Alert */}
        <circle cx="520" cy="290" r="18" fill="#0E131B" stroke="#FF8A3D" strokeWidth="1.5" />
        <circle cx="520" cy="290" r="6" fill="#FF8A3D" />
      </svg>

      {/* Floating Tactical Badges & Annotations */}
      {/* Ingress Labels */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 text-[10px] font-mono text-cyan-400 bg-panel-primary/90 px-2 py-0.5 rounded border border-cyan-500/30 whitespace-nowrap"
        style={{ left: '14%', top: '14%' }}
      >
        auth.log (SSH)
      </div>
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 text-[10px] font-mono text-cyan-400 bg-panel-primary/90 px-2 py-0.5 rounded border border-cyan-500/30 whitespace-nowrap"
        style={{ left: '15%', top: '42%' }}
      >
        netflow (pcap)
      </div>
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 text-[10px] font-mono text-cyan-400 bg-panel-primary/90 px-2 py-0.5 rounded border border-cyan-500/30 whitespace-nowrap"
        style={{ left: '14%', top: '69%' }}
      >
        syslog (auditd)
      </div>

      {/* Engine Center Label */}
      <div
        className="absolute -translate-x-1/2 text-center pointer-events-none whitespace-nowrap"
        style={{ left: '50%', top: '64%' }}
      >
        <div className="text-[11px] font-mono font-bold text-slate-100 tracking-wider uppercase">
          CORRELATION ENGINE
        </div>
        <div className="text-[9px] font-mono text-cyan-400">
          CIS-117 · Sliding Windows
        </div>
      </div>

      {/* Detection Labels */}
      <div className="absolute text-right" style={{ top: '12%', right: '3%' }}>
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-rose-950/80 border border-rose-500/50 text-[10px] font-mono text-rose-300 font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
          CRITICAL INCIDENT
        </div>
        <div className="text-[9px] font-mono text-slate-400 mt-0.5">
          AUTH-003 · 6 Evidence Events
        </div>
      </div>

      <div className="absolute text-right" style={{ top: '43%', right: '4%' }}>
        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/60 border border-amber-500/40 text-[10px] font-mono text-amber-300">
          NET-001 (Port Scan)
        </div>
      </div>

      <div className="absolute text-right" style={{ top: '62%', right: '3%' }}>
        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-orange-950/60 border border-orange-500/40 text-[10px] font-mono text-orange-300 font-semibold">
          PRIV-001 (Escalation)
        </div>
      </div>

      {/* Bottom Telemetry HUD Line */}
      <div className="absolute bottom-2 left-4 right-4 flex items-center justify-between text-[10px] font-mono text-slate-400 border-t border-border-subtle/70 pt-2">
        <span className="flex items-center gap-1.5 text-cyan-400">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          DETERMINISTIC EVALUATION ACTIVE
        </span>
        <span className="tabular-nums">
          5 ACTIVE RULES · BOUNDED INGESTION
        </span>
      </div>
    </div>
  )
}
