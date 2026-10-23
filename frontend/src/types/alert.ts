import type { EventResponse } from './event'

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export type AlertStatus =
  | 'open'
  | 'acknowledged'
  | 'investigating'
  | 'resolved'
  | 'false_positive'
  | 'closed'

export interface RuleOverride {
  enabled?: boolean
  params?: Record<string, number>
}

export interface EvaluateRequest {
  rules?: Record<string, RuleOverride>
}

export interface EvaluatedAlertRef {
  id: number
  fingerprint: string
  rule_id: string
  state: 'created' | 'updated' | 'unchanged' | string
}

export interface CorrelationSourceNode {
  entity_type: string
  entity_value: string
  event_count: number
  event_types: string[]
}

export interface CorrelationRuleNode {
  rule_id: string
  rule_name: string
  severity: string
  matched_event_count: number
  source_entities: string[]
  alert_ids: number[]
}

export interface CorrelationEdge {
  source: string
  target: string
  weight: number
  edge_type: 'event_to_rule' | 'rule_to_alert'
}

export interface CorrelationMap {
  source_nodes: CorrelationSourceNode[]
  rule_nodes: CorrelationRuleNode[]
  alert_nodes: EvaluatedAlertRef[]
  edges: CorrelationEdge[]
}

export interface EvaluateSummary {
  events_evaluated: number
  rules_enabled: string[]
  detections: number
  alerts_created: number
  alerts_updated: number
  alerts_unchanged: number
  alerts: EvaluatedAlertRef[]
  correlation_map?: CorrelationMap
}

export interface AlertResponse {
  id: number
  fingerprint: string
  rule_id: string
  rule_name: string
  severity: AlertSeverity
  description: string
  status: AlertStatus
  source_ip: string | null
  username: string | null
  host: string | null
  matched_count: number
  evidence_event_ids: number[]
  explanation: Record<string, unknown>
  is_synthetic: boolean
  first_observed: string
  last_observed: string
  detected_at: string
  created_at: string
  updated_at: string
}

export interface AlertDetailResponse extends AlertResponse {
  evidence: EventResponse[]
}

export interface AlertListResponse {
  total: number
  limit: number
  offset: number
  items: AlertResponse[]
}

export interface AlertStatsResponse {
  total_alerts: number
  by_severity: Record<string, number>
  by_status: Record<string, number>
  by_rule: Record<string, number>
}

export interface PatchAlertRequest {
  status: AlertStatus
}

export interface RuleInfo {
  id: string
  name: string
  description: string
  severity: AlertSeverity
  enabled: boolean
  params: Record<string, number>
}
