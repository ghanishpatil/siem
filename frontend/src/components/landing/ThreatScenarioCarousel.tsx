import { useState, useEffect, useRef } from 'react'
import { SeverityBadge } from '../common/Badge'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CrosshairIcon,
  ClockIcon,
  TerminalIcon,
  CheckCircleIcon,
} from '../common/Icons'

interface Scenario {
  id: string
  ruleId: string
  title: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  mitre: string
  window: string
  summary: string
  attackNarrative: string
  evidenceCount: number
  timeline: { time: string; event: string; status: 'bad' | 'warn' | 'ok' }[]
  rawLogPreview: string
}

const SCENARIOS: Scenario[] = [
  {
    id: 'spray',
    ruleId: 'AUTH-002',
    title: 'Distributed Password Spraying',
    severity: 'high',
    mitre: 'T1110.003 · Credential Access',
    window: '300s Sliding Temporal Window',
    summary:
      'Threat actor uses an external proxy to test low-frequency credentials across distinct corporate identities, deliberately pacing requests to bypass per-account lockout triggers.',
    attackNarrative:
      '7 distinct user accounts were targeted by source IP 198.51.100.42 within 184 seconds. SentinelX correlated the common source IP across disparate target usernames into a unified high-severity incident.',
    evidenceCount: 7,
    timeline: [
      { time: '14:20:12', event: 'AUTH_FAILURE target=asmith ip=198.51.100.42', status: 'bad' },
      { time: '14:20:45', event: 'AUTH_FAILURE target=bclark ip=198.51.100.42', status: 'bad' },
      { time: '14:21:18', event: 'AUTH_FAILURE target=jdoe ip=198.51.100.42', status: 'bad' },
      { time: '14:22:04', event: 'AUTH_FAILURE target=mross ip=198.51.100.42', status: 'bad' },
      { time: '14:23:16', event: 'THRESHOLD_MET distinct_users=7 >= 5 -> ALERT_EMITTED', status: 'warn' },
    ],
    rawLogPreview: `{"event_id": 481, "event_type": "authentication", "timestamp": "2026-10-16T14:23:16Z", "source_ip": "198.51.100.42", "username": "tnguyen", "action": "failure", "details": {"auth_method": "password", "pam_service": "sshd", "distinct_usernames_window": 7}}`,
  },
  {
    id: 'brute-success',
    ruleId: 'AUTH-003',
    title: 'Authentication Failures Followed by Success',
    severity: 'critical',
    mitre: 'T1110.001 · Initial Access & Persistence',
    window: '120s Sliding Temporal Window',
    summary:
      'An attacker conducts repeated password guessing attempts against a single workstation until obtaining a valid credential, followed by an immediate successful login.',
    attackNarrative:
      '8 failed password attempts on root were recorded in 45 seconds, strictly followed by a successful authentication from the same external address. Triggered immediate Critical severity triage.',
    evidenceCount: 9,
    timeline: [
      { time: '09:12:01', event: 'AUTH_FAIL user=root attempt=1 (sshd/pam)', status: 'bad' },
      { time: '09:12:15', event: 'AUTH_FAIL user=root attempt=4 (sshd/pam)', status: 'bad' },
      { time: '09:12:38', event: 'AUTH_FAIL user=root attempt=8 (sshd/pam)', status: 'bad' },
      { time: '09:12:44', event: 'AUTH_SUCCESS user=root session=opened', status: 'ok' },
      { time: '09:12:44', event: 'CORRELATION_MATCH: 8 failures + 1 success -> CRITICAL', status: 'warn' },
    ],
    rawLogPreview: `{"event_id": 512, "event_type": "authentication", "timestamp": "2026-10-16T09:12:44Z", "source_ip": "203.0.113.88", "username": "root", "action": "success", "correlated_prior_failures": 8, "evidence_ids": [504, 505, 506, 507, 508, 509, 510, 511, 512]}`,
  },
  {
    id: 'recon-scan',
    ruleId: 'NET-001',
    title: 'Potential Port Reconnaissance Scan',
    severity: 'medium',
    mitre: 'T1046 · Network Service Discovery',
    window: '60s Sliding Temporal Window',
    summary:
      'A host initiates rapid connection attempts across numerous distinct destination ports on a target host to identify listening network services and exposed daemons.',
    attackNarrative:
      'Host 10.0.4.18 probed 22 distinct TCP ports on core database host 10.0.4.50 within 14 seconds, exceeding the 15-port threshold and generating an investigative discovery alert.',
    evidenceCount: 22,
    timeline: [
      { time: '11:04:10', event: 'TCP_SYN dst=10.0.4.50:21 status=RST', status: 'bad' },
      { time: '11:04:12', event: 'TCP_SYN dst=10.0.4.50:22 status=OPEN', status: 'ok' },
      { time: '11:04:14', event: 'TCP_SYN dst=10.0.4.50:3306 status=OPEN', status: 'ok' },
      { time: '11:04:22', event: 'TCP_SYN dst=10.0.4.50:8080 status=RST', status: 'bad' },
      { time: '11:04:24', event: 'THRESHOLD_MET: 22 unique ports probed in 14s', status: 'warn' },
    ],
    rawLogPreview: `{"event_id": 620, "event_type": "network", "timestamp": "2026-10-16T11:04:24Z", "source_ip": "10.0.4.18", "destination_ip": "10.0.4.50", "action": "scan_probed", "details": {"unique_dst_ports": 22, "protocol": "TCP", "ports": [21, 22, 80, 443, 3306, 5432, 8080]}}`,
  },
  {
    id: 'priv-esc',
    ruleId: 'PRIV-001',
    title: 'Suspicious Privilege Escalation',
    severity: 'critical',
    mitre: 'T1068 · Privilege Escalation',
    window: '180s Sliding Temporal Window',
    summary:
      'A low-privilege service or user identity performs an unexpected UID transition to root, promptly followed by file modification or sensitive process spawning.',
    attackNarrative:
      'Daemon process `svc-app` elevated permissions to uid=0 and executed `/bin/bash` with immediate file read on `/etc/shadow`. All audit events were preserved and linked into a forensic dossier.',
    evidenceCount: 4,
    timeline: [
      { time: '16:45:02', event: 'EXEC_SUDO user=svc-app binary=/bin/bash uid=0', status: 'bad' },
      { time: '16:45:03', event: 'PROCESS_SPAWN pid=4912 ppid=1204 comm=bash', status: 'warn' },
      { time: '16:45:05', event: 'FILE_ACCESS path=/etc/shadow action=read', status: 'bad' },
      { time: '16:45:06', event: 'CHAIN_LOCKED: 4 events linked to alert #107', status: 'ok' },
    ],
    rawLogPreview: `{"event_id": 788, "event_type": "privilege_escalation", "timestamp": "2026-10-16T16:45:06Z", "source_ip": "127.0.0.1", "username": "svc-app", "action": "elevation_and_access", "details": {"target_uid": 0, "target_file": "/etc/shadow", "evidence_events": [785, 786, 787, 788]}}`,
  },
]

interface ThreatScenarioCarouselProps {
  onNavigateToDashboard: () => void
}

export function ThreatScenarioCarousel({ onNavigateToDashboard }: ThreatScenarioCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const [showJson, setShowJson] = useState(false)
  const timerRef = useRef<number | null>(null)
  const slideDuration = 6000 // 6 seconds per slide

  const current = SCENARIOS[currentIndex]

  // Auto-advance logic with progress bar
  useEffect(() => {
    if (isPaused) return

    const interval = 50 // update progress every 50ms
    const step = (interval / slideDuration) * 100

    timerRef.current = window.setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          setCurrentIndex((idx) => (idx + 1) % SCENARIOS.length)
          return 0
        }
        return prev + step
      })
    }, interval)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isPaused, currentIndex])

  const handleSelect = (idx: number) => {
    setCurrentIndex(idx)
    setProgress(0)
  }

  const handlePrev = () => {
    setCurrentIndex((idx) => (idx === 0 ? SCENARIOS.length - 1 : idx - 1))
    setProgress(0)
  }

  const handleNext = () => {
    setCurrentIndex((idx) => (idx + 1) % SCENARIOS.length)
    setProgress(0)
  }

  return (
    <div
      className="relative rounded-xl bg-[#0B0F17]/90 border border-border-subtle shadow-[0_10px_40px_rgba(0,0,0,0.6)] backdrop-blur-md overflow-hidden"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Top Progress Bar */}
      <div className="h-1 w-full bg-panel-secondary relative">
        <div
          className="h-full bg-linear-to-r from-cyan-500 to-cyan-300 transition-all duration-75"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Header Bar */}
      <div className="px-6 py-4 border-b border-border-subtle flex flex-wrap items-center justify-between gap-4 bg-canvas/60">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <CrosshairIcon className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
              Interactive Incident Scenarios
            </div>
            <h3 className="text-sm font-semibold text-slate-200">
              Live Threat Detection in Action
            </h3>
          </div>
        </div>

        {/* Carousel Scenario Switcher Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-panel-secondary border border-border-subtle rounded-lg">
          {SCENARIOS.map((sc, idx) => (
            <button
              key={sc.id}
              onClick={() => handleSelect(idx)}
              className={`px-3 py-1 text-xs font-mono rounded transition-all cursor-pointer ${
                currentIndex === idx
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-[0_0_12px_rgba(0,229,255,0.4)]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-border-subtle/50'
              }`}
            >
              {sc.ruleId}
            </button>
          ))}
        </div>

        {/* Prev / Next controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrev}
            aria-label="Previous Scenario"
            className="p-1.5 rounded border border-border-subtle bg-panel-primary text-slate-400 hover:text-cyan-400 hover:border-cyan-500/40 transition-all cursor-pointer"
          >
            <ChevronLeftIcon className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono text-slate-500 px-1">
            {currentIndex + 1} / {SCENARIOS.length}
          </span>
          <button
            onClick={handleNext}
            aria-label="Next Scenario"
            className="p-1.5 rounded border border-border-subtle bg-panel-primary text-slate-400 hover:text-cyan-400 hover:border-cyan-500/40 transition-all cursor-pointer"
          >
            <ChevronRightIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Slide Body */}
      <div className="p-6 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Attack Narrative & Metrics */}
        <div className="lg:col-span-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 rounded">
                RULE: {current.ruleId}
              </span>
              <SeverityBadge severity={current.severity} />
              <span className="text-xs font-mono text-slate-500">
                {current.evidenceCount} Linked Events
              </span>
            </div>

            <h4 className="text-xl font-bold text-slate-100 tracking-tight">
              {current.title}
            </h4>

            <div className="mt-2 text-xs font-mono text-orange-400/90 flex items-center gap-2">
              <CrosshairIcon className="w-3.5 h-3.5" />
              <span>{current.mitre}</span>
            </div>

            <p className="mt-4 text-sm text-slate-300 leading-relaxed font-sans">
              {current.summary}
            </p>

            <div className="mt-4 p-3.5 rounded-lg bg-panel-primary border border-border-subtle text-xs text-slate-300 leading-relaxed font-sans">
              <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1 font-bold">
                Attack Reconstruction
              </div>
              {current.attackNarrative}
            </div>

            <div className="mt-4 flex items-center gap-4 text-xs font-mono text-slate-400">
              <div className="flex items-center gap-1.5">
                <ClockIcon className="w-3.5 h-3.5 text-slate-500" />
                <span>{current.window}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-400" />
                <span>Zero False-Positives</span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-border-subtle flex items-center gap-4">
            <button
              onClick={onNavigateToDashboard}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-500 text-slate-950 font-mono font-bold text-xs hover:bg-cyan-400 shadow-[0_0_20px_rgba(0,229,255,0.25)] transition-all cursor-pointer"
            >
              <span>Investigate Scenario in Console</span>
              <span>→</span>
            </button>
            <button
              onClick={() => setShowJson(!showJson)}
              className="px-3 py-2 rounded-lg bg-panel-secondary border border-border-subtle text-slate-300 hover:text-cyan-400 text-xs font-mono transition-all cursor-pointer"
            >
              {showJson ? 'View Timeline' : 'View Raw Evidence JSON'}
            </button>
          </div>
        </div>

        {/* Right Column: Forensic Timeline or JSON View */}
        <div className="lg:col-span-6 flex flex-col">
          <div className="rounded-lg bg-[#090D14] border border-border-subtle flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border-subtle flex items-center justify-between bg-panel-primary/70">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-rose-500/70" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
                <span className="text-[11px] font-mono text-slate-400 ml-2">
                  {showJson ? 'evidence_payload.json' : 'forensic_chronology.log'}
                </span>
              </div>
              <span className="text-[10px] font-mono text-cyan-400/80">
                EVIDENCE_CORRELATION
              </span>
            </div>

            <div className="p-4 flex-1 overflow-auto max-h-75">
              {showJson ? (
                <pre className="text-xs font-mono text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {current.rawLogPreview}
                </pre>
              ) : (
                <div className="space-y-3">
                  {current.timeline.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-3 text-xs font-mono">
                      <span className="text-slate-500 shrink-0">{item.time}</span>
                      <div className="flex-1">
                        <span
                          className={
                            item.status === 'bad'
                              ? 'text-rose-400'
                              : item.status === 'warn'
                              ? 'text-amber-400 font-bold'
                              : 'text-emerald-400'
                          }
                        >
                          {item.event}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-4 py-2.5 border-t border-border-subtle bg-panel-primary/50 flex items-center justify-between text-[11px] font-mono text-slate-500">
              <span className="flex items-center gap-1.5">
                <TerminalIcon className="w-3.5 h-3.5 text-slate-600" />
                <span>Deterministic Evidence Array</span>
              </span>
              <span>{isPaused ? 'PAUSED' : 'AUTO-ADVANCING'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
