import { useState, useEffect } from 'react'
import type { AlertStatsResponse } from '../../types/alert'
import type { StatsResponse } from '../../types/event'
import { HeroNetworkVisualization } from './HeroNetworkVisualization'
import { LandingHeader } from './LandingHeader'
import { CyberBackground } from './CyberBackground'
import { LiveThreatTicker } from './LiveThreatTicker'
import { ThreatScenarioCarousel } from './ThreatScenarioCarousel'
import { RadarScanWidget } from './RadarScanWidget'
import { useInView } from '../../hooks/useInView'
import { useCountUp } from '../../hooks/useCountUp'
import { SeverityBadge, ProvenanceBadge } from '../common/Badge'
import {
  ShieldAlertIcon,
  CrosshairIcon,
  TerminalIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  FileTextIcon,
  DatabaseIcon,
  UploadCloudIcon,
  ClockIcon,
} from '../common/Icons'

interface LandingViewProps {
  onNavigateToDashboard: () => void
  alertStats: AlertStatsResponse | null
  eventStats: StatsResponse | null
  isOnline: boolean
}

export function LandingView({
  onNavigateToDashboard,
  alertStats,
  eventStats,
  isOnline,
}: LandingViewProps) {
  // Scroll reveal observers
  const overviewView = useInView({ threshold: 0.15 })
  const capabilitiesView = useInView({ threshold: 0.1 })
  const scenariosView = useInView({ threshold: 0.1 })
  const workflowView = useInView({ threshold: 0.15 })
  const evidenceView = useInView({ threshold: 0.15 })
  const architectureView = useInView({ threshold: 0.15 })
  const ctaView = useInView({ threshold: 0.2 })

  // Interactive scroll progress bar
  const [scrollProgress, setScrollProgress] = useState(0)

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY
      const docHeight = document.documentElement.scrollHeight - window.innerHeight
      if (docHeight > 0) {
        setScrollProgress(Math.min(100, Math.max(0, (scrollTop / docHeight) * 100)))
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Active capability tab
  const [activeRuleId, setActiveRuleId] = useState<string>('AUTH-003')

  // Animated metric counters (from real API stats)
  const totalEvents = eventStats?.total_events || 0
  const totalAlerts = alertStats?.total_alerts || 0
  const criticalCount = alertStats?.by_severity?.['critical'] || 0
  const recentWindow = eventStats?.recent_window_hours || 24

  const animatedEvents = useCountUp(totalEvents, 1200, overviewView.isInView)
  const animatedAlerts = useCountUp(totalAlerts, 1000, overviewView.isInView)
  const animatedCritical = useCountUp(criticalCount, 800, overviewView.isInView)
  const animatedRules = useCountUp(5, 600, overviewView.isInView)

  const rulesCatalog = [
    {
      id: 'AUTH-001',
      name: 'Brute Force Authentication',
      severity: 'high',
      category: 'Credential Access',
      condition: '≥ 10 failures from single Source IP within 60s',
      description:
        'Detects high-volume credential guessing attacks targeting an authentication endpoint from a single source address.',
      technique: 'MITRE ATT&CK T1110.001',
      entities: 'source_ip',
    },
    {
      id: 'AUTH-002',
      name: 'Password Spraying',
      severity: 'high',
      category: 'Credential Access',
      condition: '≥ 5 distinct user accounts targeted within 300s',
      description:
        'Detects horizontal spray patterns testing low-frequency passwords across multiple distinct corporate identities to bypass account lockout controls.',
      technique: 'MITRE ATT&CK T1110.003',
      entities: 'source_ip + username[]',
    },
    {
      id: 'AUTH-003',
      name: 'Failed Logins Followed by Success',
      severity: 'critical',
      category: 'Initial Access & Compromise',
      condition: '≥ 5 failures strictly followed by successful authentication',
      description:
        'High-confidence indicator of active compromise. Flags when repeated failed login attempts for a specific account and IP culminate in a success within 300 seconds.',
      technique: 'MITRE ATT&CK T1110 / T1078',
      entities: 'source_ip + username',
    },
    {
      id: 'NET-001',
      name: 'Potential Port Scan',
      severity: 'medium',
      category: 'Discovery / Reconnaissance',
      condition: '≥ 15 unique destination ports probed within 60s',
      description:
        'Identifies adversarial reconnaissance or port-sweeping utilities (e.g. Nmap, Masscan) probing network endpoints for vulnerable service ports.',
      technique: 'MITRE ATT&CK T1046',
      entities: 'source_ip + destination_port[]',
    },
    {
      id: 'PRIV-001',
      name: 'Suspicious Privilege Escalation',
      severity: 'high',
      category: 'Privilege Escalation',
      condition: 'Privilege escalation event followed by file access / process creation',
      description:
        'Correlates a genuine privilege escalation event with subsequent sensitive post-exploitation activity by the same account within a 300s window.',
      technique: 'MITRE ATT&CK T1068 / T1059',
      entities: 'username + sensitive_action',
    },
  ]

  const selectedRule = rulesCatalog.find((r) => r.id === activeRuleId) || rulesCatalog[2]

  return (
    <div className="relative min-h-screen bg-canvas text-[#F1F5F9] selection:bg-cyan-500 selection:text-black overflow-x-hidden">
      {/* Top Cyber Scroll Progress Bar */}
      <div className="fixed top-0 left-0 right-0 h-0.5 z-50 bg-transparent pointer-events-none">
        <div
          className="h-full bg-linear-to-r from-cyan-500 via-sky-300 to-cyan-400 shadow-[0_0_12px_#00E5FF] transition-all duration-75 ease-out"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>

      {/* Live Interactive Cybersecurity Constellation Background */}
      <CyberBackground />

      {/* Top Header */}
      <LandingHeader
        onNavigateToDashboard={onNavigateToDashboard}
        isOnline={isOnline}
      />

      {/* --- 1. HERO SECTION --- */}
      <section className="relative pt-12 pb-20 md:pt-20 md:pb-32 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column: Copy & CTA */}
          <div className="lg:col-span-6 space-y-6 animate-fade-in-up">
            {/* Eyebrow Label */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-xs font-mono font-medium text-cyan-300 shadow-[0_0_12px_rgba(0,229,255,0.15)]">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              SIEM PLATFORM
            </div>

            {/* Main Heading */}
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-100 leading-[1.1]">
              See the Threat.{' '}
              <span className="text-transparent bg-clip-text bg-linear-to-r from-cyan-400 via-sky-300 to-cyan-500">
                Connect the Evidence.
              </span>
            </h1>

            {/* Description */}
            <p className="text-base sm:text-lg text-slate-400 font-sans leading-relaxed max-w-xl">
              SentinelX correlates security events, detects suspicious activity, and connects
              alerts to the evidence analysts need to investigate.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button
                onClick={onNavigateToDashboard}
                className="inline-flex items-center gap-2.5 px-6 py-3 rounded-lg bg-cyan-500 text-slate-950 font-mono font-bold text-sm hover:bg-cyan-400 shadow-[0_0_25px_rgba(0,229,255,0.3)] transition-all hover:scale-[1.02]"
              >
                <ShieldAlertIcon className="w-4 h-4" />
                Open Security Console
              </button>

              <a
                href="#capabilities"
                onClick={(e) => {
                  e.preventDefault()
                  document.querySelector('#capabilities')?.scrollIntoView({ behavior: 'smooth' })
                }}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-panel-primary border border-border-subtle text-slate-300 hover:text-cyan-400 hover:border-cyan-500/40 text-sm font-mono font-medium transition-all"
              >
                Explore Detection Capabilities
                <ChevronRightIcon className="w-4 h-4" />
              </a>
            </div>

            {/* Standards & Provenance Badges */}
            <div className="flex items-center gap-6 pt-4 text-xs font-mono text-slate-500">
              <span className="flex items-center gap-1.5">
                <CheckCircleIcon className="w-4 h-4 text-cyan-400" />
                CIS-117 Deterministic Rules
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircleIcon className="w-4 h-4 text-emerald-400" />
                Zero Fabricated Alerts
              </span>
            </div>
          </div>

          {/* Right Column: Hero Network Visualization */}
          <div className="lg:col-span-6 animate-fade-in-up" style={{ animationDelay: '150ms' }}>
            <HeroNetworkVisualization />
          </div>
        </div>
      </section>

      {/* --- 1.5 LIVE TELEMETRY MARQUEE STREAM --- */}
      <LiveThreatTicker />

      {/* --- 2. SYSTEM OVERVIEW: LIVE TELEMETRY COUNTER RIBBON --- */}
      <section
        id="overview"
        ref={overviewView.ref}
        className="border-y border-border-subtle bg-[#0A0E17]/80 py-10 px-4 sm:px-6 lg:px-8"
      >
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
            <div>
              <div className="text-[11px] font-mono tracking-wider uppercase text-cyan-400 font-semibold">
                Live Repository Telemetry Status
              </div>
              <h2 className="text-xl font-bold text-slate-100">
                Connected Backend State
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <ProvenanceBadge isSynthetic={false} />
              <div className="text-xs font-mono text-slate-400">
                Window: {recentWindow}h sliding retention
              </div>
            </div>
          </div>

          {isOnline ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* Left Column: 4 metric cards + status footer (8 cols) */}
              <div className="lg:col-span-8 flex flex-col justify-between gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-5 rounded-lg bg-panel-primary/90 border border-border-subtle hover:border-cyan-500/40 transition-all hover:-translate-y-0.5 shadow-lg">
                    <div className="text-[11px] font-mono uppercase text-slate-400 flex items-center justify-between">
                      <span>Normalized Telemetry</span>
                      <DatabaseIcon className="w-3.5 h-3.5 text-slate-500" />
                    </div>
                    <div className="mt-2 text-3xl font-mono font-bold text-slate-100 tabular-nums">
                      {animatedEvents}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Persisted SQLite records
                    </div>
                  </div>

                  <div className="p-5 rounded-lg bg-panel-primary/90 border border-border-subtle hover:border-cyan-500/40 transition-all hover:-translate-y-0.5 shadow-lg">
                    <div className="text-[11px] font-mono uppercase text-slate-400 flex items-center justify-between">
                      <span>Active Incidents</span>
                      <ShieldAlertIcon className="w-3.5 h-3.5 text-slate-500" />
                    </div>
                    <div className="mt-2 text-3xl font-mono font-bold text-slate-100 tabular-nums">
                      {animatedAlerts}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Stateful fingerprinted alerts
                    </div>
                  </div>

                  <div className="p-5 rounded-lg bg-panel-primary/90 border border-rose-500/30 hover:border-rose-500/50 transition-all hover:-translate-y-0.5 shadow-lg">
                    <div className="text-[11px] font-mono uppercase text-rose-400 flex items-center justify-between">
                      <span>Critical Severity</span>
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                    </div>
                    <div className="mt-2 text-3xl font-mono font-bold text-rose-400 tabular-nums">
                      {animatedCritical}
                    </div>
                    <div className="mt-1 text-xs text-rose-300/70">
                      High-priority active compromise
                    </div>
                  </div>

                  <div className="p-5 rounded-lg bg-panel-primary/90 border border-cyan-500/30 hover:border-cyan-500/50 transition-all hover:-translate-y-0.5 shadow-lg">
                    <div className="text-[11px] font-mono uppercase text-cyan-400 flex items-center justify-between">
                      <span>Deterministic Rules</span>
                      <CrosshairIcon className="w-3.5 h-3.5 text-cyan-400" />
                    </div>
                    <div className="mt-2 text-3xl font-mono font-bold text-cyan-300 tabular-nums">
                      {animatedRules}
                    </div>
                    <div className="mt-1 text-xs text-cyan-400/70">
                      CIS-117 state machines
                    </div>
                  </div>
                </div>

                {/* Sub-banner: Engine Evaluation Mode */}
                <div className="p-3.5 rounded-lg bg-[#090D14] border border-border-subtle flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-slate-300">Local ACID SQLite Repository Active</span>
                  </div>
                  <div className="text-slate-500">
                    Sliding window: <span className="text-cyan-400">60s - 300s bounded</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Live Radar Scanner Widget (4 cols) */}
              <div className="lg:col-span-4">
                <RadarScanWidget />
              </div>
            </div>
          ) : (
            <div className="p-6 rounded-lg bg-panel-primary border border-slate-800 text-center text-xs font-mono text-slate-400">
              Backend offline. Metrics will update when the FastAPI service is active.
            </div>
          )}
        </div>
      </section>

      {/* --- 3. DETECTION CAPABILITIES --- */}
      <section
        id="capabilities"
        ref={capabilitiesView.ref}
        className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto"
      >
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="text-xs font-mono font-semibold uppercase tracking-wider text-cyan-400 mb-2">
            Deterministic Engine Capabilities
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-100 tracking-tight">
            Five Purpose-Built Detection Rules
          </h2>
          <p className="mt-3 text-sm text-slate-400 font-sans leading-relaxed">
            SentinelX does not rely on probabilistic guesses or opaque ML models. Every detection
            is governed by a deterministic, mathematically verifiable rule running over sliding
            temporal windows.
          </p>
        </div>

        {/* Rule Selector Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Rules Navigation List (5 cols) */}
          <div className="lg:col-span-5 space-y-2">
            {rulesCatalog.map((rule) => {
              const active = activeRuleId === rule.id
              return (
                <button
                  key={rule.id}
                  onClick={() => setActiveRuleId(rule.id)}
                  className={`w-full text-left p-4 rounded-lg border transition-all ${
                    active
                      ? 'bg-panel-secondary border-cyan-500/50 shadow-[0_0_20px_rgba(0,229,255,0.1)]'
                      : 'bg-panel-primary border-border-subtle hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-xs text-cyan-400">
                      {rule.id}
                    </span>
                    <SeverityBadge severity={rule.severity} />
                  </div>
                  <div className="text-sm font-semibold text-slate-200 mt-1">
                    {rule.name}
                  </div>
                  <div className="text-xs font-mono text-slate-500 mt-0.5 truncate">
                    {rule.condition}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Rule Detail Inspector (7 cols) */}
          <div className="lg:col-span-7 rounded-xl bg-panel-primary border border-border-subtle p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-border-subtle">
              <div>
                <span className="text-xs font-mono text-cyan-400 font-bold uppercase tracking-wider">
                  Rule Specification: {selectedRule.id}
                </span>
                <h3 className="text-xl font-bold text-slate-100 mt-0.5">
                  {selectedRule.name}
                </h3>
              </div>
              <SeverityBadge severity={selectedRule.severity} />
            </div>

            <div className="space-y-4 text-xs font-mono">
              <div className="p-3 rounded bg-panel-secondary border border-border-subtle">
                <div className="text-[10px] text-slate-400 uppercase font-bold">Objective & Security Context</div>
                <p className="mt-1 font-sans text-xs text-slate-300 leading-relaxed">
                  {selectedRule.description}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded bg-panel-secondary border border-border-subtle">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Correlation Criteria</div>
                  <div className="mt-1 text-cyan-300">{selectedRule.condition}</div>
                </div>

                <div className="p-3 rounded bg-panel-secondary border border-border-subtle">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Correlated Entities</div>
                  <div className="mt-1 text-slate-200">{selectedRule.entities}</div>
                </div>

                <div className="p-3 rounded bg-panel-secondary border border-border-subtle">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Kill-Chain Phase</div>
                  <div className="mt-1 text-slate-200">{selectedRule.category}</div>
                </div>

                <div className="p-3 rounded bg-panel-secondary border border-border-subtle">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Framework Mapping</div>
                  <div className="mt-1 text-slate-200">{selectedRule.technique}</div>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={onNavigateToDashboard}
                className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-cyan-400 hover:text-cyan-300"
              >
                Inspect live detections in Console →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* --- 3.5 OPERATIONAL THREAT SCENARIOS (CAROUSEL) --- */}
      <section
        id="scenarios"
        ref={scenariosView.ref}
        className={`py-20 px-4 sm:px-6 lg:px-8 border-t border-border-subtle bg-[#070A10]/70 transition-all duration-700 ${
          scenariosView.isInView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
        }`}
      >
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/50 border border-cyan-500/30 text-[11px] font-mono text-cyan-400 mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              FORENSIC CASE STUDIES
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-100 tracking-tight">
              Threat Scenarios in Action
            </h2>
            <p className="mt-3 text-sm text-slate-400 font-sans leading-relaxed">
              Explore how SentinelX automatically groups disparate raw telemetry, applies CIS-117
              sliding temporal windows, and reconstructs verifiable attack narratives with attached evidence.
            </p>
          </div>

          <ThreatScenarioCarousel onNavigateToDashboard={onNavigateToDashboard} />
        </div>
      </section>

      {/* --- 4. HOW CORRELATION WORKS --- */}
      <section
        id="how-it-works"
        ref={workflowView.ref}
        className="py-20 px-4 sm:px-6 lg:px-8 border-t border-border-subtle bg-[#0A0E17]/60"
      >
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="text-xs font-mono font-semibold uppercase tracking-wider text-cyan-400 mb-2">
              Processing Architecture
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-100 tracking-tight">
              From Raw Ingress to Evidence-Linked Alerts
            </h2>
            <p className="mt-3 text-sm text-slate-400 font-sans leading-relaxed">
              Every event is validated, normalized, and evaluated through an immutable correlation
              lifecycle designed for speed, reproducibility, and auditability.
            </p>
          </div>

          {/* Workflow Steps Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            {[
              {
                step: '01',
                title: 'Event Ingestion',
                desc: 'Receives single JSON, JSON arrays, or streaming JSONL through /api/events/ingest.',
                icon: <UploadCloudIcon className="w-5 h-5 text-cyan-400" />,
              },
              {
                step: '02',
                title: 'Normalization',
                desc: 'Maps schemas into canonical vocabulary: timestamps, IP addresses, ports, and identities.',
                icon: <TerminalIcon className="w-5 h-5 text-sky-400" />,
              },
              {
                step: '03',
                title: 'Sliding Windows',
                desc: 'Groups events strictly into bounded temporal windows (60s to 300s) to prevent memory leaks.',
                icon: <ClockIcon className="w-5 h-5 text-amber-400" />,
              },
              {
                step: '04',
                title: 'Pure Rule Engine',
                desc: 'Executes five deterministic correlation functions against chronological EventViews.',
                icon: <CrosshairIcon className="w-5 h-5 text-orange-400" />,
              },
              {
                step: '05',
                title: 'Evidence Linking',
                desc: 'Attaches exact primary key arrays of triggering events directly into alert records.',
                icon: <FileTextIcon className="w-5 h-5 text-rose-400" />,
              },
              {
                step: '06',
                title: 'Analyst Triage',
                desc: 'Allows security analysts to inspect evidence, adjust lifecycle states, and run manual evaluations.',
                icon: <ShieldAlertIcon className="w-5 h-5 text-emerald-400" />,
              },
            ].map((st) => (
              <div
                key={st.step}
                className="p-5 rounded-lg bg-panel-primary border border-border-subtle flex flex-col justify-between relative group hover:border-cyan-500/40 transition-all"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-mono font-bold text-slate-500">
                      STAGE {st.step}
                    </span>
                    {st.icon}
                  </div>
                  <h4 className="text-sm font-semibold text-slate-200">
                    {st.title}
                  </h4>
                  <p className="mt-2 text-xs text-slate-400 font-sans leading-relaxed">
                    {st.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- 5. ALERT INVESTIGATION & EVIDENCE MODEL PREVIEW --- */}
      <section
        id="evidence"
        ref={evidenceView.ref}
        className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          {/* Left Text */}
          <div className="lg:col-span-5 space-y-5">
            <div className="text-xs font-mono font-semibold uppercase tracking-wider text-cyan-400">
              Auditability By Design
            </div>
            <h2 className="text-3xl font-extrabold text-slate-100 tracking-tight">
              Every Alert Points to Verifiable Evidence
            </h2>
            <p className="text-sm text-slate-400 font-sans leading-relaxed">
              In high-stakes incident response, an alert without evidence is useless. SentinelX
              eliminates ambiguity by storing exact primary keys of every contributing telemetry
              event directly inside the alert record.
            </p>

            <div className="space-y-3 pt-2 text-xs font-mono text-slate-300">
              <div className="flex items-start gap-2.5">
                <CheckCircleIcon className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <span>Deterministic SHA-256 fingerprint deduplication prevents alert storms.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircleIcon className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <span>One-click deep inspection of original, unadulterated JSON raw payloads.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <CheckCircleIcon className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <span>Complete lifecycle auditing: Open → Investigating → Resolved.</span>
              </div>
            </div>

            <div className="pt-3">
              <button
                onClick={onNavigateToDashboard}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 font-mono text-xs font-bold hover:bg-cyan-900/60 transition-all"
              >
                Test Evidence Inspector in Dashboard →
              </button>
            </div>
          </div>

          {/* Right Simulated Evidence HUD Card */}
          <div className="lg:col-span-7 rounded-xl bg-panel-primary border border-cyan-500/30 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <ShieldAlertIcon className="w-4 h-4 text-rose-400" />
                <span className="font-mono text-xs font-bold text-slate-100">
                  Incident #3: Failed Logins Followed by Success
                </span>
              </div>
              <SeverityBadge severity="critical" />
            </div>

            <div className="p-3 rounded bg-panel-secondary border border-border-subtle text-xs font-mono space-y-1">
              <div className="text-cyan-300 font-sans font-medium">
                Reason: 5 failed login(s) followed by successful login for alice within 300s.
              </div>
              <div className="text-slate-400 text-[11px]">
                Target: alice | Source IP: 192.168.1.50 | Fingerprint: 4f18a902...
              </div>
            </div>

            {/* Resolved Evidence Events Preview */}
            <div className="space-y-2">
              <div className="text-[11px] font-mono font-semibold text-slate-400 uppercase">
                Resolved Evidence Records (6 Events):
              </div>
              <div className="space-y-1.5 font-mono text-xs">
                {[
                  { id: 17, uid: 'd-fs0', type: 'authentication_failure', time: '11:02:10Z' },
                  { id: 18, uid: 'd-fs1', type: 'authentication_failure', time: '11:02:15Z' },
                  { id: 19, uid: 'd-fs2', type: 'authentication_failure', time: '11:02:22Z' },
                  { id: 22, uid: 'd-fs5', type: 'authentication_success', time: '11:02:40Z', critical: true },
                ].map((e) => (
                  <div
                    key={e.id}
                    className={`p-2 rounded border flex items-center justify-between ${
                      e.critical
                        ? 'bg-rose-950/20 border-rose-600/40 text-rose-300'
                        : 'bg-panel-secondary border-border-subtle text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-cyan-400">#{e.id}</span>
                      <span>{e.type}</span>
                    </div>
                    <span className="text-[11px] text-slate-400">{e.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- 6. ARCHITECTURE SECTION --- */}
      <section
        id="architecture"
        ref={architectureView.ref}
        className="py-20 px-4 sm:px-6 lg:px-8 border-t border-border-subtle bg-[#0A0E17]/80"
      >
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <div className="text-xs font-mono font-semibold uppercase tracking-wider text-cyan-400 mb-2">
              Technical Design
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-100 tracking-tight">
              SentinelX System Architecture
            </h2>
            <p className="mt-3 text-sm text-slate-400 font-sans leading-relaxed">
              Clean separation of concerns: High-throughput ingestion, strictly isolated normalization,
              pure deterministic rule evaluators, and a reactive analyst UI.
            </p>
          </div>

          {/* Architecture Visual Grid */}
          <div className="p-6 md:p-8 rounded-xl bg-panel-primary border border-border-subtle space-y-6 shadow-2xl">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-mono">
              {/* Layer 1: Ingress */}
              <div className="p-4 rounded-lg bg-panel-secondary border border-border-subtle space-y-2">
                <div className="text-[10px] text-cyan-400 font-bold uppercase">1. Ingress Layer</div>
                <div className="font-semibold text-slate-100">FastAPI Endpoints</div>
                <div className="text-slate-400 text-[11px] font-sans">
                  • Single JSON Record<br />
                  • JSON Batch Array<br />
                  • Multipart JSONL Upload
                </div>
              </div>

              {/* Layer 2: Normalization */}
              <div className="p-4 rounded-lg bg-panel-secondary border border-border-subtle space-y-2">
                <div className="text-[10px] text-sky-400 font-bold uppercase">2. Normalization</div>
                <div className="font-semibold text-slate-100">Vocab Validator</div>
                <div className="text-slate-400 text-[11px] font-sans">
                  • Canonical event vocab<br />
                  • ISO-8601 UTC parser<br />
                  • IP & Port format guards
                </div>
              </div>

              {/* Layer 3: Persistence & Engine */}
              <div className="p-4 rounded-lg bg-panel-secondary border border-border-subtle space-y-2">
                <div className="text-[10px] text-orange-400 font-bold uppercase">3. Core Engine</div>
                <div className="font-semibold text-slate-100">Deterministic Engine</div>
                <div className="text-slate-400 text-[11px] font-sans">
                  • Bounded sliding windows<br />
                  • Pure rule evaluations<br />
                  • Fingerprint deduplication
                </div>
              </div>

              {/* Layer 4: Storage & Presentation */}
              <div className="p-4 rounded-lg bg-panel-secondary border border-border-subtle space-y-2">
                <div className="text-[10px] text-emerald-400 font-bold uppercase">4. Interface</div>
                <div className="font-semibold text-slate-100">React 19 Console</div>
                <div className="text-slate-400 text-[11px] font-sans">
                  • Dark SIEM Dashboard UI<br />
                  • Real-time chart telemetry<br />
                  • Evidence audit trails
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded bg-panel-secondary border border-border-subtle flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-slate-400">
              <span className="flex items-center gap-2">
                <DatabaseIcon className="w-4 h-4 text-cyan-400" />
                Persistence: Local SQLite (`sentinelx.db`) · Zero External Cloud Dependencies
              </span>
              <span className="text-slate-500">FastAPI 0.115+ · SQLAlchemy 2.0 · React 19</span>
            </div>
          </div>
        </div>
      </section>

      {/* --- 7. FINAL CALL TO ACTION --- */}
      <section
        ref={ctaView.ref}
        className="py-24 px-4 sm:px-6 lg:px-8 text-center max-w-4xl mx-auto"
      >
        <div className="p-8 sm:p-12 rounded-2xl bg-linear-to-b from-panel-primary to-[#0A0E17] border border-cyan-500/40 shadow-[0_0_60px_rgba(0,229,255,0.12)] space-y-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-cyan-950/80 border border-cyan-500/50 text-cyan-400 mx-auto">
            <CrosshairIcon className="w-6 h-6" />
          </div>

          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-100 tracking-tight">
            Turn Security Events Into Actionable Evidence.
          </h2>

          <p className="text-sm sm:text-base text-slate-400 font-sans max-w-xl mx-auto leading-relaxed">
            Eliminate alert fatigue and black-box guesses. Experience deterministic SIEM correlation
            built for rigorous security operations.
          </p>

          <div className="pt-2">
            <button
              onClick={onNavigateToDashboard}
              className="inline-flex items-center gap-2.5 px-8 py-3.5 rounded-lg bg-cyan-500 text-slate-950 font-mono font-bold text-sm hover:bg-cyan-400 shadow-[0_0_30px_rgba(0,229,255,0.35)] transition-all hover:scale-105"
            >
              <ShieldAlertIcon className="w-4 h-4" />
              Open Security Console
            </button>
          </div>
        </div>
      </section>

      {/* --- 8. FOOTER --- */}
      <footer className="border-t border-border-subtle bg-[#06080D] py-12 px-4 sm:px-6 lg:px-8 text-xs font-mono text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-cyan-950/70 border border-cyan-500/40 text-cyan-400 flex items-center justify-center">
              <CrosshairIcon className="w-3.5 h-3.5" />
            </div>
            <div className="font-bold text-slate-300">
              SENTINEL<span className="text-cyan-400">X</span> SIEM
            </div>
            <span>· CIS-117 Compliance Engine</span>
          </div>

          <div className="flex items-center gap-6">
            <button
              onClick={onNavigateToDashboard}
              className="hover:text-cyan-400 transition-colors"
            >
              Console
            </button>
            <a href="#capabilities" className="hover:text-cyan-400 transition-colors">
              Capabilities
            </a>
            <a href="#scenarios" className="hover:text-cyan-400 transition-colors">
              Scenarios
            </a>
            <a href="#how-it-works" className="hover:text-cyan-400 transition-colors">
              Workflow
            </a>
            <a href="#architecture" className="hover:text-cyan-400 transition-colors">
              Architecture
            </a>
          </div>

          <div className="text-[11px] text-slate-600">
            Engine v0.1.0 · Local SQLite Development Telemetry
          </div>
        </div>
      </footer>
    </div>
  )
}
