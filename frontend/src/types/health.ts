// Mirrors the backend HealthResponse schema (app/schemas/health.py).
export interface HealthResponse {
  status: string
  app: string
  version: string
  environment: string
  database: string
  timestamp: string
}
