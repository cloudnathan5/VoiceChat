import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    host: true, // Bind to all interfaces
    strictPort: true, // Don't fallback to other ports
    https: {
      key: fs.readFileSync('.vite-certs/server.key'),
      cert: fs.readFileSync('.vite-certs/server.crt'),
    },
    allowedHosts: [
      'optiplex.local',
      'localhost',
      '10.0.0.251',
      '10.50.0.1',
    ],
    proxy: {
      '/api': {
        target: 'http://10.0.0.251:4001',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'http://10.0.0.251:4001',
        changeOrigin: true,
        ws: true
      }
    }
  }
})