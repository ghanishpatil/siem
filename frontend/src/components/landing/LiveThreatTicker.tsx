export function LiveThreatTicker() {
  const telemetryItems = [
    {
      type: 'AUTH_FAIL',
      color: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
      text: '198.51.100.42:49152 -> root (pam_unix authentication failure)',
    },
    {
      type: 'EVAL_EXCEEDED',
      color: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
      text: 'AUTH-001 sliding_window=60s failures=11/10 threshold=TRIGGERED',
    },
    {
      type: 'ALERT_LOCKED',
      color: 'text-rose-400 border-rose-500/30 bg-rose-500/10',
      text: 'CRITICAL incident created · Evidence array [28, 29, 30, 31, 32] attached',
    },
    {
      type: 'PORT_SCAN',
      color: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
      text: '10.0.4.18 probed 22 ports on db-host-01 in 14.2s (SYN_PROBE)',
    },
    {
      type: 'RULE_MATCH',
      color: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
      text: 'NET-001 sliding_window=60s distinct_ports=22/15 threshold=EXCEEDED',
    },
    {
      type: 'SPRAY_ATTACK',
      color: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
      text: 'AUTH-002: 8 usernames targeted from proxy 203.0.113.88 in 180s',
    },
    {
      type: 'PRIV_ESCALATION',
      color: 'text-rose-400 border-rose-500/30 bg-rose-500/10',
      text: 'PRIV-001: uid=1002(svc-app) elevated to uid=0 -> read /etc/shadow',
    },
    {
      type: 'CIS117_STATE',
      color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
      text: 'Deterministic State Machine evaluation cycle complete · 0 unhandled events',
    },
  ]

  // Duplicate for seamless 100% -> 50% loop
  const duplicatedItems = [...telemetryItems, ...telemetryItems]

  return (
    <div className="relative z-10 w-full bg-[#090D14]/90 border-y border-border-subtle backdrop-blur-md overflow-hidden py-2.5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center">
        {/* Fixed Title Badge */}
        <div className="shrink-0 flex items-center gap-2 pr-4 mr-4 border-r border-border-subtle text-[11px] font-mono font-bold tracking-wider text-slate-300">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-cyan-400 hidden sm:inline">SAMPLE TELEMETRY</span>
          <span className="text-slate-500 text-[10px]">ILLUSTRATIVE STREAM</span>
        </div>

        {/* Marquee Track */}
        <div className="flex-1 overflow-hidden relative">
          {/* Subtle gradient fades on left & right */}
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-linear-to-r from-[#090D14] to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-linear-to-l from-[#090D14] to-transparent z-10 pointer-events-none" />

          <div className="animate-ticker flex items-center gap-6 whitespace-nowrap cursor-default">
            {duplicatedItems.map((item, idx) => (
              <div key={idx} className="inline-flex items-center gap-2 text-xs font-mono">
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold border tracking-wider ${item.color}`}
                >
                  {item.type}
                </span>
                <span className="text-slate-400">{item.text}</span>
                <span className="text-slate-700 ml-2">/</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
