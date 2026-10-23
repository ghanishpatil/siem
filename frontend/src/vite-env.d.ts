/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base origin of the backend API for production builds (for example the
   * Railway URL, e.g. "https://sentinelx-api.up.railway.app"). Leave this unset
   * in development so API requests use the relative "/api" path handled by the
   * Vite dev proxy. Do NOT include a trailing "/api" — the API client appends it.
   * This value is embedded into the public frontend bundle, so it must never
   * contain secrets.
   */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
