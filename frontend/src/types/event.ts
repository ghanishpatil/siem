export type EventSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export interface EventResponse {
  id: number
  event_uid: string
  timestamp: string
  event_type: string
  source_ip: string | null
  destination_ip: string | null
  destination_port: number | null
  username: string | null
  host: string | null
  source: string
  severity: EventSeverity
  is_synthetic: boolean
  raw_event: Record<string, unknown>
  created_at: string
}

export interface EventListResponse {
  total: number
  limit: number
  offset: number
  items: EventResponse[]
}

export interface StatsResponse {
  total_events: number
  by_event_type: Record<string, number>
  by_severity: Record<string, number>
  recent_event_count: number
  recent_window_hours: number
  synthetic_count: number
  real_count: number
}

export interface FieldError {
  field: string
  message: string
}

export interface RejectedRecord {
  index: number
  event_uid?: string | null
  errors: FieldError[]
}

export interface AcceptedRecord {
  index: number
  id: number
  event_uid: string
}

export interface DuplicateRecord {
  index: number
  event_uid: string
}

export interface IngestSummary {
  received_count: number
  accepted_count: number
  rejected_count: number
  duplicate_count: number
  accepted: AcceptedRecord[]
  duplicates: DuplicateRecord[]
  rejected: RejectedRecord[]
}
