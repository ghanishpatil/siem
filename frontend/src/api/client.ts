import type { HealthResponse } from '../types/health'
import type {
  AlertDetailResponse,
  AlertListResponse,
  AlertResponse,
  AlertStatsResponse,
  AlertStatus,
  EvaluateRequest,
  EvaluateSummary,
  RuleInfo,
} from '../types/alert'
import type {
  EventListResponse,
  EventResponse,
  IngestSummary,
  StatsResponse,
} from '../types/event'

/**
 * Resolve the API base URL.
 *
 * - Development: `VITE_API_BASE_URL` is unset, so the base is the relative
 *   `/api` path, which the Vite dev server proxies to the local backend.
 * - Production (Vercel): set `VITE_API_BASE_URL` to the backend origin (the
 *   Railway URL). The client appends `/api`, so a doubled `/api` and trailing
 *   slashes are both handled. No localhost value is ever used as a fallback.
 */
function resolveApiBase(): string {
  let base = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')
  if (base.toLowerCase().endsWith('/api')) {
    base = base.slice(0, -'/api'.length).replace(/\/+$/, '')
  }
  if (import.meta.env.PROD && !base) {
    // Surface a misconfigured production build loudly rather than silently
    // targeting the Vercel origin (which has no backend) or any localhost URL.
    console.error(
      '[SentinelX] VITE_API_BASE_URL is not set for this production build. API ' +
        'requests will target this site origin and fail. Configure VITE_API_BASE_URL ' +
        'in the Vercel project settings to the Railway backend URL.'
    )
  }
  return `${base}/api`
}

const API_BASE = resolveApiBase()

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorDetail = `HTTP ${res.status}`
    try {
      const errJson = await res.json()
      if (errJson && typeof errJson.detail === 'string') {
        errorDetail = errJson.detail
      } else if (errJson && typeof errJson.message === 'string') {
        errorDetail = errJson.message
      }
    } catch {
      // not JSON
    }
    throw new Error(errorDetail)
  }
  return res.json() as Promise<T>
}

// ---------------- Health ----------------
export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/health`, { signal })
  return handleResponse<HealthResponse>(res)
}

// ---------------- Alerts ----------------
export interface ListAlertsParams {
  limit?: number
  offset?: number
  severity?: string
  status?: string
  rule_id?: string
}

export async function listAlerts(
  params: ListAlertsParams = {},
  signal?: AbortSignal
): Promise<AlertListResponse> {
  const query = new URLSearchParams()
  if (params.limit !== undefined) query.set('limit', String(params.limit))
  if (params.offset !== undefined) query.set('offset', String(params.offset))
  if (params.severity) query.set('severity', params.severity)
  if (params.status) query.set('status', params.status)
  if (params.rule_id) query.set('rule_id', params.rule_id)

  const url = `${API_BASE}/alerts${query.toString() ? `?${query.toString()}` : ''}`
  const res = await fetch(url, { signal })
  return handleResponse<AlertListResponse>(res)
}

export async function getAlertStats(signal?: AbortSignal): Promise<AlertStatsResponse> {
  const res = await fetch(`${API_BASE}/alerts/stats`, { signal })
  return handleResponse<AlertStatsResponse>(res)
}

export async function getAlert(alertId: number, signal?: AbortSignal): Promise<AlertDetailResponse> {
  const res = await fetch(`${API_BASE}/alerts/${alertId}`, { signal })
  return handleResponse<AlertDetailResponse>(res)
}

export async function patchAlertStatus(
  alertId: number,
  status: AlertStatus
): Promise<AlertResponse> {
  const res = await fetch(`${API_BASE}/alerts/${alertId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  return handleResponse<AlertResponse>(res)
}

export async function evaluateAlerts(payload?: EvaluateRequest): Promise<EvaluateSummary> {
  const res = await fetch(`${API_BASE}/alerts/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined,
  })
  return handleResponse<EvaluateSummary>(res)
}

export async function listRules(signal?: AbortSignal): Promise<RuleInfo[]> {
  const res = await fetch(`${API_BASE}/alerts/rules`, { signal })
  return handleResponse<RuleInfo[]>(res)
}

// ---------------- Events ----------------
export interface ListEventsParams {
  limit?: number
  offset?: number
  event_type?: string
  severity?: string
  source_ip?: string
}

export async function listEvents(
  params: ListEventsParams = {},
  signal?: AbortSignal
): Promise<EventListResponse> {
  const query = new URLSearchParams()
  if (params.limit !== undefined) query.set('limit', String(params.limit))
  if (params.offset !== undefined) query.set('offset', String(params.offset))
  if (params.event_type) query.set('event_type', params.event_type)
  if (params.severity) query.set('severity', params.severity)
  if (params.source_ip) query.set('source_ip', params.source_ip)

  const url = `${API_BASE}/events${query.toString() ? `?${query.toString()}` : ''}`
  const res = await fetch(url, { signal })
  return handleResponse<EventListResponse>(res)
}

export async function getEventStats(signal?: AbortSignal): Promise<StatsResponse> {
  const res = await fetch(`${API_BASE}/events/stats`, { signal })
  return handleResponse<StatsResponse>(res)
}

export async function getEvent(eventId: number, signal?: AbortSignal): Promise<EventResponse> {
  const res = await fetch(`${API_BASE}/events/${eventId}`, { signal })
  return handleResponse<EventResponse>(res)
}

// ---------------- Ingestion ----------------
export async function ingestJsonEvents(data: unknown): Promise<{ status: number; summary: IngestSummary }> {
  const res = await fetch(`${API_BASE}/events/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof data === 'string' ? data : JSON.stringify(data),
  })
  const summary = (await res.json()) as IngestSummary
  if (!res.ok && res.status !== 207 && res.status !== 400) {
    throw new Error(`Ingest failed: HTTP ${res.status}`)
  }
  return { status: res.status, summary }
}

export async function ingestJsonlFile(file: File): Promise<{ status: number; summary: IngestSummary }> {
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch(`${API_BASE}/events/ingest`, {
    method: 'POST',
    body: formData,
  })
  const summary = (await res.json()) as IngestSummary
  if (!res.ok && res.status !== 207 && res.status !== 400) {
    throw new Error(`File ingest failed: HTTP ${res.status}`)
  }
  return { status: res.status, summary }
}
