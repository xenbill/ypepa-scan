import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Build straight into the ASP.NET app's wwwroot — one deployable, no CDN.
// target es2015 keeps the bundle runnable on older browsers/PCs.
export default defineConfig({
  plugins: [react()],
  // Shown in Οδηγίες → Έκδοση & αλλαγές next to APP_VERSION (src/version.ts).
  define: { __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)) },
  build: {
    target: 'es2015',
    outDir: '../backend/wwwroot',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:5580',
      '/tiles': 'http://localhost:5580',
    },
  },
})
