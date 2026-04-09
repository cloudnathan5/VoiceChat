import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    host: true, // Bind to all interfaces
    strictPort: true, // Don't fallback to other ports
    allowedHosts: [
      'optiplex.local',
      'localhost'
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:4001',
        changeOrigin: true
      }
    }
  }
})