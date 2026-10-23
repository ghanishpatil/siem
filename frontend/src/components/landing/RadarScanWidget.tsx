import { useState } from 'react'

interface Blip {
  id: string
  label: string
  rule: string
  x: number // percent 0-100
  y: number // percent 0-100
  severity: 'critical' | 'high' | 'medium'
}

export function RadarScanWidget() {
  const [activeBlip, setActiveBlip] = useState<Blip | null>(null)

  const blips: Blip[] = [
    { id: '1', label: '198.51.100.42 (SSH)', rule: 'AUTH-003', x: 68, y: 32, severity: 'critical' },
    { id: '2', label: '10.0.4.18 (Port Scan)', rule: 'NET-001', x: 28, y: 70, severity: 'medium' },
    { id: '3', label: '203.0.113.88 (Spray)', rule: 'AUTH-002', x: 74, y: 64, severity: 'high' },
    { id: '4', label: 'svc-app (Sudo Root)', rule: 'PRIV-001', x: 38, y: 30, severity: 'critical' },
  ]

  return (
    <div className="p-5 rounded-xl bg-[#090D14]/90 border border-border-subtle shadow-[0_10px_30px_rgba(0,0,0,0.5)] flex flex-col justify-between relative overflow-hidden backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border-subtle mb-4">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
          </span>
          <span className="text-xs font-mono font-bold text-slate-200">
            RADAR THREAT SWEEP (SAMPLE)
          </span>
        </div>
        <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 rounded">
          ILLUSTRATIVE DATA
        </span>
      </div>

      {/* Radar Screen */}
      <div className="relative w-full aspect-square max-w-70 mx-auto rounded-full border border-cyan-500/30 bg-canvas overflow-hidden flex items-center justify-center shadow-[inset_0_0_40px_rgba(0,229,255,0.06)]">
        {/* Concentric distance rings */}
        <div className="absolute inset-[15%] rounded-full border border-cyan-500/15" />
        <div className="absolute inset-[35%] rounded-full border border-cyan-500/20" />
        <div className="absolute inset-[55%] rounded-full border border-cyan-500/25" />
        <div className="absolute inset-[75%] rounded-full border border-cyan-500/30" />

        {/* Crosshairs */}
        <div className="absolute inset-x-0 top-1/2 h-px bg-cyan-500/20" />
        <div className="absolute inset-y-0 left-1/2 w-px bg-cyan-500/20" />

        {/* Diagonal guides */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-full h-px bg-cyan-500/10 rotate-45" />
          <div className="w-full h-px bg-cyan-500/10 -rotate-45" />
        </div>

        {/* Sweeping Beam */}
        <div
          className="absolute inset-0 rounded-full animate-radar-sweep pointer-events-none"
          style={{
            background:
              'conic-gradient(from 0deg at 50% 50%, rgba(0, 229, 255, 0.4) 0deg, rgba(0, 229, 255, 0.08) 45deg, transparent 90deg, transparent 360deg)',
          }}
        />

        {/* Threat Blips */}
        {blips.map((blip) => {
          const colorClass =
            blip.severity === 'critical'
              ? 'bg-rose-500 border-rose-400 text-rose-300'
              : blip.severity === 'high'
              ? 'bg-orange-500 border-orange-400 text-orange-300'
              : 'bg-amber-500 border-amber-400 text-amber-300'

          return (
            <button
              key={blip.id}
              onClick={() => setActiveBlip(blip)}
              className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer group z-10"
              style={{ left: `${blip.x}%`, top: `${blip.y}%` }}
              aria-label={`Inspect anomaly ${blip.label}`}
            >
              <span className="relative flex h-3 w-3 items-center justify-center">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    blip.severity === 'critical' ? 'bg-rose-400' : 'bg-orange-400'
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 border ${colorClass}`}
                />
              </span>
            </button>
          )
        })}

        {/* Center Origin Hub */}
        <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_10px_#00E5FF] z-10" />
      </div>

      {/* Selected Blip Metadata Drawer */}
      <div className="mt-4 pt-3 border-t border-border-subtle">
        {activeBlip ? (
          <div className="flex items-center justify-between text-xs font-mono">
            <div>
              <span className="text-slate-500 text-[10px]">TARGET: </span>
              <span className="text-slate-200 font-semibold">{activeBlip.label}</span>
            </div>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                activeBlip.severity === 'critical'
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
              }`}
            >
              {activeBlip.rule}
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
            <span>Click any target blip to inspect</span>
            <span className="text-cyan-400">4 DETECTIONS</span>
          </div>
        )}
      </div>
    </div>
  )
}
