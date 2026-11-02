import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  server: { host: '0.0.0.0', port: 3002, strictPort: true },
  plugins: [tanstackStart({ spa: { enabled: true, prerender: { outputPath: '/index.html' } }, router: { routeTreeFileHeader: [] } }), react()],
})
