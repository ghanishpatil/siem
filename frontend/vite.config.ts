import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// During development the frontend talks to the backend only through this proxy:
// requests to /api are forwarded to the FastAPI service. This keeps the browser
// on a single origin and mirrors how the app is wired in production.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const frontendPort = parseInt(env.VITE_PORT || '5173', 10)
  const backendPort = parseInt(env.VITE_BACKEND_PORT || '8000', 10)

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: frontendPort,
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${backendPort}`,
          changeOrigin: true,
        },
      },
    },
  }
})
