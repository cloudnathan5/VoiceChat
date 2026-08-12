import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

const CERT_DIR = '.vite-certs'

/**
 * Dev-only HTTPS.
 *
 * getUserMedia and SpeechRecognition require a secure context, so testing
 * voice from a phone on the LAN needs a certificate. Generate one with:
 *
 *   mkcert -key-file .vite-certs/server.key -cert-file .vite-certs/server.crt \
 *     localhost 192.168.1.x
 *
 * Reading these unconditionally — as this config used to — meant a fresh clone
 * could not run `npm run dev` at all, because the certificates are (rightly)
 * not in the repository.
 */
function devHttps() {
  try {
    return {
      key: fs.readFileSync(path.join(CERT_DIR, 'server.key')),
      cert: fs.readFileSync(path.join(CERT_DIR, 'server.crt')),
    }
  } catch {
    return undefined
  }
}

export default defineConfig(({ mode }) => ({
  // The demo is served from a GitHub Pages project path, so assets have to be
  // referenced relatively; an absolute /assets/… resolves to the domain root
  // and 404s. This is what the "use relative paths" hand-edit was doing to
  // every build by hand.
  base: './',

  plugins: [react()],

  build: {
    // `--mode demo` publishes straight into the directory Pages deploys,
    // which also clears out superseded bundles instead of accumulating them.
    outDir: mode === 'demo' ? '../demo' : 'dist',
    emptyOutDir: true,
  },

  server: {
    port: 3001,
    host: true,
    strictPort: true,
    https: devHttps(),
    // Comma-separated, for reaching the dev server by LAN hostname.
    allowedHosts: (process.env.VITE_ALLOWED_HOSTS || '').split(',').filter(Boolean),
  },
}))
