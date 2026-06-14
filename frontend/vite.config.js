import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// During dev, proxy API calls to the FastAPI backend so the frontend can call
// "/api/..." with no CORS friction and no hardcoded host.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true, // always use 5173 (fail loudly) instead of silently shifting to 5174
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
