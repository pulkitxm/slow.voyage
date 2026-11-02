import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { reviewFiles } from './scripts/review-plugin.ts'

export default defineConfig({
  server: { host: '0.0.0.0', port: 3002, strictPort: true },
  plugins: [
    reviewFiles(),
    tanstackStart({
      prerender: {
        enabled: true,
        crawlLinks: false,
        autoStaticPathsDiscovery: false,
        failOnError: true,
      },
      pages: [{ path: '/' }],
      router: { routeTreeFileHeader: [] },
    }),
    react(),
  ],
})
