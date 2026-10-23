import { useMemo, useState } from 'react'
import type { CorrelationMap, CorrelationEdge } from '../../types/alert'

interface CorrelationGraphProps {
  data: CorrelationMap
  animated: boolean
  onSelectAlert?: (alertId: number) => void
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#FF4757',
  high: '#FF8A3D',
  medium: '#F5C451',
  low: '#4DA3FF',
  info: '#00E5FF',
}

interface GraphNode {
  id: string
  label: string
  sublabel: string
  x: number
  y: number
  type: 'source' | 'rule' | 'alert'
  color: string
  severity?: string
  count?: number
}

interface GraphEdge {
  id: string
  from: string
  to: string
  weight: number
  color: string
}

export function CorrelationGraph({ data, animated, onSelectAlert }: CorrelationGraphProps) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  const { nodes, edges, width, height } = useMemo(() => {
    const sources = data.source_nodes ?? []
    const rules = (data.rule_nodes ?? []).filter(r => r.matched_event_count > 0)
    const alerts = data.alert_nodes ?? []

    // Layout constants
    const rowGap = 70           // vertical gap between node centers
    const colX = [160, 460, 760] // x-center of each column
    const topPad = 50

    const maxRows = Math.max(sources.length, rules.length, alerts.length, 1)
    const w = 920
    const h = topPad + maxRows * rowGap + 60

    function columnY(count: number, index: number) {
      const totalH = (count - 1) * rowGap
      const startY = topPad + (h - topPad - 60 - totalH) / 2
      return startY + index * rowGap
    }

    const graphNodes: GraphNode[] = []

    // Column 1 – Source entities
    sources.forEach((src, i) => {
      graphNodes.push({
        id: `${src.entity_type}:${src.entity_value}`,
        label: src.entity_value.length > 18 ? src.entity_value.slice(0, 16) + '…' : src.entity_value,
        sublabel: `${src.event_count} events`,
        x: colX[0],
        y: columnY(sources.length, i),
        type: 'source',
        color: '#00E5FF',
        count: src.event_count,
      })
    })

    // Column 2 – Detection rules (only those with hits)
    rules.forEach((rule, i) => {
      const sev = rule.severity || 'medium'
      graphNodes.push({
        id: rule.rule_id,
        label: rule.rule_id,
        sublabel: `${rule.matched_event_count} matched`,
        x: colX[1],
        y: columnY(rules.length, i),
        type: 'rule',
        color: SEVERITY_COLORS[sev] || '#F5C451',
        severity: sev,
        count: rule.matched_event_count,
      })
    })

    // Column 3 – Alerts
    alerts.forEach((a, i) => {
      const ruleMatch = rules.find(r => r.rule_id === a.rule_id)
      const sev = ruleMatch?.severity || 'medium'
      graphNodes.push({
        id: `alert:${a.id}`,
        label: `Alert #${a.id}`,
        sublabel: a.rule_id,
        x: colX[2],
        y: columnY(alerts.length, i),
        type: 'alert',
        color: a.state === 'created' ? '#FF4757' : (SEVERITY_COLORS[sev] || '#F5C451'),
        severity: sev,
      })
    })

    // Edges
    const nodeMap = new Map(graphNodes.map(n => [n.id, n]))
    const rawEdges: CorrelationEdge[] = data.edges ?? []

    // Deduplicate edges with same source→target
    const edgeMap = new Map<string, { raw: CorrelationEdge; weight: number }>()
    for (const e of rawEdges) {
      const key = `${e.source}→${e.target}`
      const existing = edgeMap.get(key)
      if (existing) {
        existing.weight += e.weight
      } else {
        edgeMap.set(key, { raw: e, weight: e.weight })
      }
    }

    const graphEdges: GraphEdge[] = []
    let edgeIdx = 0
    for (const [, { raw, weight }] of edgeMap) {
      const from = nodeMap.get(raw.source)
      const to = nodeMap.get(raw.target)
      if (!from || !to) continue
      const sev = (to.severity || from.severity || 'info')
      graphEdges.push({
        id: `e-${edgeIdx++}`,
        from: raw.source,
        to: raw.target,
        weight,
        color: SEVERITY_COLORS[sev] || '#00E5FF',
      })
    }

    return { nodes: graphNodes, edges: graphEdges, width: w, height: h }
  }, [data])

  const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes])

  // Which nodes are connected to the hovered one?
  const connectedIds = useMemo(() => {
    if (!hoveredNode) return null
    const ids = new Set<string>([hoveredNode])
    for (const e of edges) {
      if (e.from === hoveredNode || e.to === hoveredNode) {
        ids.add(e.from)
        ids.add(e.to)
      }
    }
    return ids
  }, [hoveredNode, edges])

  function bezier(x1: number, y1: number, x2: number, y2: number) {
    const mx = (x1 + x2) / 2
    return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`
  }

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-xs font-mono text-slate-500">
        No correlation data to visualize.
      </div>
    )
  }

  const R = 22

  return (
    <div className="w-full rounded-lg border border-border-subtle bg-[#080d16] overflow-hidden">
      {/* Column headers */}
      <div className="flex px-6 pt-3 pb-2 text-[10px] font-mono uppercase tracking-widest text-slate-500 border-b border-border-subtle bg-[#0a1019]">
        <div className="flex items-center gap-2" style={{ width: '33%' }}>
          <span className="w-2 h-2 rounded-full bg-cyan-400" /> Event Sources ({data.source_nodes?.length ?? 0})
        </div>
        <div className="flex items-center gap-2 justify-center" style={{ width: '34%' }}>
          <span className="w-2 h-2 rounded-full bg-amber-400" /> Detection Rules
        </div>
        <div className="flex items-center gap-2 justify-end" style={{ width: '33%' }}>
          <span className="w-2 h-2 rounded-full bg-rose-400" /> Alerts ({data.alert_nodes?.length ?? 0})
        </div>
      </div>

      {/* Scrollable SVG area */}
      <div className="overflow-y-auto" style={{ maxHeight: '520px' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          className="w-full"
          style={{ minHeight: `${Math.min(height, 320)}px` }}
        >
          <defs>
            {Object.entries(SEVERITY_COLORS).map(([sev, color]) => (
              <filter key={sev} id={`glow-${sev}`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="blur" />
                <feFlood floodColor={color} floodOpacity="0.5" result="color" />
                <feComposite in="color" in2="blur" operator="in" result="shadow" />
                <feMerge>
                  <feMergeNode in="shadow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            ))}
            <filter id="glow-src" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="blur" />
              <feFlood floodColor="#00E5FF" floodOpacity="0.5" result="color" />
              <feComposite in="color" in2="blur" operator="in" result="shadow" />
              <feMerge>
                <feMergeNode in="shadow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Subtle grid */}
          <g opacity="0.03">
            {Array.from({ length: Math.ceil(height / 40) }).map((_, i) => (
              <line key={`h${i}`} x1="0" y1={i * 40} x2={width} y2={i * 40} stroke="#00E5FF" />
            ))}
            {Array.from({ length: Math.ceil(width / 40) }).map((_, i) => (
              <line key={`v${i}`} x1={i * 40} y1="0" x2={i * 40} y2={height} stroke="#00E5FF" />
            ))}
          </g>

          {/* ── Edges ── */}
          {edges.map((edge) => {
            const from = nodeMap.get(edge.from)
            const to = nodeMap.get(edge.to)
            if (!from || !to) return null

            const isActive = connectedIds
              ? connectedIds.has(edge.from) && connectedIds.has(edge.to)
              : true
            const dim = connectedIds != null && !isActive
            const sw = Math.max(1.5, Math.min(edge.weight / 2, 6))
            const d = bezier(from.x + R, from.y, to.x - R, to.y)

            return (
              <g key={edge.id} opacity={dim ? 0.08 : 1} style={{ transition: 'opacity .25s' }}>
                {/* glow */}
                <path d={d} fill="none" stroke={edge.color} strokeWidth={sw + 4} opacity={isActive && connectedIds ? 0.2 : 0.06} strokeLinecap="round" />
                {/* line */}
                <path d={d} fill="none" stroke={edge.color} strokeWidth={sw} opacity={0.6} strokeLinecap="round" />
                {/* animated dash */}
                {animated && (
                  <path d={d} fill="none" stroke={edge.color} strokeWidth={sw} strokeDasharray="5 9" strokeLinecap="round" opacity={0.4}>
                    <animate attributeName="stroke-dashoffset" from="0" to="-28" dur="1s" repeatCount="indefinite" />
                  </path>
                )}
                {/* weight label on hover */}
                {connectedIds && isActive && (
                  <text
                    x={(from.x + to.x) / 2}
                    y={(from.y + to.y) / 2 - 8}
                    textAnchor="middle"
                    fill={edge.color}
                    fontSize="10"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    {edge.weight} evts
                  </text>
                )}
              </g>
            )
          })}

          {/* ── Nodes ── */}
          {nodes.map((node) => {
            const dim = connectedIds != null && !connectedIds.has(node.id)
            const isHovered = hoveredNode === node.id

            return (
              <g
                key={node.id}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => {
                  if (node.type === 'alert' && onSelectAlert) {
                    const id = parseInt(node.label.replace('Alert #', ''), 10)
                    if (!isNaN(id)) onSelectAlert(id)
                  }
                }}
                style={{ cursor: node.type === 'alert' ? 'pointer' : 'default', transition: 'opacity .25s' }}
                opacity={dim ? 0.15 : 1}
              >
                {/* Pulse ring */}
                {animated && !dim && (node.count ?? 0) > 0 && (
                  <circle cx={node.x} cy={node.y} r={R + 4} fill="none" stroke={node.color} strokeWidth="1.5" opacity="0">
                    <animate attributeName="r" from={String(R)} to={String(R + 14)} dur="2.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.45" to="0" dur="2.5s" repeatCount="indefinite" />
                  </circle>
                )}

                {/* Circle */}
                <circle
                  cx={node.x} cy={node.y} r={R}
                  fill="#0c1830"
                  stroke={node.color}
                  strokeWidth={isHovered ? 2.5 : 1.5}
                  filter={isHovered ? `url(#glow-${node.severity || 'src'})` : undefined}
                />

                {/* Inner symbol */}
                {node.type === 'source' && (
                  <text x={node.x} y={node.y + 1} textAnchor="middle" dominantBaseline="middle" fill={node.color} fontSize="9" fontFamily="monospace" fontWeight="bold">IP</text>
                )}
                {node.type === 'rule' && (
                  <text x={node.x} y={node.y + 1} textAnchor="middle" dominantBaseline="middle" fill={node.color} fontSize="8" fontFamily="monospace" fontWeight="bold">RULE</text>
                )}
                {node.type === 'alert' && (
                  <text x={node.x} y={node.y + 2} textAnchor="middle" dominantBaseline="middle" fill={node.color} fontSize="12" fontFamily="monospace" fontWeight="bold">!</text>
                )}

                {/* Labels */}
                <text x={node.x} y={node.y + R + 14} textAnchor="middle" fill="#E2E8F0" fontSize="10" fontFamily="monospace" fontWeight="bold">
                  {node.label}
                </text>
                <text x={node.x} y={node.y + R + 25} textAnchor="middle" fill="#64748B" fontSize="9" fontFamily="monospace">
                  {node.sublabel}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
